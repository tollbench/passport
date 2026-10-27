"""Server half of the 6-digit code: verifier, sealed share, tries, rate, key file."""

import base64
import json
import os
import secrets
import stat
import tempfile
import unittest

from toll_passport.code_lock import (ATTEMPTS, CodeLock, CodeLockError, CodeSecrets, MemoryStore,
                                     load_key_file, write_key_file)

OWNER = "11111111-1111-4111-8111-111111111111"
VAULT = "33333333-3333-4333-8333-333333333333"


def b64(raw):
    return base64.b64encode(raw).decode("ascii")


def body(auth=b"a" * 32, share=b"s" * 32):
    return {"vaultId": VAULT, "salt": b64(b"t" * 16), "iterations": 600000, "auth": b64(auth),
            "share": b64(share), "wrappedKey": {"nonce": b64(b"n" * 12), "ciphertext": b64(b"c" * 48)}}


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


class CodeLockTests(unittest.TestCase):
    def setUp(self):
        self.store, self.clock = MemoryStore(), Clock()
        self.keys = CodeSecrets(secrets.token_bytes(32), secrets.token_bytes(32))
        self.lock = CodeLock(self.store, self.keys, clock=self.clock)

    def wrong(self):
        self.clock.now += 61  # Stay under the per-minute limit.
        return self.lock.unlock(OWNER, "personal", {"auth": b64(b"x" * 32)})

    def test_set_then_right_code_releases_share_and_resets_tries(self):
        status = self.lock.set_code(OWNER, "personal", body())
        self.assertEqual(status["attemptsLeft"], ATTEMPTS)
        row = self.store.rows[(OWNER, "personal")]
        # Nothing stored is the auth proof or the share in the clear.
        self.assertNotIn(b64(b"a" * 32), json.dumps(row.__dict__))
        self.assertNotIn(b64(b"s" * 32), json.dumps(row.__dict__))
        with self.assertRaises(CodeLockError):
            self.wrong()
        opened = self.lock.unlock(OWNER, "personal", {"auth": b64(b"a" * 32)})
        self.assertEqual(opened, {"share": b64(b"s" * 32), "wrappedKey": body()["wrappedKey"], "vaultId": VAULT})
        self.assertEqual(self.lock.status(OWNER, "personal")["attemptsLeft"], ATTEMPTS)

    def test_wrong_codes_count_and_tenth_disables(self):
        self.lock.set_code(OWNER, "personal", body())
        for left in range(ATTEMPTS - 1, 0, -1):
            with self.assertRaises(CodeLockError) as caught:
                self.wrong()
            self.assertEqual((caught.exception.code, caught.exception.status, caught.exception.attempts_left), ("wrong", 403, left))
        with self.assertRaises(CodeLockError) as caught:
            self.wrong()
        self.assertEqual((caught.exception.code, caught.exception.status, caught.exception.attempts_left), ("disabled", 423, 0))
        self.assertTrue(self.lock.status(OWNER, "personal")["disabled"])
        self.clock.now += 61
        with self.assertRaises(CodeLockError) as caught:
            self.lock.unlock(OWNER, "personal", {"auth": b64(b"a" * 32)})
        self.assertEqual(caught.exception.code, "disabled")
        # A new code (set after the recovery file opens the book) resets everything.
        self.lock.set_code(OWNER, "personal", body(auth=b"b" * 32))
        self.assertEqual(self.lock.status(OWNER, "personal")["attemptsLeft"], ATTEMPTS)
        self.assertEqual(self.lock.unlock(OWNER, "personal", {"auth": b64(b"b" * 32)})["vaultId"], VAULT)

    def test_per_minute_limit_does_not_spend_tries(self):
        self.lock.set_code(OWNER, "personal", body())
        for _ in range(5):
            with self.assertRaises(CodeLockError) as caught:
                self.lock.unlock(OWNER, "personal", {"auth": b64(b"x" * 32)})
            self.assertEqual(caught.exception.code, "wrong")
        with self.assertRaises(CodeLockError) as caught:
            self.lock.unlock(OWNER, "personal", {"auth": b64(b"a" * 32)})
        self.assertEqual((caught.exception.code, caught.exception.status), ("rate", 429))
        self.assertEqual(self.lock.status(OWNER, "personal")["attemptsLeft"], ATTEMPTS - 5)
        self.clock.now += 60
        self.assertIn("share", self.lock.unlock(OWNER, "personal", {"auth": b64(b"a" * 32)}))

    def test_no_code_invalid_bodies_and_other_owner(self):
        with self.assertRaises(CodeLockError) as caught:
            self.lock.unlock(OWNER, "personal", {"auth": b64(b"a" * 32)})
        self.assertEqual((caught.exception.code, caught.exception.attempts_left), ("no-code", ATTEMPTS))
        for change in ({"iterations": 1000}, {"salt": "x"}, {"auth": b64(b"a" * 31)}, {"vaultId": "../x"},
                       {"wrappedKey": {"nonce": b64(b"n" * 12)}}, {"extra": 1}):
            value = body()
            value.update(change)
            with self.subTest(change=change), self.assertRaises(CodeLockError):
                self.lock.set_code(OWNER, "personal", value)
        with self.assertRaises(CodeLockError):
            self.lock.set_code(OWNER, "business", body())
        self.lock.set_code(OWNER, "personal", body())
        with self.assertRaises(CodeLockError):
            self.lock.unlock(OWNER, "personal", {"auth": "123456"})
        # A row copied to another account does not verify or release the share.
        other = "22222222-2222-4222-8222-222222222222"
        self.store.rows[(other, "personal")] = self.store.rows[(OWNER, "personal")]
        with self.assertRaises(CodeLockError) as caught:
            self.lock.unlock(other, "personal", {"auth": b64(b"a" * 32)})
        self.assertEqual(caught.exception.code, "wrong")

    def test_database_copy_without_key_file_is_useless(self):
        self.lock.set_code(OWNER, "personal", body())
        stranger = CodeLock(self.store, CodeSecrets(secrets.token_bytes(32), secrets.token_bytes(32)), clock=self.clock)
        with self.assertRaises(CodeLockError) as caught:
            stranger.unlock(OWNER, "personal", {"auth": b64(b"a" * 32)})
        self.assertEqual(caught.exception.code, "wrong")


class KeyFileTests(unittest.TestCase):
    def test_key_file_is_private_and_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "code-key")
            write_key_file(path)
            self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)
            keys = load_key_file(path)
            self.assertNotEqual(keys.pepper, keys.at_rest)
            self.assertNotIn(b64(keys.pepper), repr(keys))
            with self.assertRaises(FileExistsError):
                write_key_file(path)
            os.chmod(path, 0o644)
            with self.assertRaises(ValueError):
                load_key_file(path)
            with self.assertRaises(ValueError):
                load_key_file("relative/path")


if __name__ == "__main__":
    unittest.main()
