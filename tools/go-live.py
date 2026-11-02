#!/usr/bin/env python3
"""Put the planner on binds.cjber.dev: deploy the Worker into the zone's account, then attach the domain.

Run after `WRANGLER_HOME=<dir> npx wrangler login` has completed with the account that owns the zone.
Reads the token from that wrangler profile unless CLOUDFLARE_API_TOKEN is set.

usage: WRANGLER_HOME=/tmp/opencode/wrangler-personal python3 tools/go-live.py
"""

import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

HOST = "binds.cjber.dev"
WORKER = "zerosprey42-binds"
ZONE = "cjber.dev"
API = "https://api.cloudflare.com/client/v4"
ROOT = pathlib.Path(__file__).resolve().parent.parent


def token() -> str:
    if os.environ.get("CLOUDFLARE_API_TOKEN"):
        return os.environ["CLOUDFLARE_API_TOKEN"]
    home = os.environ.get("WRANGLER_HOME")
    candidates = []
    if home:
        candidates.append(pathlib.Path(home) / "config" / "default.toml")
    candidates.append(pathlib.Path.home() / ".config" / ".wrangler" / "config" / "default.toml")
    for candidate in candidates:
        if candidate.exists():
            match = re.search(r'oauth_token\s*=\s*"([^"]+)"', candidate.read_text())
            if match:
                return match.group(1)
    raise SystemExit("no token found: log in first, or set CLOUDFLARE_API_TOKEN")


def call(method: str, path: str, body: dict | None = None, key: str | None = None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {key or token()}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        return json.loads(error.read())


def check(quiet: bool = False) -> bool:
    try:
        with urllib.request.urlopen(f"https://{HOST}/", timeout=20) as response:
            body = response.read(6000).decode(errors="ignore")
            ok = response.status == 200 and "Zerosprey42" in body
            if not quiet:
                print(f"https://{HOST}/ -> HTTP {response.status}, planner present: {ok}")
            return ok
    except Exception as error:  # noqa: BLE001
        if not quiet:
            print(f"https://{HOST}/ -> {error}")
        return False


def main():
    key = token()
    zones = call("GET", f"/zones?name={ZONE}", key=key)
    if not zones.get("success") or not zones.get("result"):
        raise SystemExit(f"{ZONE} not visible to this token: {zones.get('errors')}")
    zone = zones["result"][0]
    account_id = zone["account"]["id"]
    print(f"{ZONE} is in account {account_id} ({zone['account']['name']})")

    build = subprocess.run(["bun", "run", "build"], cwd=ROOT, text=True, capture_output=True)
    if build.returncode != 0:
        raise SystemExit(f"build failed: {build.stderr[-400:]}")
    print("built dist/")

    env = dict(os.environ, CLOUDFLARE_ACCOUNT_ID=account_id)
    deploy = subprocess.run(
        ["npx", "-y", "wrangler@latest", "deploy"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        env=env,
    )
    tail = (deploy.stdout + deploy.stderr).strip().splitlines()[-4:]
    print("\n".join(tail))
    if deploy.returncode != 0:
        raise SystemExit("deploy failed")

    existing = call("GET", f"/accounts/{account_id}/workers/domains", key=key)
    already = [e for e in existing.get("result", []) if e.get("hostname") == HOST]
    if not already:
        created = call(
            "POST",
            f"/accounts/{account_id}/workers/domains",
            {"zone_id": zone["id"], "hostname": HOST, "service": WORKER, "environment": "production"},
            key=key,
        )
        if not created.get("success"):
            raise SystemExit(f"attach failed: {created.get('errors')}")
        print(f"attached {HOST} to {WORKER}")
    else:
        print(f"{HOST} already attached")

    for _ in range(30):
        if check(quiet=True):
            break
        time.sleep(10)
    if not check():
        print("attached, but the host is not answering yet; give DNS and the certificate a minute")
        sys.exit(1)


main()
