"""Launch the local reference interface without receiving vault data."""

import argparse
import sys
from typing import Optional, Sequence

from . import __version__
from .server import make_server


def _port(value: str) -> int:
    try:
        port = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("port must be a number") from exc
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("port must be between 1 and 65535")
    return port


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="toll-passport", description="Open your local Passport. Vault contents stay in your browser.")
    parser.add_argument("--version", action="version", version="%(prog)s " + __version__)
    commands = parser.add_subparsers(dest="command")
    serve = commands.add_parser("serve", help="serve the reference interface on this computer only")
    serve.add_argument("--port", type=_port, default=8765, help="local port (default: 8765); keep it stable to reopen the same browser vault")
    args = parser.parse_args(argv)
    if args.command != "serve":
        parser.print_help()
        return 0
    try:
        server = make_server(args.port)
    except OSError:
        print("Could not start Passport. The local port may already be in use.", file=sys.stderr)
        return 1
    with server:
        print("Passport: http://127.0.0.1:{}/".format(server.server_port), flush=True)
        print("Use this same address and browser to return to your vault. Press Ctrl+C to stop.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0
