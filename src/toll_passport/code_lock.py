"""Server half of the 6-digit book code. Reference implementation, stdlib only.

The browser stretches the code (PBKDF2-SHA256, >= 600,000 rounds, per-book
salt) and splits the result into ``auth`` and ``kekPart``. Only ``auth``
reaches the server. The server keeps a verifier, HMAC-SHA256(pepper, auth),
and a random 32-byte share S that it encrypts at rest. S is released only
after the right code. The browser needs kekPart AND S to unwrap the book key,
so neither the server nor a guessed salt alone opens the book.

Ten wrong codes turn the code off. A per-book per-minute limit slows guessing.
Pepper and the at-rest key live in a 0600 file outside the database, so a
database copy alone cannot test codes offline. Someone holding BOTH the
database and the key file can bypass the ten-try limit; see docs/CODE_LOCK.md.

Storage is an interface: ``store.load(owner, book)`` returns a ``CodeRecord``
or None (the adapter should lock the row for the rest of the transaction) and
``store.save(owner, book, record)`` writes it. The caller commits.
"""

import base64
import binascii
import dataclasses
import hashlib
import hmac
import json
import os
import re
import secrets
import stat
import time
from typing import Optional

ATTEMPTS = 10
RATE_PER_MINUTE = 5
MIN_ITERATIONS = 600_000
MAX_ITERATIONS = 10_000_000
BOOKS = ("personal",)
KEY_FORMAT = "passport-code-key-v1"
_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
_OWNER = re.compile(r"[A-Za-z0-9_.:-]{1,128}")


class CodeLockError(Exception):
    """A refusal with a fixed public code; never carries secret material."""

    def __init__(self, code: str, status: int = 400, attempts_left: Optional[int] = None):
        super().__init__(code)
        self.code, self.status, self.attempts_left = code, status, attempts_left

    def body(self) -> dict:
        out = {"error": self.code}
        if self.attempts_left is not None:
            out["attemptsLeft"] = self.attempts_left
        return out


@dataclasses.dataclass
class CodeRecord:
    vault_id: str
    salt: str
    iterations: int
    verifier: str
    share_box: str
    wrapped_key: dict
    attempts: int = 0
    disabled: bool = False
    window_start: float = 0.0
    window_count: int = 0
    updated_at: float = 0.0


