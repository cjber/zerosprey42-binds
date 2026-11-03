#!/usr/bin/env python3
"""Cache the client's own interface-button art for the panel keys, into assets/wow/panels/.

The board names its command keys from UI_BINDS. Where the client ships button art for a panel, the key
shows that art rather than the panel's name, the way the client's own micro menu does.

The files are the client's BLP art, fetched by FileDataID from wago.tools and decoded to PNG. A texture
name is resolved through the build's ManifestInterfaceData, so a missing one fails loudly.

usage: python3 tools/fetch-panel-icons.py [--build 1.60.1.69913]
"""

import argparse
import csv
import io
import pathlib
import struct
import urllib.request

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "wow" / "panels"
CACHE = pathlib.Path.home() / ".cache" / "wowmock"

# Panel -> the client's own button texture, by file name in ManifestInterfaceData.
PANELS = {
    "spellbook": "ui-microbutton-spellbook-up.blp",
    "talents": "ui-microbutton-talents-up.blp",
    "quest": "ui-microbutton-quest-up.blp",
    "socials": "ui-microbutton-socials-up.blp",
    "menu": "ui-microbutton-mainmenu-up.blp",
    "bags": "inv_misc_bag_08.blp",
    "map": "worldmap-icon.blp",
}


def decode(data: bytes) -> Image.Image:
    """BLP2 uncompressed BGRA (encoding 3) is not read by Pillow; every other encoding is."""
    if data[:4] == b"BLP2" and data[8] == 3:
        width, height = struct.unpack_from("<II", data, 12)
        offset, size = struct.unpack_from("<I", data, 20)[0], struct.unpack_from("<I", data, 84)[0]
        return Image.frombytes("RGBA", (width, height), data[offset : offset + size], "raw", "BGRA")
    return Image.open(io.BytesIO(data)).convert("RGBA")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--build", default="1.60.1.69913")
    build = parser.parse_args().build
    manifest = CACHE / build / "ManifestInterfaceData.csv"

    files: dict[str, int] = {}
    with open(manifest, newline="", encoding="utf-8", errors="replace") as handle:
        for row in csv.DictReader(handle):
            name = (row.get("FileName") or "").lower()
            if name:
                files.setdefault(name, int(row["ID"]))

    OUT.mkdir(parents=True, exist_ok=True)
    missing = []
    for panel, texture in PANELS.items():
        fdid = files.get(texture)
        if not fdid:
            missing.append(texture)
            continue
        url = f"https://wago.tools/api/casc/{fdid}?download&build={build}"
        # The CASC endpoint refuses the default urllib agent.
        request = urllib.request.Request(url, headers={"User-Agent": "zerosprey-binds/1.0"})
        with urllib.request.urlopen(request, timeout=120) as response:
            image = decode(response.read())
        if image.size == (32, 64):
            # The micro button art is a 28x36 button inside a 32x64 sheet; keep the button box.
            image = image.crop((2, 25, 30, 61))
        target = OUT / f"{panel}.png"
        image.save(target, optimize=True)
        print(f"{target.relative_to(ROOT)}: {image.width}x{image.height} from {texture}")
    if missing:
        raise SystemExit(f"no FileDataID for: {', '.join(missing)}")


if __name__ == "__main__":
    main()
