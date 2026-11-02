#!/usr/bin/env python3
"""Read a Vial keyboard's own definition and keymap over raw HID.

Vial speaks 32-byte HID reports: byte 0 is 0xFE magic, byte 1 the command. The
definition is a qCompress blob (4-byte big-endian length, then a zlib stream),
served 32 bytes at a time. The keymap comes from QMK's dynamic keymap, which Vial
reaches through the same interface with VIA's own command ids.

usage: python3 tools/vial-read.py [--write assets/board.json]
"""

import json
import struct
import sys
import time
import zlib

import hid

VID, PID = 0xBEEB, 0x0002
RAW_USAGE_PAGE, RAW_USAGE = 0xFF60, 0x61

MSG = 32
MAGIC = 0xFE

VIAL_GET_KEYBOARD_ID = 0x00
VIAL_GET_SIZE = 0x01
VIAL_GET_DEF = 0x02

VIA_GET_KEYMAP_SIZE = 0x11
VIA_GET_LAYER_COUNT = 0x12
VIA_GET_KEYCODE = 0x04


def open_raw():
    for info in hid.enumerate(VID, PID):
        if info["usage_page"] == RAW_USAGE_PAGE and info["usage"] == RAW_USAGE:
            device = hid.device()
            device.open_path(info["path"])
            device.set_nonblocking(False)
            return device
    raise SystemExit("no Vial raw HID interface found; is the keyboard plugged in?")


def talk(device, payload):
    """Send one 32-byte report and read the 32-byte answer."""
    message = bytes([MAGIC]) + bytes(payload) + bytes(MSG - 1 - len(payload))
    device.write(bytes([0x00]) + message)
    for _ in range(50):
        reply = device.read(MSG, timeout_ms=200)
        if reply:
            data = bytes(reply)
            while len(data) < MSG:
                more = device.read(MSG, timeout_ms=200)
                if not more:
                    break
                data += bytes(more)
            return data[:MSG]
        time.sleep(0.01)
    return None


def main():
    device = open_raw()
    identity = talk(device, bytes([VIAL_GET_KEYBOARD_ID]))
    version = struct.unpack("<I", identity[:4])[0]
    uid = identity[4:12].hex()
    print(f"vial protocol {version}, keyboard uid {uid}")

    size_reply = talk(device, bytes([VIAL_GET_SIZE]))
    size = struct.unpack("<I", size_reply[:4])[0]
    print(f"definition: {size} bytes")

    blob = bytearray()
    page = 0
    while len(blob) < size:
        reply = talk(device, bytes([VIAL_GET_DEF, page & 0xFF, (page >> 8) & 0xFF]))
        if not reply:
            break
        blob += reply
        page += 1
    blob = bytes(blob[:size])

    text = None
    for candidate in (blob, blob[4:]):
        try:
            text = zlib.decompress(candidate).decode("utf-8")
            break
        except Exception:
            continue
    if text is None:
        print("could not decompress the definition; first bytes:", blob[:16].hex())
        raise SystemExit(1)

    definition = json.loads(text)
    out = {
        "keyboard": definition.get("name", "unknown"),
        "protocol": version,
        "uid": uid,
        "layout_options": definition.get("layout_options"),
        "matrix": definition.get("matrix"),
        "layouts": list(definition.get("layouts", {})),
    }
    print(json.dumps(out, indent=2))

    layout_name = next(iter(definition.get("layouts", {})), None)
    if layout_name:
        keys = definition["layouts"][layout_name].get("layout", [])
        print(f"layout {layout_name}: {len(keys)} keys")

    target = sys.argv[2] if len(sys.argv) > 2 and sys.argv[1] == "--write" else None
    if target:
        path = target
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(definition, handle, indent=1)
            handle.write("\n")
        print(f"wrote {path}")


main()
