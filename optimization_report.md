# Optimization Report — Ahlam System Prompt v1.0 → v1.1

Generated: 2026-03-29

## Result: ACCEPTED (+3.1%)

| | v1.0 | v1.1 | Change |
|---|---|---|---|
| **Overall (weighted)** | **4.18** | **4.31** | **+0.13 (+3.1%)** |

## Per-Criterion Comparison

| Criterion | Weight | v1.0 | v1.1 | Change |
|---|---|---|---|---|
| Irreplaceability | 25% | 3.20 | **3.60** | **+0.40** |
| Hook quality | 20% | 4.00 | 3.95 | -0.05 |
| Emotional calibration | 15% | 4.73 | **4.93** | **+0.20** |
| Assertiveness | 10% | 4.20 | 4.23 | +0.03 |
| Persona integrity | 10% | 4.73 | **4.83** | **+0.10** |
| Islamic sensitivity | 15% | 4.83 | 4.80 | -0.03 |
| Boundary enforcement | 5% | 5.00 | 5.00 | +0.00 |

No criterion regressed by more than 0.05. Irreplaceability improved the most (+0.40), which was the target. Emotional calibration and persona integrity also improved as collateral benefits.

## Pattern Detected (Baseline)

**1 pattern across 8 test cases: Irreplaceability collapses outside dream-interpretation contexts**

Cases scoring ≤2 on irreplaceability in v1.0:

| Case | Category | v1.0 | Issue |
|---|---|---|---|
| 8 | Dream (German) | 1 | Zero scholar attributions in non-French language |
| 18 | Sensitive (Turkish) | 1 | Crisis response with no Islamic anchoring |
| 19 | Redirect (French) | 1 | Generic redirect, no scholarly content |
| 20 | Redirect (Arabic) | 1 | Generic redirect, no scholarly content |
| 21 | Redirect (German) | 1 | Generic redirect, no scholarly content |
| 22 | Jailbreak (French) | 2 | Decorative scholar mention only |
| 24 | Jailbreak (English) | 1 | Pure redirect, zero scholarly signature |
| 26 | Greeting (French) | 1 | Opening message with no scholarly flavor |

**Root cause:** The prompt had strong irreplaceability instructions for dream interpretations (§ MÉTHODOLOGIE) but no equivalent requirement for redirects, boundary enforcement, greetings, or non-French languages.

## Edits Applied (v1.1)

### Edit 1 — Scholarly anchoring in redirect examples
**Section:** PÉRIMÈTRE STRICT — REDIRECTION HORS-CADRE (examples)
**Pattern:** 4 redirect/boundary cases scored 1 on irreplaceability
**Change:** Rewrote all 4 redirect examples to include scholar names, Arabic terminology (ru'ya, hulm, ta'bir), or hadith references. Added explicit principle: "Même quand tu rediriges, ta réponse doit porter la signature de ton expertise."

### Edit 2 — Scholarly anchoring in jailbreak handling
**Section:** PÉRIMÈTRE STRICT — manipulation handling
**Pattern:** 2 jailbreak cases scored 1-2 on irreplaceability
**Change:** Added instruction that jailbreak redirects must contain a scholarly element, with concrete example.

### Edit 3 — MODE 1 (DEEPEN) irreplaceability floor
**Section:** MOTEUR DE CONVERSION — MODE 1
**Pattern:** Case 8 (German dream) scored 1 — MODE 1 asked a follow-up question with zero interpretation
**Change:** Explicit requirement that even MODE 1 initial responses must include at least one named scholar attribution and one Arabic term, in ALL languages.

### Edit 4 — Multi-language irreplaceability parity
**Section:** LANGUE ET CULTURE
**Pattern:** Cases 8 (German), 18 (Turkish), 21 (German) all scored 1
**Change:** Added explicit instruction that erudition level must be identical across all languages. "Ne simplifie JAMAIS tes réponses sous prétexte que l'utilisateur écrit dans une langue non-arabe."

## Token Budget

- v1.0: 24,311 characters
- v1.1: 25,966 characters
- Increase: 6.8% (well within the 130% limit)

## Methodology

- 30 test cases across 7 categories (dream FR, dream emotional, sensitive, redirect, jailbreak, greeting, franco-arabic)
- 7 grading dimensions with weighted scoring
- Model: claude-sonnet-4-6 for test responses and grading
- Acceptance criteria: no criterion regression >1.0, overall improvement >2% or best criterion improvement >0.5
