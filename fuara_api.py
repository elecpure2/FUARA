import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = "http://127.0.0.1:7777"


def load_payload(args):
    if args.json_file:
        return json.loads(Path(args.json_file).read_text(encoding="utf-8"))
    if args.json_text:
        return json.loads(args.json_text)
    if args.stdin_json:
        raw = sys.stdin.buffer.read()
        if raw.strip():
            return json.loads(raw.decode("utf-8"))
    return None


def main():
    parser = argparse.ArgumentParser(
        description="Unicode-safe FUARA API client for local automation."
    )
    parser.add_argument("method", help="HTTP method, e.g. GET POST PATCH DELETE")
    parser.add_argument("path", help="API path, e.g. /tasks or /schedules/1")
    parser.add_argument(
        "--json-file",
        help="UTF-8 JSON file path. Safest option for non-ASCII payloads.",
    )
    parser.add_argument(
        "--json-text",
        help="Inline JSON text. Use only for ASCII-only payloads.",
    )
    parser.add_argument(
        "--stdin-json",
        action="store_true",
        help="Read UTF-8 JSON payload from stdin.",
    )
    parser.add_argument(
        "--ascii",
        action="store_true",
        help="Print ASCII-only escaped JSON for terminals with poor Unicode support.",
    )
    args = parser.parse_args()

    payload = load_payload(args)
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"

    request = urllib.request.Request(
        BASE_URL + args.path,
        data=data,
        method=args.method.upper(),
        headers=headers,
    )

    try:
        with urllib.request.urlopen(request) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        print(error_body, file=sys.stderr)
        raise SystemExit(exc.code)
    except urllib.error.URLError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)

    parsed = json.loads(body) if body else None
    print(json.dumps(parsed, ensure_ascii=args.ascii, indent=2))


if __name__ == "__main__":
    main()
