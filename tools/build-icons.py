#!/usr/bin/env python3
"""Set every ability's icon from the game's own tables, by spell ID.

Chain: SpellMisc (SpellID -> SpellIconFileDataID) and ManifestInterfaceData
(FileDataID -> FileName, e.g. "ability_hunter_aimedshot.blp"). Both are exported for
the same build from wago.tools.

usage: python3 tools/build-icons.py SpellMisc.csv ManifestInterfaceData.csv assets/classes/hunter.json
"""

import csv
import json
import pathlib
import sys

SPELLMISC, MANIFEST, CLASSFILE = sys.argv[1:4]


def main():
    icon_by_fdid = {}
    with open(MANIFEST, newline="", encoding="utf-8", errors="replace") as handle:
        for row in csv.DictReader(handle):
            path = (row.get("FilePath") or "").lower()
            name = (row.get("FileName") or "").lower()
            if "icons" in path and name.endswith(".blp"):
                icon_by_fdid[int(row["ID"])] = name[: -len(".blp")]

    icon_by_spell = {}
    with open(SPELLMISC, newline="", encoding="utf-8", errors="replace") as handle:
        for row in csv.DictReader(handle):
            try:
                spell = int(row["SpellID"])
                fdid = int(row["SpellIconFileDataID"])
            except (TypeError, ValueError):
                continue
            if not fdid:
                continue
            # Difficulty variants share a SpellID; the first non-zero icon wins.
            icon_by_spell.setdefault(spell, fdid)

    path = pathlib.Path(CLASSFILE)
    data = json.loads(path.read_text())
    changed, missing = 0, []
    for ability in data["abilities"]:
        spell = ability.get("spellId")
        if not spell:
            missing.append(ability["name"])
            continue
        fdid = icon_by_spell.get(spell)
        icon = icon_by_fdid.get(fdid) if fdid else None
        if not icon:
            missing.append(f"{ability['name']} ({spell})")
            continue
        if ability.get("icon") != icon:
            changed += 1
        ability["icon"] = icon

    path.write_text(json.dumps(data, indent=2) + "\n")
    print(f"{CLASSFILE}: {changed} icons set from the game tables, {len(missing)} unresolved")
    if missing:
        print("unresolved:", ", ".join(missing[:10]))


main()
