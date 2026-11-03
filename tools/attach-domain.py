#!/usr/bin/env python3
"""Give the planner its hostname: the proxied DNS record that the Worker route needs.

`bun run deploy` installs the `binds.cjber.dev/*` route itself, from wrangler.toml. The one step a
deploy cannot do is create DNS in a zone it did not make, so this ensures the proxied record exists
and then checks the page. Run it for a fresh zone, or if the record is ever lost.

Needs an API token, not the wrangler OAuth login (which has read-only zone access):
  CLOUDFLARE_API_TOKEN=... python3 tools/attach-domain.py [hostname] [worker]
The token needs Zone:Read, DNS:Edit and Workers Scripts:Read on the zone's account.

usage: CLOUDFLARE_API_TOKEN=... python3 tools/attach-domain.py
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

HOST = sys.argv[1] if len(sys.argv) > 1 else "binds.cjber.dev"
WORKER = sys.argv[2] if len(sys.argv) > 2 else "zerosprey42-binds"
ZONE = ".".join(HOST.split(".")[-2:])
API = "https://api.cloudflare.com/client/v4"


def token() -> str:
    if not os.environ.get("CLOUDFLARE_API_TOKEN"):
        raise SystemExit(
            "no token: set CLOUDFLARE_API_TOKEN (Zone:Read, DNS:Edit, Workers Scripts:Read). "
            "The wrangler login cannot edit DNS."
        )
    return os.environ["CLOUDFLARE_API_TOKEN"]


def call(method: str, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        return json.loads(error.read())


def zone() -> dict:
    zones = call("GET", f"/zones?name={ZONE}")
    if not zones.get("success") or not zones.get("result"):
        raise SystemExit(f"{ZONE} is not visible to this token: {zones.get('errors')}")
    return zones["result"][0]


def worker_hostname(account: str) -> str:
    subdomain = call("GET", f"/accounts/{account}/workers/subdomain")
    name = (subdomain.get("result") or {}).get("subdomain")
    if not name:
        raise SystemExit(f"no workers.dev subdomain for {account}: {subdomain.get('errors')}")
    return f"{WORKER}.{name}.workers.dev"


def ensure_record(zone_id: str, target: str) -> None:
    records = call("GET", f"/zones/{zone_id}/dns_records?name={HOST}")
    existing = records.get("result") or []
    body = {"type": "CNAME", "name": HOST, "content": target, "proxied": True, "ttl": 1}
    if not existing:
        created = call("POST", f"/zones/{zone_id}/dns_records", body)
        if not created.get("success"):
            raise SystemExit(f"could not create the {HOST} record: {created.get('errors')}")
        print(f"created proxied CNAME {HOST} -> {target}")
        return
    record = existing[0]
    if record["content"] == target and record["proxied"]:
        print(f"{HOST} already points at {target} (proxied)")
        return
    updated = call("PATCH", f"/zones/{zone_id}/dns_records/{record['id']}", body)
    if not updated.get("success"):
        raise SystemExit(f"could not update the {HOST} record: {updated.get('errors')}")
    print(f"updated {HOST} -> {target} (proxied)")


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


def main() -> None:
    found = zone()
    account = found["account"]["id"]
    print(f"zone {ZONE} ({found['id']}) is in account {account} ({found['account']['name']})")
    ensure_record(found["id"], worker_hostname(account))

    for _ in range(12):
        if check(quiet=True):
            break
        time.sleep(5)
    if not check():
        raise SystemExit("the record exists, but the host is not answering yet: give DNS a minute")


main()
