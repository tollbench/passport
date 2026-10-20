"""Loopback-only static asset server; no vault, key, or upload endpoints."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib import resources

ASSETS = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/app.mjs": ("app.mjs", "text/javascript; charset=utf-8"),
    "/answers.mjs": ("answers.mjs", "text/javascript; charset=utf-8"),
    "/vault.mjs": ("vault.mjs", "text/javascript; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
}
CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self'; "
    "connect-src 'none'; object-src 'none'; base-uri 'none'; "
    "frame-src 'none'; frame-ancestors 'none'; form-action 'none'; "
    "img-src 'self' blob: data:; worker-src 'none'"
)


def _asset(name: str) -> bytes:
    return resources.files("toll_passport").joinpath("web", name).read_bytes()


class PassportHandler(BaseHTTPRequestHandler):
    server_version = "TollPassport"
    sys_version = ""

    def log_message(self, format, *args):
        # Do not log request paths, headers, or any client-supplied material.
        pass

    def _valid_host(self) -> bool:
        hosts = self.headers.get_all("Host", [])
        port = self.server.server_port
        return len(hosts) == 1 and hosts[0] in {
            "127.0.0.1:{}".format(port), "localhost:{}".format(port)
        }

    def _respond(self, status: int, body: bytes, content_type: str = "text/plain; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Connection", "close")
        if status == 405:
            self.send_header("Allow", "GET, HEAD")
        self.end_headers()
        self.close_connection = True
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_error(self, code, message=None, explain=None):
        # Base parser/unknown-method errors must not echo client-controlled input.
        self._respond(code, b"Request rejected.\n")

    def do_GET(self):
        if not self._valid_host():
            self._respond(403, b"Invalid local host.\n")
            return
        selected = ASSETS.get(self.path)
        if selected is None:
            self._respond(404, b"Not found.\n")
            return
        name, content_type = selected
        try:
            body = _asset(name)
        except (FileNotFoundError, OSError):
            self._respond(503, b"Passport assets unavailable. Reinstall the package.\n")
            return
        self._respond(200, body, content_type)

    do_HEAD = do_GET

    def _unsupported(self):
        self._respond(405 if self._valid_host() else 403, b"Request rejected.\n")

    do_POST = _unsupported
    do_PUT = _unsupported
    do_PATCH = _unsupported
    do_DELETE = _unsupported
    do_OPTIONS = _unsupported
    do_TRACE = _unsupported
    do_CONNECT = _unsupported


def make_server(port: int = 8765) -> ThreadingHTTPServer:
    """Bind only IPv4 loopback. Port zero is available to isolated tests."""
    if not isinstance(port, int) or isinstance(port, bool) or not 0 <= port <= 65535:
        raise ValueError("port must be between 0 and 65535")
    server = ThreadingHTTPServer(("127.0.0.1", port), PassportHandler)
    server.daemon_threads = True
    return server
