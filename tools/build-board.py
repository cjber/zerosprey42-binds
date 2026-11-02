#!/usr/bin/env python3
"""Build assets/board.json from the keyboard's own Vial layout.

`assets/vial-definition.json` is the layout the firmware serves over raw HID (read by
`tools/vial-read.py`), and it is the same layout Vial draws in its Keymap tab. This file parses its
KLE with the two rules that matter here:

* `x` restarts at 0 on each row, and `y` accumulates across rows.
* setting `rx`/`ry` moves the cursor to the rotation pivot, which is how the six thumb entries land in
  a row under the inner columns rather than cascading down the canvas.

Getting the second rule wrong is what made an earlier build scatter the thumbs and drop the outer
columns, so it is spelled out rather than hidden in a helper.
"""

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

# matrix "row,col" -> what Vial prints on the key in the default layer
LEGENDS = {
    "0,0": "Tab", "1,0": "Q", "0,1": "W", "1,1": "E", "0,2": "R", "1,2": "T",
    "2,0": "Esc", "3,0": "A", "2,1": "S", "3,1": "D", "2,2": "F", "3,2": "G",
    "4,0": "LShift", "5,0": "Z", "4,1": "X", "5,1": "C", "4,2": "V", "5,2": "B",
    "0,3": "Y", "1,3": "U", "0,4": "I", "1,4": "O", "0,5": "P", "1,5": "Bksp",
    "2,3": "H", "3,3": "J", "2,4": "K", "3,4": "L", "2,5": ";", "3,5": "'",
    "4,3": "N", "5,3": "M", "4,4": "<", "5,4": ">", "4,5": "?", "5,5": "RShift",
    # the thumb row, exactly as the keymap labels it
    "6,0": "LGui", "6,1": "MO(1)", "6,2": "Space",
    "6,3": "Enter", "6,4": "MO(2)", "6,5": "MO(3)",
}

# Vial draws all six thumbs at one key wide: the KLE carries no width for them, and the point here is
# to match the layout Vial shows.
WIDE = set()


def main():
    definition = json.loads((ROOT / "assets" / "vial-definition.json").read_text())

    keys = []
    x = y = 0.0
    rotation = 0.0
    rx = ry = 0.0
    width = height = 1.0
    for row in definition["layouts"]["keymap"]:
        x = 0.0
        for item in row:
            if isinstance(item, dict):
                if "rx" in item or "ry" in item:
                    rx = item.get("rx", rx)
                    ry = item.get("ry", ry)
                    # The pivot is also where the rest of this row starts.
                    x, y = rx, ry
                x += item.get("x", 0.0)
                y += item.get("y", 0.0)
                rotation = item.get("r", rotation)
                width = item.get("w", width)
                height = item.get("h", height)
            else:
                key = {
                    "matrix": item,
                    "legend": LEGENDS[item],
                    "x": round(x, 3),
                    "y": round(y, 3),
                    "w": 1.5 if item in WIDE else width,
                    "h": height,
                    "rot": rotation,
                }
                if rotation:
                    # Vial turns a key about the layout's pivot, not about the key's own centre, so
                    # keep the pivot relative to the key's top-left for the page to use.
                    key["ox"] = round(rx - x, 3)
                    key["oy"] = round(ry - y, 3)
                keys.append(key)
                x += width
                width = height = 1.0
        y += 1.0

    if len(keys) != 42:
        raise SystemExit(f"layout has {len(keys)} keys, expected 42")
    missing = set(LEGENDS) - {key["matrix"] for key in keys}
    if missing:
        raise SystemExit(f"keys missing from the layout: {sorted(missing)}")

    # Keep the reported coordinates. The 3.5 key gap between the halves is real: the thumb keys reach
    # into it, so closing it would pile them on top of each other.
    pad = 0.5
    min_x = min(key["x"] for key in keys)
    min_y = min(key["y"] for key in keys)
    for key in keys:
        key["x"] = round(key["x"] - min_x + pad, 3)
        key["y"] = round(key["y"] - min_y + pad, 3)

    out = {
        "name": "Zerosprey42",
        "units": "key units, from the keyboard's own Vial layout",
        "width": round(max(key["x"] + key["w"] for key in keys) + pad, 3),
        "height": round(max(key["y"] for key in keys) + 1 + pad, 3),
        "source": {
            "definition": "assets/vial-definition.json, read over raw HID by tools/vial-read.py",
            "legends": "the default layer Vial shows on the keys",
            "thumbs": "positions and angles exactly as the layout reports them",
        },
        "keys": keys,
    }
    (ROOT / "assets" / "board.json").write_text(json.dumps(out, indent=1) + "\n")
    print(
        f"wrote assets/board.json: {len(keys)} keys, "
        f"{out['width']:.1f} by {out['height']:.1f} key units"
    )


main()
