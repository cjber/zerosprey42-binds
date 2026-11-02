#!/usr/bin/env python3
"""Build assets/classes/<class>.json from the client's own data.

Inputs:
  1. Data/ClassSpells.lua from cjber/tweaks-forever: {spellID, level, fee, skillLine} per class, taken
     from the Forever client and CMaNGOS.
  2. The SpellName DB2 table for the same build, exported from wago.tools: ID,Name.

Ranks share a name, and only the first rank needs a slot, so the list keeps the earliest level per name.
Spell art is not in either table; known icons are mapped by name, and anything else falls back to an icon
chosen by kind, so every entry still has art.

usage: python3 tools/build-class.py <ClassSpells.lua> <SpellName.csv> <CLASS> <out.json>
"""

import csv
import json
import pathlib
import re
import sys

CLASSES, SPELLNAME, CLASS, OUT = sys.argv[1:5]

# Checked in this order: the first match wins, so "Track Humanoids" is utility, not a pet action,
# and "Aspect of the Hawk" is a buff.
KIND_RULES = [
    ("utility", ["track", "trap", "scare", "eagle eye", "eyes of the beast", "feign", "distract",
                 "flare", "sense", "mark", "revive"]),
    ("buff", ["aspect", "stance", "aura", "wild"]),
    ("pet", ["pet", "call", "dismiss", "feed", "tame", "mend", "claw", "bite", "growl", "cower"]),
    ("attack", ["shot", "sting", "strike", "blast", "volley", "multi", "aimed", "arcan", "serpent",
                "wing clip"]),
]

# Art that is known to exist under a stable name; everything else gets the kind's icon.
ICONS = {
    "Arcane Shot": "ability_hunter_aimedshot",
    "Serpent Sting": "ability_hunter_quickshot",
    "Hunter's Mark": "ability_hunter_snipershot",
    "Mend Pet": "ability_hunter_mendpet",
    "Revive Pet": "ability_hunter_beastsoothe",
    "Call Pet": "ability_hunter_beastcall",
    "Dismiss Pet": "ability_hunter_beastcall02",
    "Tame Beast": "ability_hunter_beasttaming",
    "Feed Pet": "inv_misc_food_18",
    "Aspect of the Monkey": "ability_hunter_aspectofthemonkey",
    "Aspect of the Hawk": "spell_nature_ravenform",
    "Track Beasts": "ability_tracking",
    "Track Humanoids": "ability_tracking",
    "Concussive Shot": "spell_frost_stun",
    "Raptor Strike": "ability_meleedamage",
    "Distracting Shot": "spell_arcane_blast",
}

# Names the keyword rules get wrong, pinned by hand.
KIND_OVERRIDES = {
    "Mongoose Bite": "attack",
    "Counterattack": "attack",
    "Beast Lore": "utility",
    "Disengage": "utility",
    "Rapid Fire": "buff",
    "Trueshot Aura": "buff",
    "Wing Clip": "attack",
}

KIND_ICON = {
    "attack": "ability_hunter_quickshot",
    "pet": "ability_hunter_beastcall",
    "buff": "spell_nature_ravenform",
    "utility": "ability_tracking",
    "passive": "inv_misc_questionmark",
}


def kind_for(name: str) -> str:
    if name in KIND_OVERRIDES:
        return KIND_OVERRIDES[name]
    lowered = name.lower()
    for kind, words in KIND_RULES:
        if any(word in lowered for word in words):
            return kind
    return "attack"


def main():
    text = pathlib.Path(CLASSES).read_text()
    block = text.split(f"{CLASS.upper()} = {{", 1)[1].split("\n\t},", 1)[0]
    entries = re.findall(r"\{\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\s*\}", block)

    names = {}
    with open(SPELLNAME, newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            names[int(row["ID"])] = row["Name_lang"]

    by_name = {}
    missing = []
    for spell_id, level, _fee, _line in entries:
        spell_id, level = int(spell_id), int(level)
        name = names.get(spell_id)
        if not name:
            missing.append(spell_id)
            continue
        # Ranks share a name: keep the earliest level, and remember the id of that first rank.
        if name not in by_name or level < by_name[name]["level"]:
            by_name[name] = {"name": name, "level": level, "id": spell_id}

    abilities = []
    for name, entry in sorted(by_name.items(), key=lambda item: (item[1]["level"], item[0])):
        kind = kind_for(name)
        abilities.append(
            {
                "name": name,
                "level": entry["level"],
                "kind": kind,
                "icon": ICONS.get(name, KIND_ICON[kind]),
                "spellId": entry["id"],
            }
        )

    existing = pathlib.Path(OUT)
    macros = json.loads(existing.read_text()).get("macros", []) if existing.exists() else []

    existing.write_text(
        json.dumps(
            {
                "class": CLASS,
                "source": "cjber/tweaks-forever Data/ClassSpells.lua + SpellName (wago.tools, 1.60.1.70707)",
                "note": "one entry per ability, at the level its first rank is trained; ranks share a name",
                "abilities": abilities,
                "macros": macros,
            },
            indent=2,
        )
        + "\n"
    )
    print(f"{OUT}: {len(abilities)} abilities from {len(entries)} trainer spells")
    if missing:
        print(f"no name for {len(missing)} ids: {missing[:8]}")


main()
