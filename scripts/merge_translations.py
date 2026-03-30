#!/usr/bin/env python3
"""Merge translation chunks into dream_entries.json."""

import json
import os
import sys

DATA_FILE = "/Users/mktr/Desktop/almanami/data/dream_entries.json"
CHUNK_COUNT = 6


def main():
    # Load existing data
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        dream_dict = json.load(f)

    # Load and merge all translation chunks
    all_translations = {}
    for i in range(CHUNK_COUNT):
        chunk_path = f"/tmp/dream_translations_{i}.json"
        if not os.path.exists(chunk_path):
            print(f"WARNING: {chunk_path} not found, skipping")
            continue
        try:
            with open(chunk_path, 'r', encoding='utf-8') as f:
                chunk = json.load(f)
            all_translations.update(chunk)
            print(f"Chunk {i}: {len(chunk)} translations loaded")
        except json.JSONDecodeError as e:
            print(f"ERROR: Chunk {i} has invalid JSON: {e}")
            # Try to salvage partial JSON
            continue

    print(f"\nTotal translations: {len(all_translations)}")

    # Apply translations to dream_dict
    applied = 0
    missing = 0
    for key, entry in dream_dict.items():
        # Build English aliases
        en_names = [key]
        for alias in entry.get("aliases", []):
            en_names.append(alias.lower())
        en_names = list(set(en_names))

        # Look up translation
        trans = all_translations.get(key)

        lookup = {"en": en_names}
        if trans:
            for lang in ("fr", "ar", "tr", "de"):
                if lang in trans and trans[lang]:
                    vals = trans[lang]
                    if isinstance(vals, list):
                        lookup[lang] = [t.lower() if lang != "ar" else t for t in vals]
                    else:
                        lookup[lang] = [vals.lower() if lang != "ar" else vals]
            applied += 1
        else:
            for lang in ("fr", "ar", "tr", "de"):
                lookup[lang] = []
            missing += 1

        entry["lookup_aliases"] = lookup

    print(f"Applied: {applied}, Missing translations: {missing}")

    # Write output
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(dream_dict, f, indent=2, ensure_ascii=False)

    size_mb = os.path.getsize(DATA_FILE) / (1024 * 1024)
    print(f"Written to {DATA_FILE} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
