#!/usr/bin/env python3
"""Parse the Ibn Sirin dream dictionary PDF text into structured JSON."""

import json
import re
import sys

INPUT_FILE = "/tmp/dream_dict_raw.txt"
OUTPUT_FILE = "/Users/mktr/Desktop/almanami/data/dream_entries.json"

def find_dictionary_bounds(lines):
    """Find the start and end of the actual dictionary entries."""
    start = None
    end = None
    for i, line in enumerate(lines):
        # Dictionary starts with the first "A" section header then "Aaron:"
        if line.strip() == "A" and i + 1 < len(lines) and lines[i + 1].startswith("Aaron:"):
            start = i + 1  # skip the "A" header, start at Aaron
            break
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip() == "INDEX TO ENTRIES":
            end = i
            break
    if start is None or end is None:
        print(f"ERROR: Could not find dictionary bounds (start={start}, end={end})")
        sys.exit(1)
    return start, end


def is_entry_header(line):
    """Check if a line starts a new dictionary entry.

    Entry headers look like:
    - Aaron: (The Prophet Aaron...)
    - Abacus: (Calculator)
    - Abandoned infant: (See Orphan)
    - Five times prayers: ...
    """
    # Must start with a capital letter, contain a colon
    # Pattern: One or more capitalized words (possibly with hyphens, apostrophes, numbers)
    # followed by a colon
    pattern = r'^[A-Z][A-Za-z\'\-\u0100-\u017F\u1E00-\u1EFF]+(?:\s+[A-Za-z\'\-\u0100-\u017F\u1E00-\u1EFF0-9]+)*\s*[0-9]*\s*:'
    return bool(re.match(pattern, line))


def extract_section_headers(lines, start, end):
    """Find all single-letter section headers (A, B, C, etc.)."""
    headers = set()
    for i in range(start, end):
        line = lines[i].strip()
        if re.match(r'^[A-Z]$', line):
            headers.add(i)
    return headers


def split_entries(lines, start, end):
    """Split the dictionary text into raw entry blocks."""
    section_headers = extract_section_headers(lines, start, end)
    entries = []
    current_name = None
    current_lines = []

    for i in range(start, end):
        line = lines[i]
        stripped = line.strip()

        # Skip section headers (single letters like "A", "B", etc.)
        if i in section_headers:
            continue

        # Skip page headers/footers
        if stripped == "DICTIONARY OF DREAMS" or re.match(r'^\d+$', stripped):
            continue

        # Skip blank lines (but track them for multi-paragraph)
        if not stripped:
            if current_lines:
                current_lines.append("")
            continue

        if is_entry_header(stripped):
            # Save previous entry
            if current_name:
                entries.append((current_name, "\n".join(current_lines).strip()))
            # Start new entry
            colon_pos = stripped.index(':')
            current_name = stripped[:colon_pos].strip()
            rest = stripped[colon_pos + 1:].strip()
            current_lines = [rest] if rest else []
        else:
            # Continuation of current entry
            if current_name:
                current_lines.append(stripped)

    # Don't forget the last entry
    if current_name:
        entries.append((current_name, "\n".join(current_lines).strip()))

    return entries


def parse_entry(name, raw_text):
    """Parse a single entry into structured format."""
    entry = {
        "aliases": [],
        "text": None,
        "related_entries": [],
        "redirect": None,
    }

    # Clean up the entry name - remove trailing subscript/digit numbers
    clean_name = re.sub(r'\s*[₁₂₃₄₅₆₇₈₉₀]+$', '', name).strip()
    clean_name = re.sub(r'\s*\d+$', '', clean_name).strip()

    if not raw_text:
        return clean_name, entry

    text = raw_text

    # Check for pure redirect: (See X; Y; Z) with no other text
    redirect_match = re.match(r'^\((?:[Ss]ee\s+)(.+?)\)\s*$', text)
    if redirect_match:
        refs = [r.strip() for r in redirect_match.group(1).split(';')]
        entry["redirect"] = refs[0].lower().rstrip('.')
        entry["related_entries"] = [r.lower().rstrip('.') for r in refs]
        return clean_name, entry

    # Extract leading aliases: (Alias1; Alias2; ...) at start of text
    alias_match = re.match(r'^\(([^)]+)\)\s*', text)
    if alias_match:
        alias_content = alias_match.group(1)
        # Check if it's a "See" redirect disguised as aliases
        if alias_content.lower().startswith('see '):
            refs = [r.strip() for r in alias_content[4:].split(';')]
            entry["redirect"] = refs[0].lower().rstrip('.')
            entry["related_entries"] = [r.lower().rstrip('.') for r in refs]
            remaining = text[alias_match.end():].strip()
            if not remaining:
                return clean_name, entry
            # If there's text after the "See", treat it as the interpretation
            text = remaining
        else:
            # Parse as aliases - split by semicolons
            aliases = []
            for a in alias_content.split(';'):
                a = a.strip()
                # Remove language markers like "arb.", "bot.", "zool.", etc.
                a = re.sub(r'^(?:arb|bot|zool|med|astr|lat|per|grk|eng|fr|germ|heb|hin)\.\s*', '', a, flags=re.IGNORECASE)
                if a and not a.lower().startswith('see '):
                    aliases.append(a)
            entry["aliases"] = aliases
            text = text[alias_match.end():].strip()

    # Extract "Also see" references at the end
    also_see_pattern = r'\((?:[Aa]lso\s+see\s+)(.+?)\)\s*$'
    also_see_match = re.search(also_see_pattern, text)
    if also_see_match:
        refs = [r.strip().rstrip('.') for r in also_see_match.group(1).split(';')]
        entry["related_entries"] = [r.lower() for r in refs if r]
        text = text[:also_see_match.start()].strip()

    # Clean up the text
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = text.strip()

    if text:
        entry["text"] = text

    return clean_name, entry


