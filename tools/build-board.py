#!/usr/bin/env python3
"""Build assets/board.json from the keyboard's physical layout.

`assets/physical-layout.json` is read out of the Zerosprey42 PCB by `tools/read-pcb.py`, so it is the
board the keys are actually soldered to: six columns per hand, the inner two columns stepped down
towards the thumbs, and three thumb keys per hand with the 1.5u key inboard. The firmware's Vial
definition is not used for geometry: its thumbs cascade a full row each and its outer columns sit a
key below the rest, so it draws a board that does not exist.

Each half is angled (the switch footprints are rotated), which is why the keys carry a rotation.
"""

import json
import math
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Choc switches sit on an 18.42 mm pitch, which is one key unit here.
PITCH = 18.42
PAD = 0.7  # room for the corners of rotated keycaps, in key units


def main():
    layout = json.loads((ROOT / "assets" / "physical-layout.json").read_text())

    keys = []
    for key in layout["keys"]:
        angle = math.radians(key["rot"])
        half_w = key["w"] / 2
        half_h = 0.5
        # Bounding half-extents of the rotated keycap, used to keep the board box around the corners.
        bound_w = half_w * abs(math.cos(angle)) + half_h * abs(math.sin(angle))
        bind_h = half_w * abs(math.sin(angle)) + half_h * abs(math.cos(angle))
        keys.append(
            {
                "legend": key["legend"],
                "w": key["w"],
                "rot": key["rot"],
                "cx": key["cx"] / PITCH,
                "cy": key["cy"] / PITCH,
                "bw": bound_w,
                "bh": bind_h,
            }
        )

    if len(keys) != 42:
        raise SystemExit(f"layout has {len(keys)} keys, expected 42")
    # Shift is on both outer columns, so legends repeat; the slot plan keys off the legend.

    min_x = min(key["cx"] - key["bw"] for key in keys)
    min_y = min(key["cy"] - key["bh"] for key in keys)
    max_x = max(key["cx"] + key["bw"] for key in keys)
    max_y = max(key["cy"] + key["bh"] for key in keys)

    out_keys = []
    for key in keys:
        out_keys.append(
            {
                "legend": key["legend"],
                "x": round(key["cx"] - key["w"] / 2 - min_x + PAD, 3),
                "y": round(key["cy"] - 0.5 - min_y + PAD, 3),
                "w": key["w"],
                "rot": key["rot"],
            }
        )

    width = round(max_x - min_x + 2 * PAD, 3)
    height = round(max_y - min_y + 2 * PAD, 3)
    out = {
        "name": "Zerosprey42",
        "units": "key units (18.42 mm), read from the PCB switch positions",
        "width": width,
        "height": height,
        "source": {
            "layout": "assets/physical-layout.json, read from the PCB by tools/read-pcb.py",
            "why not Vial": "the Vial definition scatters the thumbs and drops the outer columns",
        },
        "keys": out_keys,
    }
    (ROOT / "assets" / "board.json").write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote assets/board.json: {len(out_keys)} keys, {width:.1f} by {height:.1f} key units")


main()
