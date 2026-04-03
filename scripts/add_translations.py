#!/usr/bin/env python3
"""Add multilingual lookup aliases to dream_entries.json.

Uses the Anthropic API to translate entry names in batches.
"""

import json
import os
import sys
import time

DATA_FILE = "/Users/mktr/Desktop/almanami/data/dream_entries.json"
OUTPUT_FILE = DATA_FILE  # overwrite in place

try:
    import anthropic
except ImportError:
    print("Installing anthropic SDK...")
    os.system(f"{sys.executable} -m pip install anthropic -q")
    import anthropic


def translate_batch(client, entries, target_langs=("fr", "ar", "tr", "de")):
    """Translate a batch of English dream symbol names to target languages."""
    entry_list = "\n".join(f"- {e}" for e in entries)
    lang_names = {"fr": "French", "ar": "Arabic", "tr": "Turkish", "de": "German"}

    prompt = f"""Translate these dream symbol/concept names into French, Arabic, Turkish, and German.
For each word, provide the most common translations someone would use when describing a dream.
Include synonyms and common variants (e.g. for "snake": French should include "serpent", "couleuvre", "vipère").
For proper nouns (prophets, places), provide the local form (e.g. Aaron → Harun in Arabic/Turkish).

Return ONLY a JSON object. No markdown, no explanation.
Format: {{"english_term": {{"fr": ["word1", "word2"], "ar": ["word1", "word2"], "tr": ["word1"], "de": ["word1"]}}}}

Terms to translate:
{entry_list}"""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]

    return json.loads(text)


def main():
    # Load existing data
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        dream_dict = json.load(f)

    # Get API key from environment
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        # Try to read from .env or vercel config
        env_files = [
            os.path.expanduser("~/.anthropic_api_key"),
            "/Users/mktr/Desktop/almanami/.env",
        ]
        for ef in env_files:
            if os.path.exists(ef):
                with open(ef) as f:
                    for line in f:
                        if "ANTHROPIC_API_KEY" in line:
                            api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                            break
            if api_key:
                break

    if not api_key:
        print("ERROR: No ANTHROPIC_API_KEY found. Set it in environment.")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    # Collect entries that need translation (those with actual text, not just redirects)
    entries_to_translate = []
    for key, entry in dream_dict.items():
        if entry.get("text") or not entry.get("redirect"):
            # Collect the entry name and its English aliases
            en_names = [key]
            for alias in entry.get("aliases", []):
                en_names.append(alias.lower())
            entries_to_translate.append((key, en_names))

    print(f"Entries to translate: {len(entries_to_translate)}")

    # Process in batches of 40
    batch_size = 40
    all_translations = {}
    total_batches = (len(entries_to_translate) + batch_size - 1) // batch_size

    for i in range(0, len(entries_to_translate), batch_size):
        batch = entries_to_translate[i:i + batch_size]
        batch_num = i // batch_size + 1
        batch_names = [key for key, _ in batch]

        print(f"Batch {batch_num}/{total_batches}: {batch_names[0]} ... {batch_names[-1]}")

        try:
            translations = translate_batch(client, batch_names)
            all_translations.update(translations)
        except json.JSONDecodeError as e:
            print(f"  WARNING: JSON parse failed for batch {batch_num}, retrying...")
            time.sleep(2)
            try:
                translations = translate_batch(client, batch_names)
                all_translations.update(translations)
            except Exception as e2:
                print(f"  ERROR: Batch {batch_num} failed twice: {e2}")
                continue
        except Exception as e:
            print(f"  ERROR: Batch {batch_num} failed: {e}")
            time.sleep(5)
            continue

        # Rate limiting
        time.sleep(0.5)

    print(f"\nTranslations obtained: {len(all_translations)}")

    # Apply translations to dream_dict
    applied = 0
    for key, entry in dream_dict.items():
        en_names = [key]
        for alias in entry.get("aliases", []):
            en_names.append(alias.lower())

        # Build lookup_aliases
        lookup = {"en": list(set(en_names))}

        # Add translations if available
        trans = all_translations.get(key)
        if trans:
            for lang in ("fr", "ar", "tr", "de"):
                if lang in trans and trans[lang]:
                    # Lowercase all translations for matching
                    lookup[lang] = [t.lower() if lang != "ar" else t for t in trans[lang]]
            applied += 1
        else:
            # For redirects without translation, at least set empty
            for lang in ("fr", "ar", "tr", "de"):
                lookup[lang] = []

        entry["lookup_aliases"] = lookup

    print(f"Translations applied: {applied}")

    # Write output
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(dream_dict, f, indent=2, ensure_ascii=False)

    print(f"Written to {OUTPUT_FILE}")

    # Quick file size check
    size_mb = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
    print(f"File size: {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
