"""Network boundary tests using a temporary loopback port and synthetic assets."""

import contextlib
import http.client
import io
import threading
import unittest
from unittest.mock import patch

from toll_passport import __version__
from toll_passport.cli import main
from toll_passport.server import ASSETS, CSP, make_server


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = make_server(0)
        cls.port = cls.server.server_port
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def request(self, path="/", method="GET", host=None, body=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        headers = {} if host is None else {"Host": host}
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_loopback_only(self):
        self.assertEqual(self.server.server_address[0], "127.0.0.1")

    def test_asset_allowlist_and_headers(self):
        with patch("toll_passport.server._asset", return_value=b"asset") as read:
            for path, (filename, content_type) in ASSETS.items():
                with self.subTest(path=path):
                    status, headers, body = self.request(path)
                    self.assertEqual((status, body), (200, b"asset"))
                    self.assertEqual(headers["Content-Type"], content_type)
                    self.assertEqual(headers["Content-Security-Policy"], CSP)
                    self.assertEqual(headers["Cache-Control"], "no-store")
                    self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
                    self.assertEqual(headers["Referrer-Policy"], "no-referrer")
                    self.assertNotIn("Access-Control-Allow-Origin", headers)
                    read.assert_called_with(filename)

    def test_head_has_no_body(self):
        with patch("toll_passport.server._asset", return_value=b"asset"):
            status, headers, body = self.request(method="HEAD")
        self.assertEqual((status, headers["Content-Length"], body), (200, "5", b""))

    def test_traversal_and_queries_never_read_files(self):
        with patch("toll_passport.server._asset") as read:
            for path in ["/../pyproject.toml", "/%2e%2e/LICENSE", "//index.html/..", "/.env", "/vault", "/?key=secret", "/vault.mjs?x=1", "http://attacker.example/"]:
                with self.subTest(path=path):
                    self.assertEqual(self.request(path, host="127.0.0.1:{}".format(self.port))[0], 404)
            read.assert_not_called()

    def test_host_rebinding_rejected(self):
        with patch("toll_passport.server._asset") as read:
            for host in ["attacker.example", "127.0.0.1", "localhost:1", "127.0.0.1:1", "localhost.evil:{}".format(self.port), ""]:
                with self.subTest(host=host):
                    self.assertEqual(self.request(host=host)[0], 403)
            read.assert_not_called()

    def test_localhost_host_allowed(self):
        with patch("toll_passport.server._asset", return_value=b"asset"):
            self.assertEqual(self.request(host="localhost:{}".format(self.port))[0], 200)

    def test_duplicate_host_rejected(self):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        connection.putrequest("GET", "/")
        connection.putheader("Host", "localhost:{}".format(self.port))
        connection.endheaders()
        response = connection.getresponse()
        self.assertEqual(response.status, 403)
        response.read()
        connection.close()

    def test_no_write_endpoints(self):
        with patch("toll_passport.server._asset") as read:
            for method in ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "CONNECT"]:
                with self.subTest(method=method):
                    status, headers, body = self.request(method=method, body=b"never store this")
                    self.assertEqual(status, 405)
                    self.assertEqual(headers["Allow"], "GET, HEAD")
                    self.assertNotIn(b"never store this", body)
            read.assert_not_called()

    def test_missing_asset_does_not_leak_exception(self):
        with patch("toll_passport.server._asset", side_effect=FileNotFoundError("secret path")):
            status, _, body = self.request()
        self.assertEqual(status, 503)
        self.assertNotIn(b"secret path", body)


class CliTests(unittest.TestCase):
    def test_version(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output), self.assertRaises(SystemExit) as exit:
            main(["--version"])
        self.assertEqual(exit.exception.code, 0)
        self.assertIn(__version__, output.getvalue())

    def test_help_no_server(self):
        with contextlib.redirect_stdout(io.StringIO()), patch("toll_passport.cli.make_server") as make:
            self.assertEqual(main([]), 0)
            make.assert_not_called()

    def test_cannot_expose_server(self):
        for args in [["serve", "--host", "0.0.0.0"], ["serve", "--port", "0"], ["serve", "--port", "65536"]]:
            with self.subTest(args=args), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as exit:
                main(args)
            self.assertEqual(exit.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
