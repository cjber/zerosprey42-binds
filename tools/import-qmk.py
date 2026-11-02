#!/usr/bin/env python3
"""Import QMK keyboard layouts as selectable boards.

The layouts come from QMK's own `info.json` / `keyboard.json` files, which list every key with its
physical x/y in key units, so the app draws the board the firmware thinks it has. Legends are
assigned by position (QWERTY letters on the three letter rows, Space/Enter on the thumbs), because
QMK layouts carry matrix positions rather than key legends.

usage: python3 tools/import-qmk.py [board-id ...]   (default: every board below)
"""

import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "boards"
RAW = "https://raw.githubusercontent.com/qmk/qmk_firmware/master/keyboards"

# id: (name, QMK path, layout name, legend series). Legends are in the layout's own physical order:
# each row left to right, then the thumbs.
BOARDS = {
    "corne": (
        "Corne 3x6",
        "crkbd/info.json",
        "LAYOUT_split_3x6_3",
        [
            ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "Bksp"],
            ["Ctrl", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'"],
            ["Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Shift"],
            ["Super", "Lower", "Space", "Enter", "Raise", "AltGr"],
        ],
    ),
    "corne-3x5": (
        "Corne 3x5",
        "crkbd/info.json",
        "LAYOUT_split_3x5_3",
        [
            ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
            ["A", "S", "D", "F", "G", "H", "J", "K", "L", ";"],
            ["Z", "X", "C", "V", "B", "N", "M", ",", ".", "/"],
            ["Super", "Lower", "Space", "Enter", "Raise", "AltGr"],
        ],
    ),
    "sofle": (
        "Sofle",
        "sofle/rev1/keyboard.json",
        "LAYOUT",
        [
            ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="],
            ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "Bksp"],
            ["Ctrl", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'"],
            ["Shift", "Z", "X", "C", "V", "B", "Knob L", "Knob R", "N", "M", ",", ".", "/", "Shift"],
            ["Super", "Lower", "Space", "Space2", "Lower2", "Enter", "Raise", "AltGr", "Raise2", "AltGr2"],
        ],
    ),
    "lily58": (
        "Lily58",
        "lily58/rev1/keyboard.json",
        "LAYOUT",
        [
            ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="],
            ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "Bksp"],
            ["Ctrl", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'"],
            ["Shift", "Z", "X", "C", "V", "B", "Inner L", "Inner R", "N", "M", ",", ".", "/", "Shift"],
            ["Super", "Lower", "Space", "Space2", "Enter", "Raise", "AltGr", "Raise2"],
        ],
    ),
    "planck": (
        "Planck 4x12",
        "planck/rev6/keyboard.json",
        "LAYOUT_ortho_4x12",
        [
            ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="],
            ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "Bksp"],
            ["Ctrl", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'"],
            ["Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Shift"],
        ],
    ),
}


def fetch(path: str) -> dict:
    with urllib.request.urlopen(f"{RAW}/{path}", timeout=60) as response:
        return json.loads(response.read())


def main():
    wanted = set(__import__("sys").argv[1:]) or set(BOARDS)
    OUT.mkdir(parents=True, exist_ok=True)
    index = {
        "boards": [
            {
                "id": "zerosprey42",
                "name": "Zerosprey42",
                "file": "assets/board.json",
                "keys": 42,
                "source": "the keyboard's PCB, read by tools/read-pcb.py",
            }
        ]
    }

    for board_id in sorted(wanted):
        name, path, layout_name, series = BOARDS[board_id]
        data = fetch(path)
        layout = data["layouts"][layout_name]["layout"]
        legends = [legend for row in series for legend in row]
        if len(legends) != len(layout):
            raise SystemExit(f"{board_id}: {len(legends)} legends for {len(layout)} keys")

        keys = []
        for entry, legend in zip(layout, legends):
            keys.append(
                {
                    "legend": legend,
                    "x": round(entry.get("x", 0), 3),
                    "y": round(entry.get("y", 0), 3),
                    "w": entry.get("w", 1),
                    "rot": entry.get("r", 0),
                }
            )

        # Shift the board so its top-left key starts at 0.5, then publish the box. The layout already
        # leaves a gap between the hands, so no gap normalisation is needed.
        min_x = min(key["x"] for key in keys)
        min_y = min(key["y"] for key in keys)
        pad = 0.5
        for key in keys:
            key["x"] = round(key["x"] - min_x + pad, 3)
            key["y"] = round(key["y"] - min_y + pad, 3)

        width = round(max(key["x"] + key["w"] for key in keys) + pad, 3)
        height = round(max(key["y"] for key in keys) + 1 + pad, 3)
        board = {
            "name": name,
            "units": "key units, from the QMK layout",
            "width": width,
            "height": height,
            "source": {"file": path, "layout": layout_name, "read": f"{RAW}/{path}"},
            "keys": keys,
        }
        (OUT / f"{board_id}.json").write_text(json.dumps(board, indent=1) + "\n")
        index["boards"].append(
            {
                "id": board_id,
                "name": name,
                "file": f"assets/boards/{board_id}.json",
                "keys": len(keys),
                "source": path,
            }
        )
        print(f"wrote assets/boards/{board_id}.json ({len(keys)} keys)")

    (OUT / "index.json").write_text(json.dumps(index, indent=1) + "\n")
    print(f"wrote assets/boards/index.json ({len(index['boards'])} boards)")


main()
