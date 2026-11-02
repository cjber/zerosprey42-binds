#!/usr/bin/env python3
"""Download the spell icons a class file names, into assets/icons/.

Icons are the client's own art names (ability_hunter_aimedshot and so on). They come from the
Wowhead CDN, which serves the same files the client ships. Cached in the repo so the app works
offline once fetched.

usage: python3 tools/fetch-icons.py [class ...]
"""

import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
ICONS = ROOT / "assets" / "icons"
CDN = "https://wow.zamimg.com/images/wow/icons/medium/{}.jpg"


def main():
    ICONS.mkdir(parents=True, exist_ok=True)
    names = set()
    for path in sorted((ROOT / "assets" / "classes").glob("*.json")):
        data = json.loads(path.read_text())
        for ability in data.get("abilities", []):
            if ability.get("icon"):
                names.add(ability["icon"])
    print(f"{len(names)} icons named across the class files")
    fetched = 0
    for name in sorted(names):
        target = ICONS / f"{name}.jpg"
        if target.exists() and target.stat().st_size > 500:
            continue
        try:
            with urllib.request.urlopen(CDN.format(name), timeout=20) as response:
                body = response.read()
        except Exception as error:  # noqa: BLE001 - report and keep going
            print(f"  miss {name}: {error}")
            continue
        if len(body) < 500:
            print(f"  miss {name}: {len(body)} bytes")
            continue
        target.write_bytes(body)
        fetched += 1
    print(f"fetched {fetched}, {len(list(ICONS.glob('*.jpg')))} cached in total")


main()
