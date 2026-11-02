#!/usr/bin/env python3
"""Build assets/board.json: the Zerosprey42's 42 keys, their arrangement and their legends.

Facts taken from the board itself: beekeeb/zerosprey42 pcb/zerosprey42.kicad_pcb has 42 switch
footprints, 36 of them 1u and 2 of them 1.5u (the outer thumbs), and six thumb switches in total; the
Vial firmware (beekeeb/vial-qmk-zerosprey42) gives the key order and the legends.

The PCB's own coordinates are stored in a rotated frame that does not resolve into the board's rows
and columns, so the arrangement is modelled here: three rows of six per half, column staggered by
half a key at the outer columns, a one-key gap between the halves, and three thumbs per half angled
towards the middle, with the outer thumb of each half at 1.5u.
"""

import json
import pathlib

LEGEND = {
    "KC_TAB": "Tab", "KC_Q": "Q", "KC_W": "W", "KC_E": "E", "KC_R": "R", "KC_T": "T",
    "KC_Y": "Y", "KC_U": "U", "KC_I": "I", "KC_O": "O", "KC_P": "P", "KC_BSPC": "Bksp",
    "KC_LCTL": "Ctrl", "KC_A": "A", "KC_S": "S", "KC_D": "D", "KC_F": "F", "KC_G": "G",
    "KC_H": "H", "KC_J": "J", "KC_K": "K", "KC_L": "L", "KC_SCLN": ";", "KC_QUOT": "'",
    "KC_LSFT": "Shift", "KC_Z": "Z", "KC_X": "X", "KC_C": "C", "KC_V": "V", "KC_B": "B",
    "KC_N": "N", "KC_M": "M", "KC_COMM": ",", "KC_DOT": ".", "KC_SLSH": "/", "KC_RSFT": "Shift",
    "KC_LGUI": "Super", "MO(1)": "Lower", "KC_SPC": "Space", "KC_ENT": "Enter", "MO(2)": "Raise",
    "KC_RALT": "AltGr",
}

ROW_LEGENDS = [
    ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "Bksp"],
    ["Ctrl", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'"],
    ["Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Shift"],
    ["Super", "Lower", "Space", "Enter", "Raise", "AltGr"],
]

# Half a key of stagger on the outer columns, none in the middle: the shape of the real board.
STAGGER = [0.5, 0.25, 0.0, 0.0, 0.25, 0.5]
GAP = 1.0  # between the two halves

THUMBS = [
    # (half, index, width, x offset inside the half, y, rotation)
    ("left", 0, 1.5, 2.6, 3.35, 12),
    ("left", 1, 1.0, 4.2, 3.55, 4),
    ("left", 2, 1.0, 5.25, 3.75, -4),
    ("right", 0, 1.0, 0.75, 3.75, 4),
    ("right", 1, 1.0, 1.8, 3.55, -4),
    ("right", 2, 1.5, 3.4, 3.35, -12),
]


def main():
    keys = []

    for row, legends in enumerate(ROW_LEGENDS[:3]):
        for column, legend in enumerate(legends):
            left = column < 6
            x = column if left else column + GAP
            y = row + STAGGER[column - 6 if not left else column]
            keys.append({"legend": legend, "x": round(x, 2), "y": round(y, 2), "w": 1, "rot": 0})

    half_width = 6
    for half, index, width, offset, y, rot in THUMBS:
        x = offset if half == "left" else half_width + GAP + offset
        keys.append(
            {"legend": ROW_LEGENDS[3][index if half == "left" else index + 3], "x": round(x, 2),
             "y": round(y, 2), "w": width, "rot": rot}
        )

    if len(keys) != 42:
        raise SystemExit(f"built {len(keys)} keys, expected 42")

    out = {
        "name": "Zerosprey42",
        "units": "key units, 1u = 19.05mm",
        "source": {
            "board": "beekeeb/zerosprey42: 42 switches, 36 at 1u and 2 at 1.5u, six thumbs",
            "firmware": "beekeeb/vial-qmk-zerosprey42: LAYOUT_split_3x6_3 order and legends",
            "arrangement": "modelled: 3x6 per half, half-key stagger on the outer columns, six angled thumbs",
        },
        "keys": keys,
    }
    pathlib.Path("assets/board.json").write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote assets/board.json: {len(keys)} keys")


main()
