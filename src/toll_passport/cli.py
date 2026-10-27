"""Launch the local reference interface without receiving vault data."""

import argparse
import os
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
    keygen = commands.add_parser("code-key", help="create the private key file for a host's book-code server half")
    keygen.add_argument("path", help="absolute path of a NEW file; it is created with mode 0600")
    args = parser.parse_args(argv)
    if args.command == "code-key":
        from .code_lock import write_key_file
        if not os.path.isabs(args.path):
            print("Use an absolute path.", file=sys.stderr)
            return 2
        try:
            write_key_file(args.path)
        except FileExistsError:
            print("That file already exists. Nothing was changed.", file=sys.stderr)
            return 1
        except OSError:
            print("Could not create the key file.", file=sys.stderr)
            return 1
        print("Created a private code key file. Keep it out of the database and its backups.", flush=True)
        return 0
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