@dataclasses.dataclass(frozen=True)
class CodeSecrets:
    pepper: bytes
    at_rest: bytes

    def __post_init__(self):
        if len(self.pepper) != 32 or len(self.at_rest) != 32 or self.pepper == self.at_rest:
            raise ValueError("invalid code key material")

    def __repr__(self):
        return "CodeSecrets(<hidden>)"


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def _unb64(value, length: int) -> bytes:
    if not isinstance(value, str) or len(value) > 4 * ((length + 2) // 3):
        raise CodeLockError("invalid")
    try:
        raw = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        raise CodeLockError("invalid") from None
    if len(raw) != length or _b64(raw) != value:
        raise CodeLockError("invalid")
    return raw


def write_key_file(path: str) -> None:
    """Create a new 0600 key file. Refuses to overwrite an existing file."""
    data = json.dumps({"format": KEY_FORMAT, "pepper": _b64(secrets.token_bytes(32)),
                       "atRest": _b64(secrets.token_bytes(32))}).encode("ascii")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        os.write(fd, data + b"\n")
        os.fsync(fd)
    finally:
        os.close(fd)


def load_key_file(path: str) -> CodeSecrets:
    """Read the key file. It must be a regular file readable only by its owner."""
    if not isinstance(path, str) or not os.path.isabs(path):
        raise ValueError("code key file path must be absolute")
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_size > 4096:
            raise ValueError("code key file must be a private regular file")
        if hasattr(os, "getuid") and info.st_uid != os.getuid():
            raise ValueError("code key file must belong to this service user")
        raw = os.read(fd, 4096)
    finally:
        os.close(fd)
    try:
        value = json.loads(raw)
        if not isinstance(value, dict) or set(value) != {"format", "pepper", "atRest"} or value["format"] != KEY_FORMAT:
            raise ValueError()
        return CodeSecrets(_unb64(value["pepper"], 32), _unb64(value["atRest"], 32))
    except (ValueError, CodeLockError, TypeError):
        raise ValueError("invalid code key file") from None


def _label(*parts: str) -> bytes:
    return "\0".join(("passport-code-lock-v1",) + parts).encode("utf-8")


class CodeLock:
    """Status, set and unlock doors for one owner's book code."""

    def __init__(self, store, keys: CodeSecrets, clock=None,
                 attempts: int = ATTEMPTS, rate_per_minute: int = RATE_PER_MINUTE):
        if not isinstance(keys, CodeSecrets):
            raise TypeError("keys must be CodeSecrets")
        self.store, self._keys = store, keys
        self.clock = clock if clock is not None else (lambda: time.time())
        self.attempts, self.rate = attempts, rate_per_minute

    # -- sealed share -------------------------------------------------------
    def _subkey(self, purpose: str) -> bytes:
        return hmac.new(self._keys.at_rest, _label("at-rest", purpose), hashlib.sha256).digest()

    def _seal_share(self, owner: str, book: str, vault_id: str, share: bytes) -> str:
        nonce = secrets.token_bytes(16)
        context = _label("share", owner, book, vault_id) + nonce
        stream = hmac.new(self._subkey("enc"), context, hashlib.sha256).digest()
        body = bytes(a ^ b for a, b in zip(share, stream))
        tag = hmac.new(self._subkey("mac"), context + body, hashlib.sha256).digest()
        return "v1." + _b64(nonce + body + tag)

    def _open_share(self, owner: str, book: str, vault_id: str, box: str) -> bytes:
        try:
            if not isinstance(box, str) or not box.startswith("v1."):
                raise ValueError()
            raw = base64.b64decode(box[3:], validate=True)
            if len(raw) != 16 + 32 + 32:
                raise ValueError()
        except (ValueError, binascii.Error):
            raise CodeLockError("unavailable", 503) from None
        nonce, body, tag = raw[:16], raw[16:48], raw[48:]
        context = _label("share", owner, book, vault_id) + nonce
        expected = hmac.new(self._subkey("mac"), context + body, hashlib.sha256).digest()
        if not hmac.compare_digest(tag, expected):
            # Wrong key file, or a row moved between accounts or books.
            raise CodeLockError("unavailable", 503)
        stream = hmac.new(self._subkey("enc"), context, hashlib.sha256).digest()
        return bytes(a ^ b for a, b in zip(body, stream))

    def _verifier(self, owner: str, book: str, vault_id: str, auth: bytes) -> str:
        return hmac.new(self._keys.pepper, _label("verifier", owner, book, vault_id) + auth, hashlib.sha256).hexdigest()

    # -- doors ----------------------------------------------------------------
    @staticmethod
    def _check(owner, book):
        if not isinstance(owner, str) or not _OWNER.fullmatch(owner) or book not in BOOKS:
            raise CodeLockError("invalid")

    def _status(self, record: Optional[CodeRecord]) -> dict:
        if record is None:
            return {"hasCode": False, "vaultId": None, "salt": None, "iterations": None,
                    "attemptsLeft": self.attempts, "disabled": False}
        return {"hasCode": True, "vaultId": record.vault_id, "salt": record.salt,
                "iterations": record.iterations,
                "attemptsLeft": 0 if record.disabled else max(0, self.attempts - record.attempts),
                "disabled": bool(record.disabled)}

    def status(self, owner: str, book: str) -> dict:
        self._check(owner, book)
        return self._status(self.store.load(owner, book))

    def set_code(self, owner: str, book: str, body) -> dict:
        """Replace the code. The browser proves nothing here; the book must be
        open on its side to wrap the key. A new code resets tries and the lock."""
        self._check(owner, book)
        if not isinstance(body, dict) or set(body) != {"vaultId", "salt", "iterations", "auth", "share", "wrappedKey"}:
            raise CodeLockError("invalid")
        vault_id, iterations, wrapped = body["vaultId"], body["iterations"], body["wrappedKey"]
        if not isinstance(vault_id, str) or not _UUID.fullmatch(vault_id):
            raise CodeLockError("invalid")
        if type(iterations) is not int or not MIN_ITERATIONS <= iterations <= MAX_ITERATIONS:
            raise CodeLockError("invalid")
        _unb64(body["salt"], 16)
        auth = _unb64(body["auth"], 32)
        share = _unb64(body["share"], 32)
        if not isinstance(wrapped, dict) or set(wrapped) != {"nonce", "ciphertext"}:
            raise CodeLockError("invalid")
        _unb64(wrapped["nonce"], 12)
        _unb64(wrapped["ciphertext"], 48)
        self.store.load(owner, book)  # Serialize against a concurrent unlock.
        record = CodeRecord(vault_id=vault_id, salt=body["salt"], iterations=iterations,
                            verifier=self._verifier(owner, book, vault_id, auth),
                            share_box=self._seal_share(owner, book, vault_id, share),
                            wrapped_key={"nonce": wrapped["nonce"], "ciphertext": wrapped["ciphertext"]},
                            attempts=0, disabled=False, window_start=0.0, window_count=0,
                            updated_at=float(self.clock()))
        self.store.save(owner, book, record)
        return self._status(record)

    def unlock(self, owner: str, book: str, body) -> dict:
        """Right code: tries reset, share released. Wrong: one try used.

        Counter changes are saved through the store BEFORE a refusal is raised;
        the caller must commit on CodeLockError too, or tries are not counted.
        """
        self._check(owner, book)
        record = self.store.load(owner, book)
        if record is None:
            raise CodeLockError("no-code", 404, self.attempts)
        now = float(self.clock())
        if not record.window_start or now - record.window_start >= 60 or now < record.window_start:
            record.window_start, record.window_count = now, 0
        if record.window_count >= self.rate:
            raise CodeLockError("rate", 429, self._status(record)["attemptsLeft"])
        record.window_count += 1
        record.updated_at = now
        if record.disabled:
            self.store.save(owner, book, record)
            raise CodeLockError("disabled", 423, 0)
        if not isinstance(body, dict) or set(body) != {"auth"}:
            self.store.save(owner, book, record)
            raise CodeLockError("invalid")
        try:
            auth = _unb64(body["auth"], 32)
        except CodeLockError:
            self.store.save(owner, book, record)
            raise
        given = self._verifier(owner, book, record.vault_id, auth)
        if not hmac.compare_digest(given, record.verifier):
            record.attempts += 1
            if record.attempts >= self.attempts:
                record.disabled = True
            self.store.save(owner, book, record)
            if record.disabled:
                raise CodeLockError("disabled", 423, 0)
            raise CodeLockError("wrong", 403, self.attempts - record.attempts)
        share = self._open_share(owner, book, record.vault_id, record.share_box)
        record.attempts = 0
        self.store.save(owner, book, record)
        return {"share": _b64(share), "wrappedKey": dict(record.wrapped_key), "vaultId": record.vault_id}


class MemoryStore:
    """In-memory store for tests and the reference docs. Not durable."""

    def __init__(self):
        self.rows = {}

    def load(self, owner, book):
        row = self.rows.get((owner, book))
        return dataclasses.replace(row, wrapped_key=dict(row.wrapped_key)) if row else None

    def save(self, owner, book, record):
        self.rows[(owner, book)] = dataclasses.replace(record, wrapped_key=dict(record.wrapped_key))
