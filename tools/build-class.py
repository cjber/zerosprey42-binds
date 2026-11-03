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

# The wago.tools exports live under a folder named for the client build they were taken from, so the
# recorded provenance is the build actually read rather than a version typed in by hand.
SPELLNAME_BUILD = pathlib.Path(SPELLNAME).parent.name

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
MAGE_KIND_OVERRIDES = {
    "Arcane Intellect": "buff",
    "Frost Armor": "buff",
    "Ice Armor": "buff",
    "Mage Armor": "buff",
    "Dampen Magic": "buff",
    "Amplify Magic": "buff",
    "Mana Shield": "buff",
    "Fire Ward": "buff",
    "Frost Ward": "buff",
    "Ice Barrier": "buff",
    "Evocation": "buff",
    "Conjure Water": "utility",
    "Conjure Food": "utility",
    "Conjure Mana Agate": "utility",
    "Conjure Mana Jade": "utility",
    "Conjure Mana Citrine": "utility",
    "Conjure Mana Ruby": "utility",
    "Polymorph": "utility",
    "Slow Fall": "utility",
    "Remove Lesser Curse": "utility",
    "Blink": "utility",
    "Counterspell": "utility",
}

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


# Every ability that is not an attack, per class, so only a rotation spell falls through to the keyword
# rules. These are the client's own trainer lists: a heal, a buff or a totem has no keyword that tells it
# apart from a strike, so naming them here is the honest way to classify them.
CLASS_KINDS = {
    "warrior": {
        "Battle Shout": "buff", "Charge": "utility", "Hamstring": "utility", "Bloodrage": "utility",
        "Shield Bash": "utility", "Demoralizing Shout": "buff", "Mocking Blow": "utility",
        "Shield Block": "buff", "Disarm": "utility", "Intimidating Shout": "utility",
        "Retaliation": "buff", "Sunder Armor": "utility", "Challenging Shout": "utility",
        "Shield Wall": "buff", "Berserker Rage": "buff", "Pummel": "utility", "Intercept": "utility",
        "Recklessness": "buff",
    },
    "paladin": {
        "Devotion Aura": "buff", "Blessing of Might": "buff", "Judgement": "attack",
        "Seal of Righteousness": "buff", "Divine Protection": "buff", "Holy Light": "utility",
        "Seal of the Crusader": "buff", "Hammer of Justice": "utility", "Purify": "utility",
        "Blessing of Protection": "buff", "Lay on Hands": "utility", "Blessing of Wisdom": "buff",
        "Retribution Aura": "buff", "Righteous Fury": "buff", "Blessing of Freedom": "buff",
        "Flash of Light": "utility", "Concentration Aura": "buff", "Seal of Justice": "buff",
        "Redemption": "utility", "Turn Undead": "utility", "Blessing of Salvation": "buff",
        "Shadow Resistance Aura": "buff", "Divine Intervention": "utility", "Seal of Command": "buff",
        "Seal of Light": "buff", "Frost Resistance Aura": "buff", "Divine Shield": "buff",
        "Fire Resistance Aura": "buff", "Seal of Wisdom": "buff", "Blessing of Light": "buff",
        "Cleanse": "utility", "Blessing of Sacrifice": "buff", "Holy Shock": "attack",
        "Holy Shield": "buff", "Greater Blessing of Might": "buff",
        "Greater Blessing of Wisdom": "buff", "Greater Blessing of Kings": "buff",
        "Greater Blessing of Light": "buff", "Greater Blessing of Salvation": "buff",
    },
    "rogue": {
        "Stealth": "utility", "Pick Pocket": "utility", "Gouge": "utility", "Evasion": "buff",
        "Sap": "utility", "Slice and Dice": "buff", "Sprint": "utility", "Kick": "utility",
        "Expose Armor": "utility", "Feint": "utility", "Distract": "utility", "Vanish": "utility",
        "Detect Traps": "utility", "Cheap Shot": "utility", "Disarm Trap": "utility",
        "Kidney Shot": "utility", "Blind": "utility", "Safe Fall": "buff",
    },
    "priest": {
        "Power Word: Fortitude": "buff", "Lesser Heal": "utility", "Power Word: Shield": "buff",
        "Fade": "utility", "Renew": "utility", "Resurrection": "utility", "Inner Fire": "buff",
        "Cure Disease": "utility", "Psychic Scream": "utility", "Heal": "utility", "Dispel Magic": "utility", "Flash Heal": "utility", "Mind Soothe": "utility", "Shackle Undead": "utility", "Mind Vision": "utility", "Mind Control": "utility",
        "Prayer of Healing": "utility", "Shadow Protection": "buff", "Abolish Disease": "utility",
        "Levitate": "buff", "Divine Spirit": "buff", "Greater Heal": "utility", "Lightwell": "utility",
        "Prayer of Spirit": "buff",
    },
    "shaman": {
        "Rockbiter Weapon": "buff", "Earthbind Totem": "utility", "Healing Wave": "utility",
        "Lightning Shield": "buff", "Stoneclaw Totem": "utility", "Flametongue Weapon": "buff",
        "Strength of Earth Totem": "buff", "Ancestral Spirit": "utility", "Purge": "utility",
        "Cure Disease": "utility", "Stoneskin Totem": "buff", "Cure Poison": "utility",
        "Tremor Totem": "utility", "Frostbrand Weapon": "buff", "Ghost Wolf": "utility",
        "Lesser Healing Wave": "utility", "Searing Totem": "pet", "Poison Cleansing Totem": "utility",
        "Water Breathing": "buff", "Frost Resistance Totem": "buff", "Far Sight": "utility",
        "Magma Totem": "pet", "Mana Spring Totem": "buff", "Fire Resistance Totem": "buff",
        "Flametongue Totem": "buff", "Water Walking": "buff", "Astral Recall": "utility",
        "Grounding Totem": "utility", "Healing Stream Totem": "utility",
        "Nature Resistance Totem": "buff", "Reincarnation": "utility", "Windfury Weapon": "buff",
        "Windfury Totem": "buff", "Sentry Totem": "utility", "Windwall Totem": "buff",
        "Disease Cleansing Totem": "utility", "Chain Heal": "utility", "Grace of Air Totem": "buff",
        "Mana Tide Totem": "buff",
    },
    "warlock": {
        "Curse of Weakness": "utility", "Life Tap": "utility", "Fear": "utility",
        "Create Healthstone": "utility", "Health Funnel": "utility",
        "Curse of Recklessness": "utility", "Unending Breath": "buff", "Create Soulstone": "utility",
        "Demon Armor": "buff", "Ritual of Summoning": "utility", "Eye of Kilrogg": "utility",
        "Sense Demons": "utility", "Curse of Tongues": "utility", "Detect Invisibility": "buff",
        "Banish": "utility", "Create Firestone": "utility", "Subjugate Demon": "utility",
        "Shadow Ward": "buff", "Create Spellstone": "utility", "Howl of Terror": "utility",
        "Gray Wolf": "utility",
    },
    "druid": {
        "Mark of the Wild": "buff", "Rejuvenation": "utility", "Thorns": "buff",
        "Entangling Roots": "utility", "Healing Touch": "utility", "Demoralizing Roar": "buff",
        "Enrage": "utility", "Regrowth": "utility", "Bash": "utility", "Faerie Fire": "utility",
        "Hibernate": "utility", "Nature's Grasp": "buff", "Cat Form": "utility", "Prowl": "utility",
        "Rebirth": "utility", "Soothe Animal": "utility", "Remove Curse": "utility",
        "Tiger's Fury": "buff", "Abolish Poison": "utility", "Dash": "utility",
        "Challenging Roar": "utility", "Cower": "utility", "Tranquility": "utility",
        "Travel Form": "utility", "Track Humanoids": "utility", "Frenzied Regeneration": "buff",
        "Pounce": "utility", "Dire Bear Form": "utility", "Feline Grace": "passive",
        "Innervate": "utility", "Barkskin": "buff",
    },
}


def kind_for(name: str, klass: str) -> str:
    if name in CLASS_KINDS.get(klass, {}):
        return CLASS_KINDS[klass][name]
    overrides = MAGE_KIND_OVERRIDES if klass == "mage" else KIND_OVERRIDES
    if name in overrides:
        return overrides[name]
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
        kind = kind_for(name, CLASS)
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
                "source": f"cjber/tweaks-forever Data/ClassSpells.lua + SpellName (wago.tools, {SPELLNAME_BUILD})",
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
