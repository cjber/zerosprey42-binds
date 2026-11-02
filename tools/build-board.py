#!/usr/bin/env python3
"""Build assets/board.json from the keyboard's own Vial definition.

`assets/vial-definition.json` is read off the board over raw HID by
`tools/vial-read.py` (XZ-compressed JSON served in 32-byte pages), so it is the
layout this exact keyboard reports, not a copy from a repository.

Its KLE carries the 36 body keys properly: six columns per hand, three rows, and
a full key of drop on the two outer columns, with a fraction of a key between the
inner columns. The six thumb entries are the one part it gets wrong (their
rotation origins accumulate until they scatter down the canvas), so the thumbs are
placed under the inner columns instead, which is where the board puts them.
"""

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

# matrix "row,col" -> the legend the firmware keymap puts on it
LEGENDS = {
    "0,0": "Tab", "1,0": "Q", "0,1": "W", "1,1": "E", "0,2": "R", "1,2": "T",
    "2,0": "Ctrl", "3,0": "A", "2,1": "S", "3,1": "D", "2,2": "F", "3,2": "G",
    "4,0": "Shift", "5,0": "Z", "4,1": "X", "5,1": "C", "4,2": "V", "5,2": "B",
    "0,3": "Y", "1,3": "U", "0,4": "I", "1,4": "O", "0,5": "P", "1,5": "Bksp",
    "2,3": "H", "3,3": "J", "2,4": "K", "3,4": "L", "2,5": ";", "3,5": "'",
    "4,3": "N", "5,3": "M", "4,4": ",", "5,4": ".", "4,5": "/", "5,5": "Shift",
}

# Where the six thumbs sit: under the three inner columns of each hand, in a fan.
# (matrix label, legend, width in keys, column to centre on, extra y, rotation)
THUMBS = [
    ("6,1", "Lower", 1.0, 4.0, 0.10, 6),
    ("6,2", "Space", 1.5, 5.0, 0.22, -2),
    ("6,0", "Super", 1.0, 3.0, 0.00, 10),
    ("6,3", "Enter", 1.5, 9.5, 0.22, 2),
    ("6,4", "Raise", 1.0, 10.5, 0.10, -6),
    ("6,5", "AltGr", 1.0, 11.5, 0.00, -10),
]


def main():
    definition = json.loads((ROOT / "assets" / "vial-definition.json").read_text())

    keys = []
    y = 0.0
    for row in definition["layouts"]["keymap"]:
        x = 0.0
        width = height = 1.0
        for item in row:
            if isinstance(item, dict):
                x += item.get("x", 0.0)
                y += item.get("y", 0.0)
                width = item.get("w", width)
                height = item.get("h", height)
            else:
                matrix_row = int(item.split(",")[0])
                if matrix_row < 6:  # the body; thumbs are placed below
                    keys.append(
                        {
                            "matrix": item,
                            "legend": LEGENDS[item],
                            "x": round(x, 3),
                            "y": round(y, 3),
                            "w": width,
                            "rot": 0,
                        }
                    )
                x += width
                width = height = 1.0
        y += 1.0

    if len(keys) != 36:
        raise SystemExit(f"body has {len(keys)} keys, expected 36")

    # The definition leaves a wide gap between the hands (3.5 keys); the board itself is a monoblock
    # with about one key between them, so close it up and keep every other offset as reported.
    left = [k for k in keys if k["x"] < 6]
    right = [k for k in keys if k["x"] >= 6]
    if left and right:
        gap = min(k["x"] for k in right) - max(k["x"] + k["w"] for k in left)
        shift = gap - 1.0
        for key in right:
            key["x"] = round(key["x"] - shift, 3)

    bottom = max(key["y"] for key in keys) + 1.0
    for matrix, legend, width, column, extra, rotation in THUMBS:
        keys.append(
            {
                "matrix": matrix,
                "legend": legend,
                "x": round(column - (width - 1) / 2, 3),
                "y": round(bottom + extra, 3),
                "w": width,
                "rot": rotation,
            }
        )

    if len(keys) != 42:
        raise SystemExit(f"built {len(keys)} keys, expected 42")

    out = {
        "name": "Zerosprey42",
        "units": "key units, read from the keyboard's own Vial definition",
        "source": {
            "definition": "assets/vial-definition.json, read over raw HID by tools/vial-read.py",
            "legends": "the firmware's LAYOUT_split_3x6_3 keymap",
            "thumbs": "placed under the inner columns; the definition's own thumb entries scatter",
        },
        "keys": keys,
    }
    (ROOT / "assets" / "board.json").write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote assets/board.json: {len(keys)} keys, x to {max(k['x'] + k['w'] for k in keys):.1f}, y to {max(k['y'] for k in keys) + 1:.1f}")


main()
