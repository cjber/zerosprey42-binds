#!/usr/bin/env python3
"""Read the keyboard's real key positions from its PCB, and write assets/physical-layout.json.

The firmware's Vial definition (`assets/vial-definition.json`) is not usable as geometry: its
thumbs cascade a full row per entry and its outer body columns sit a whole key below the rest, so
it does not describe the board the keys are soldered to. The PCB does. This parses the switch
footprints out of beekeeb/zerosprey42's `pcb/zerosprey42.kicad_pcb` and keeps their centres, width
and rotation, which is the layout `tools/build-board.py` turns into `assets/board.json`.

usage: python3 tools/read-pcb.py
"""

import json
import pathlib
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / ".cache" / "zerosprey42.kicad_pcb"
URL = "https://raw.githubusercontent.com/beekeeb/zerosprey42/main/pcb/zerosprey42.kicad_pcb"

# Switch reference -> the legend the firmware keymap puts on it. The refs run in mirrored pairs
# across the two hands: SW1 is the left hand's outermost top key and SW12 the right hand's.
LEGENDS = {
    # left hand, outer column to inner column
    "SW1": "Tab", "SW13": "Ctrl", "SW25": "Shift",
    "SW2": "Q", "SW14": "A", "SW26": "Z",
    "SW3": "W", "SW15": "S", "SW27": "X",
    "SW4": "E", "SW16": "D", "SW28": "C",
    "SW5": "R", "SW17": "F", "SW29": "V",
    "SW6": "T", "SW18": "G", "SW30": "B",
    # right hand, inner column to outer column
    "SW7": "Y", "SW19": "H", "SW31": "N",
    "SW8": "U", "SW20": "J", "SW32": "M",
    "SW9": "I", "SW21": "K", "SW33": ",",
    "SW10": "O", "SW22": "L", "SW34": ".",
    "SW11": "P", "SW23": ";", "SW35": "/",
    "SW12": "Bksp", "SW24": "'", "SW36": "Shift",
    # thumbs: the 1.5u key is the inner thumb of each hand
    "SW37": "Super", "SW38": "Lower", "SW39": "Space",
    "SW40": "Enter", "SW41": "Raise", "SW42": "AltGr",
}


THUMB_ROT = {"Super": 30, "Lower": 30, "Space": 0, "Enter": 0, "Raise": -30, "AltGr": -30}


def footprint_blocks(source: str):
    """Yield each top-level footprint block, matching parentheses so nested pads stay whole."""
    starts = [m.start() for m in re.finditer(r'(?m)^  \(footprint "', source)]
    for start in starts:
        depth = 0
        end = start
        while end < len(source):
            if source[end] == "(":
                depth += 1
            elif source[end] == ")":
                depth -= 1
                if depth == 0:
                    break
            end += 1
        yield source[start : end + 1]


def main():
    if not CACHE.exists():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {URL}")
        CACHE.write_bytes(urllib.request.urlopen(URL, timeout=120).read())
    source = CACHE.read_text()

    keys = []
    for block in footprint_blocks(source):
        name = re.match(r'\s*\(footprint "([^"]+)"', block).group(1)
        if "SW_choc_HS" not in name:
            continue
        reference = re.search(r'\(fp_text reference "([^"]+)"', block).group(1)
        at = re.search(r'\(at ([-\d.]+) ([-\d.]+)(?: ([-\d.]+))?\)', block)
        x, y = float(at.group(1)), float(at.group(2))
        # Keycaps sit square on the switch grid; the footprints themselves are rotated to angle the
        # halves, which is already carried by their positions. The thumb keys are the exception: the
        # two 1u keys fan along the diagonal into the thumb well, and the wide key stays level so it
        # clears the bottom row above it.
        rot = THUMB_ROT.get(LEGENDS[reference], 0)
        keys.append(
            {
                "ref": reference,
                "legend": LEGENDS[reference],
                "cx": round(x, 3),
                "cy": round(y, 3),
                "w": 1.5 if "1.5u" in name else 1.0,
                "rot": rot,
            }
        )

    missing = set(LEGENDS) - {key["ref"] for key in keys}
    if missing:
        raise SystemExit(f"switches missing from the PCB: {sorted(missing)}")
    if len(keys) != 42:
        raise SystemExit(f"found {len(keys)} switches, expected 42")

    keys.sort(key=lambda key: (key["cx"] < 0 and -key["cy"], key["cx"]))
    out = {
        "name": "Zerosprey42",
        "units": "millimetres, from the PCB footprint centres; y grows downwards",
        "source": {
            "file": "pcb/zerosprey42.kicad_pcb in beekeeb/zerosprey42",
            "read": URL,
            "note": "the firmware's Vial definition scatters the thumbs and drops the outer columns, so the PCB is the geometry",
        },
        "keys": keys,
    }
    (ROOT / "assets" / "physical-layout.json").write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote assets/physical-layout.json: {len(keys)} switches")


main()