def main():
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    lines = [l.rstrip('\n') for l in lines]

    start, end = find_dictionary_bounds(lines)
    print(f"Dictionary bounds: lines {start}-{end} ({end - start} lines)")

    raw_entries = split_entries(lines, start, end)
    print(f"Raw entries found: {len(raw_entries)}")

    # Parse all entries
    dream_dict = {}
    duplicates = 0
    for name, raw_text in raw_entries:
        clean_name, entry = parse_entry(name, raw_text)
        key = clean_name.lower()

        if key in dream_dict:
            # Merge: append text, combine aliases/related
            existing = dream_dict[key]
            if entry["text"] and existing["text"]:
                existing["text"] += "\n\n" + entry["text"]
            elif entry["text"]:
                existing["text"] = entry["text"]
            existing["aliases"] = list(set(existing["aliases"] + entry["aliases"]))
            existing["related_entries"] = list(set(existing["related_entries"] + entry["related_entries"]))
            duplicates += 1
        else:
            dream_dict[key] = entry

    # Post-processing: fix known OCR artifacts and clean up
    # Fix mangled entry names
    # Rename OCR-mangled keys
    key_renames = {
        "bodyl": "body",
        "arm l": "arm",
        "box l": "box",
        "chest l": "chest",
    }
    for old_key, new_key in key_renames.items():
        if old_key in dream_dict:
            if new_key in dream_dict:
                # Merge into existing
                existing = dream_dict[new_key]
                entry = dream_dict[old_key]
                if entry["text"] and existing["text"]:
                    existing["text"] += "\n\n" + entry["text"]
                elif entry["text"]:
                    existing["text"] = entry["text"]
                existing["aliases"] = list(set(existing["aliases"] + entry["aliases"]))
                existing["related_entries"] = list(set(existing["related_entries"] + entry["related_entries"]))
            else:
                dream_dict[new_key] = dream_dict[old_key]
            del dream_dict[old_key]

    # Remove OCR garbage entries
    garbage_keys = ["idi'l oj", "stotion"]
    for bad_key in garbage_keys:
        if bad_key in dream_dict:
            del dream_dict[bad_key]

    # Clean aliases: remove multi-line aliases, overly long descriptions
    for key, entry in dream_dict.items():
        cleaned_aliases = []
        for alias in entry["aliases"]:
            # Remove aliases with newlines (OCR artifacts)
            alias = alias.replace('\n', ' ').strip()
            # Skip overly long aliases (descriptions, not actual names)
            if len(alias) > 80:
                continue
            # Skip empty
            if not alias:
                continue
            cleaned_aliases.append(alias)
        entry["aliases"] = cleaned_aliases

        # Clean text: remove OCR garbage characters
        if entry["text"]:
            entry["text"] = re.sub(r'[^\x20-\x7E\n\u0600-\u06FF\u0100-\u017F\u1E00-\u1EFF\'\'\u2018\u2019\u201C\u201D\-]', '', entry["text"])
            entry["text"] = re.sub(r'\n{3,}', '\n\n', entry["text"]).strip()

    # Write output
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(dream_dict, f, indent=2, ensure_ascii=False)

    # Stats
    total = len(dream_dict)
    redirects = sum(1 for e in dream_dict.values() if e["redirect"])
    with_text = sum(1 for e in dream_dict.values() if e["text"])
    texts = [e["text"] for e in dream_dict.values() if e["text"]]
    avg_len = sum(len(t) for t in texts) / len(texts) if texts else 0
    longest = sorted(texts, key=len, reverse=True)[:10]
    longest_names = []
    for t in longest:
        for k, v in dream_dict.items():
            if v["text"] == t:
                longest_names.append((k, len(t)))
                break

    print(f"\n=== STATS ===")
    print(f"Total entries: {total}")
    print(f"Entries with text: {with_text}")
    print(f"Redirects: {redirects}")
    print(f"Duplicates merged: {duplicates}")
    print(f"Average text length: {avg_len:.0f} chars")
    print(f"\nTop 10 longest entries:")
    for name, length in longest_names:
        print(f"  {name}: {length} chars")


if __name__ == "__main__":
    main()
