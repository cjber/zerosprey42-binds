#!/usr/bin/env python3
"""Attach binds.cjber.dev to the zerosprey42-binds Worker, in whatever account holds the zone.

Cloudflare only lets a Worker take a custom domain whose zone sits in the same account as the
Worker, so this reads the zone's own account from the API instead of assuming one.

usage: python3 tools/attach-domain.py [hostname] [worker]
Reads CLOUDFLARE_API_TOKEN, or the OAuth token wrangler stored after `wrangler login`.
"""

import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

HOST = sys.argv[1] if len(sys.argv) > 1 else "binds.cjber.dev"
WORKER = sys.argv[2] if len(sys.argv) > 2 else "zerosprey42-binds"
ZONE = ".".join(HOST.split(".")[-2:])
API = "https://api.cloudflare.com/client/v4"


def token() -> str:
    import os

    if os.environ.get("CLOUDFLARE_API_TOKEN"):
        return os.environ["CLOUDFLARE_API_TOKEN"]
    config = pathlib.Path.home() / ".config" / ".wrangler" / "config" / "default.toml"
    match = re.search(r'oauth_token\s*=\s*"([^"]+)"', config.read_text())
    if not match:
        raise SystemExit("no token: run `npx wrangler login` or set CLOUDFLARE_API_TOKEN")
    return match.group(1)


def call(method: str, path: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token()}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        return json.loads(error.read())


def main():
    zones = call("GET", f"/zones?name={ZONE}")
    if not zones.get("success") or not zones.get("result"):
        raise SystemExit(f"{ZONE} is not in this token's account: {zones.get('errors')}")
    zone = zones["result"][0]
    account = zone["account"]["id"]
    print(f"zone {ZONE} ({zone['id']}) is in account {account} ({zone['account']['name']})")

    existing = call("GET", f"/accounts/{account}/workers/domains")
    for entry in existing.get("result", []):
        if entry.get("hostname") == HOST:
            print(f"{HOST} is already attached to {entry.get('service')} ({entry.get('environment')})")
            return check()

    created = call(
        "POST",
        f"/accounts/{account}/workers/domains",
        {"zone_id": zone["id"], "hostname": HOST, "service": WORKER, "environment": "production"},
    )
    if not created.get("success"):
        raise SystemExit(f"attach failed: {created.get('errors')}")
    print(f"attached {HOST} to {WORKER}: {json.dumps(created['result'])[:200]}")

    for attempt in range(30):
        status = call("GET", f"/accounts/{account}/workers/domains")
        for entry in status.get("result", []):
            if entry.get("hostname") == HOST:
                print(f"  state: {entry.get('status', entry.get('certificate_status', 'pending'))}")
        if check(quiet=True):
            break
        time.sleep(10)
    check()


def check(quiet: bool = False) -> bool:
    try:
        with urllib.request.urlopen(f"https://{HOST}/", timeout=20) as response:
            body = response.read(4000).decode(errors="ignore")
            ok = response.status == 200 and "Zerosprey42" in body
            if not quiet:
                print(f"https://{HOST}/ -> {response.status}, title present: {ok}")
            return ok
    except Exception as error:  # noqa: BLE001 - report whatever the network says
        if not quiet:
            print(f"https://{HOST}/ -> {error}")
        return False


main()
