#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Grammar Mastery v2.1 — Automated Topic Data Audit & Auto-Remediation Script
===========================================================================
Scans all JSON files in /data/topics/*.json for:
1. Parentheses & explanatory annotations inside solutions/answers (e.g., "Subject (Wer?)")
   and leading ellipses ("... I would travel.") -> cleans & expands solutions/acceptedAnswers.
2. Synchronicity between gap markers ({{0}}, {{gap}}, {gap}) in sentences/text and gaps[].
3. Empty, null, or incomplete fields (sentence, text, answer, solutions, acceptedAnswers).
4. Case-sensitivity & whitespace trimming (trims all strings & verifies modules/engine.js).

Outputs a compact terminal Audit Report and updates data/topics-bundle.js + standalone-runtime.js.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOPICS_DIR = ROOT / "data" / "topics"
CATALOG_PATH = ROOT / "data" / "topics-catalog.json"
ENGINE_PATH = ROOT / "modules" / "engine.js"

GAP_MARKER_RE = re.compile(r"\{\{(?:gap|\d+)\}\}|\{gap\}")
PAREN_RE = re.compile(r"\s*\([^)]*\)")
LEADING_ELLIPSIS_RE = re.compile(r"^\.{2,}\s*")


def clean_ws(val: str) -> str:
    return re.sub(r"\s+", " ", str(val or "")).strip()


def expand_and_clean_solutions(raw_list: list):
    """
    Cleans whitespace, removes parenthetical notes like 'Subject (Wer?)' -> 'Subject',
    removes leading ellipses '... I would' -> 'I would', and returns:
    (cleaned_list, paren_fixes_count, ellipsis_fixes_count, trim_fixes_count)
    """
    paren_fixes = 0
    ellipsis_fixes = 0
    trim_fixes = 0

    primary_clean = []
    secondary_originals = []

    for item in raw_list:
        if item is None:
            continue
        raw_str = str(item)
        trimmed = clean_ws(raw_str)
        if trimmed != raw_str:
            trim_fixes += 1
        if not trimmed:
            continue

        # Check for parenthetical explanation in answer, e.g. "Subject (Wer?)"
        has_paren = bool(PAREN_RE.search(trimmed))
        has_ellipsis = bool(LEADING_ELLIPSIS_RE.search(trimmed))

        stripped = trimmed
        if has_paren:
            stripped = clean_ws(PAREN_RE.sub("", stripped))
            paren_fixes += 1

        if has_ellipsis:
            stripped = clean_ws(LEADING_ELLIPSIS_RE.sub("", stripped))
            ellipsis_fixes += 1

        if stripped and stripped != trimmed:
            primary_clean.append(stripped)
            # Also add version without trailing period if it's a clause
            if stripped.endswith(".") and len(stripped.split()) > 1:
                primary_clean.append(stripped[:-1].strip())
            secondary_originals.append(trimmed)
        else:
            primary_clean.append(trimmed)
            if trimmed.endswith(".") and len(trimmed.split()) > 2:
                primary_clean.append(trimmed[:-1].strip())

    # Deduplicate preserving order (clean base forms first!)
    merged = list(dict.fromkeys([s for s in (primary_clean + secondary_originals) if s]))
    if merged == raw_list:
        return merged, 0, 0, trim_fixes
    return merged, paren_fixes, ellipsis_fixes, trim_fixes


def clean_prompt_parens(prompt_str: str):
    """
    If a prompt has MC options with parenthetical explanations like
    'Subject (Wer?) / Object (Wen/Was?)', simplify prompt to 'Subject / Object'
    while returning the extracted note for grammarHint.
    """
    if "/" in prompt_str and PAREN_RE.search(prompt_str):
        cleaned = clean_ws(PAREN_RE.sub("", prompt_str))
        return cleaned, True
    return prompt_str, False


def audit_and_fix_all():
    topic_files = sorted(TOPICS_DIR.glob("*.json"))

    stats = {
        "files_checked": 0,
        "files_modified": 0,
        "exercises_checked": 0,
        "tasks_checked": 0,
        "gaps_checked": 0,
        "paren_fixes": 0,
        "ellipsis_fixes": 0,
        "prompt_paren_fixes": 0,
        "trim_fixes": 0,
        "sync_mismatches": [],
        "empty_data_issues": [],
        "fixed_details": [],
    }

    for file_path in topic_files:
        stats["files_checked"] += 1
        fname = file_path.name
        raw_text = file_path.read_text(encoding="utf-8")
        data = json.loads(raw_text)
        file_changed = False

        exercises = data.get("exercises", [])
        for ex in exercises:
            stats["exercises_checked"] += 1
            ex_id = ex.get("id", "unknown_ex")
            ex_type = ex.get("type", "single_sentence")

            # Case A: Top-level cloze_text with ex['text'] and ex['gaps']
            if ex_type == "cloze_text" and "text" in ex and "gaps" in ex and not ex.get("sentences"):
                stats["tasks_checked"] += 1
                passage = ex.get("text", "")
                trimmed_passage = clean_ws(passage)
                if trimmed_passage != passage:
                    ex["text"] = trimmed_passage
                    stats["trim_fixes"] += 1
                    file_changed = True

                if not trimmed_passage:
                    stats["empty_data_issues"].append(f"{fname} -> {ex_id}: Top-level cloze 'text' is empty")

                markers = GAP_MARKER_RE.findall(ex.get("text", ""))
                gaps = ex.get("gaps", [])
                if len(markers) != len(gaps):
                    stats["sync_mismatches"].append(
                        f"{fname} -> {ex_id}: {len(markers)} gap markers in text vs. {len(gaps)} gap definitions"
                    )

                for g_idx, g in enumerate(gaps):
                    stats["gaps_checked"] += 1
                    raw_sols = (
                        g.get("solutions")
                        or g.get("acceptedAnswers")
                        or g.get("correct")
                        or ([g["answer"]] if g.get("answer") else [])
                    )
                    if not raw_sols:
                        stats["empty_data_issues"].append(
                            f"{fname} -> {ex_id} -> gap[{g_idx}]: Empty/missing solutions"
                        )
                        continue

                    cleaned_sols, p_fix, e_fix, t_fix = expand_and_clean_solutions(raw_sols)
                    if p_fix or e_fix or t_fix or g.get("solutions") != cleaned_sols or g.get("acceptedAnswers") != cleaned_sols:
                        if p_fix:
                            stats["paren_fixes"] += p_fix
                            stats["fixed_details"].append(
                                f"{fname} ({ex_id}/gap{g_idx + 1}): Klammer-Lösung bereinigt -> {cleaned_sols}"
                            )
                        if e_fix:
                            stats["ellipsis_fixes"] += e_fix
                            stats["fixed_details"].append(
                                f"{fname} ({ex_id}/gap{g_idx + 1}): Ellipsen-Lösung bereinigt -> {cleaned_sols}"
                            )
                        stats["trim_fixes"] += t_fix
                        g["solutions"] = cleaned_sols
                        g["acceptedAnswers"] = cleaned_sols
                        g["answer"] = cleaned_sols[0]
                        file_changed = True

            # Case B: Items or Sentences list (single_sentence or sentence-based cloze_text)
            task_list_key = "items" if "items" in ex else ("sentences" if "sentences" in ex else None)
            if task_list_key:
                task_list = ex.get(task_list_key, [])
                if not task_list:
                    stats["empty_data_issues"].append(f"{fname} -> {ex_id}: '{task_list_key}' array is empty")

                for s_idx, item in enumerate(task_list):
                    stats["tasks_checked"] += 1
                    item_id = item.get("id", f"s{s_idx + 1}")
                    sent_key = "sentence" if "sentence" in item else "text"
                    raw_sent = item.get(sent_key, "")
                    trimmed_sent = clean_ws(raw_sent)

                    if trimmed_sent != raw_sent:
                        item[sent_key] = trimmed_sent
                        stats["trim_fixes"] += 1
                        file_changed = True

                    if not trimmed_sent:
                        stats["empty_data_issues"].append(
                            f"{fname} -> {ex_id} -> {item_id}: '{sent_key}' is empty or missing"
                        )

                    # Check gap marker synchronicity
                    markers = GAP_MARKER_RE.findall(trimmed_sent)
                    gaps = item.get("gaps", [])
                    if len(markers) != len(gaps):
                        stats["sync_mismatches"].append(
                            f"{fname} -> {ex_id} -> {item_id}: {len(markers)} gap markers in sentence vs. {len(gaps)} gaps"
                        )

                    for g_idx, g in enumerate(gaps):
                        stats["gaps_checked"] += 1
                        # Clean prompt whitespace & parenthetical MC options
                        raw_prompt = str(g.get("prompt") or g.get("gap") or "")
                        trimmed_prompt = clean_ws(raw_prompt)
                        cleaned_prompt, prompt_had_paren = clean_prompt_parens(trimmed_prompt)
                        if prompt_had_paren:
                            # Preserve original explanation in grammarHint
                            g["grammarHint"] = f"Auswahl: {trimmed_prompt}"
                            g["prompt"] = cleaned_prompt
                            stats["prompt_paren_fixes"] += 1
                            stats["fixed_details"].append(
                                f"{fname} ({ex_id}/{item_id}): Prompt-Klammern bereinigt ('{trimmed_prompt}' -> '{cleaned_prompt}')"
                            )
                            file_changed = True
                        elif trimmed_prompt != raw_prompt:
                            g["prompt"] = trimmed_prompt
                            stats["trim_fixes"] += 1
                            file_changed = True

                        raw_sols = (
                            g.get("solutions")
                            or g.get("acceptedAnswers")
                            or g.get("correct")
                            or ([g["answer"]] if g.get("answer") else [])
                        )
                        if not raw_sols or all(not clean_ws(x) for x in raw_sols):
                            stats["empty_data_issues"].append(
                                f"{fname} -> {ex_id} -> {item_id} -> gap[{g_idx}]: Empty/missing solutions"
                            )
                            continue

                        cleaned_sols, p_fix, e_fix, t_fix = expand_and_clean_solutions(raw_sols)
                        if (
                            p_fix
                            or e_fix
                            or t_fix
                            or g.get("solutions") != cleaned_sols
                            or g.get("acceptedAnswers") != cleaned_sols
                            or g.get("answer") != cleaned_sols[0]
                        ):
                            if p_fix:
                                stats["paren_fixes"] += p_fix
                                stats["fixed_details"].append(
                                    f"{fname} ({ex_id}/{item_id}): Klammer-Lösung bereinigt -> {cleaned_sols}"
                                )
                            if e_fix:
                                stats["ellipsis_fixes"] += e_fix
                                stats["fixed_details"].append(
                                    f"{fname} ({ex_id}/{item_id}): Ellipsen-Lösung bereinigt -> {cleaned_sols}"
                                )
                            stats["trim_fixes"] += t_fix
                            g["solutions"] = cleaned_sols
                            g["acceptedAnswers"] = cleaned_sols
                            g["answer"] = cleaned_sols[0]
                            file_changed = True

        if file_changed:
            stats["files_modified"] += 1
            file_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Verify case-insensitivity in modules/engine.js
    engine_code = ENGINE_PATH.read_text(encoding="utf-8")
    has_lowercase_norm = ".toLowerCase()" in engine_code and ".trim()" in engine_code

    # Rebuild data/topics-bundle.js and modules/standalone-runtime.js with cleaned data
    if CATALOG_PATH.exists():
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        all_topics_map = {}
        for p in sorted(TOPICS_DIR.glob("*.json")):
            obj = json.loads(p.read_text(encoding="utf-8"))
            all_topics_map[obj["id"]] = obj
        bundle_js = (
            "// Auto-generated fallback bundle for local file:// protocol execution\n"
            f"window.GM_CATALOG = {json.dumps(catalog, ensure_ascii=False)};\n"
            f"window.GM_TOPICS = {json.dumps(all_topics_map, ensure_ascii=False)};\n"
        )
        (ROOT / "data" / "topics-bundle.js").write_text(bundle_js, encoding="utf-8")

    mod_dir = ROOT / "modules"
    if (mod_dir / "gamification.js").exists():
        def strip_esm(code: str) -> str:
            code = re.sub(r"^\s*import\s+.*?;?\s*$", "", code, flags=re.M)
            code = re.sub(r"^\s*export\s+default\s+.*?;?\s*$", "", code, flags=re.M)
            code = re.sub(r"^\s*export\s+(const|let|var|class|function)\s+", r"\1 ", code, flags=re.M)
            return code

        standalone_code = (
            "// Auto-generated standalone runtime fallback for local file:// protocol\n"
            "(function () {\n"
            "  if (window.__GM_MODULE_BOOTED) return;\n\n"
            + strip_esm((mod_dir / "gamification.js").read_text(encoding="utf-8"))
            + "\n\n"
            + strip_esm((mod_dir / "ui.js").read_text(encoding="utf-8"))
            + "\n\n"
            + strip_esm((mod_dir / "engine.js").read_text(encoding="utf-8"))
            + "\n  window.GM_Gamification = Gamification;\n"
            "  window.GM_TROPHY_BADGES = TROPHY_BADGES;\n"
            "  window.GM_UI = UI;\n"
            "})();\n"
        )
        (mod_dir / "standalone-runtime.js").write_text(standalone_code, encoding="utf-8")

    # Print Compact Audit Report
    print("=" * 72)
    print("GRAMMAR MASTERY — AUTOMATED DATA AUDIT REPORT")
    print("=" * 72)
    print(f"Geprüfte JSON-Dateien (data/topics/): {stats['files_checked']}")
    print(f"Geprüfte Übungseinheiten (Exercises): {stats['exercises_checked']}")
    print(f"Geprüfte Aufgaben / Sätze (Tasks)   : {stats['tasks_checked']}")
    print(f"Geprüfte Einzellücken (Gaps)        : {stats['gaps_checked']}")
    print("-" * 72)
    print("1. KLAMMERN & ERKLÄRUNGSTEXTE IN LÖSUNGEN:")
    print(f"   - Bereinigte/erweiterte Klammer-Lösungen : {stats['paren_fixes']}")
    print(f"   - Bereinigte Prompt-Klammerzusätze       : {stats['prompt_paren_fixes']}")
    print(f"   - Bereinigte führende Ellipsen ('...')   : {stats['ellipsis_fixes']}")
    print("2. SYNCHRONITÄT VON LÜCKEN & ANTWORTEN:")
    print(f"   - Abweichungen ({'{gap}'}-Marker vs. Gaps): {len(stats['sync_mismatches'])}")
    for m in stats["sync_mismatches"]:
        print(f"     [!] {m}")
    print("3. LEERE ODER UNVOLLSTÄNDIGE DATEN:")
    print(f"   - Leere/fehlende Felder (sentence/answer): {len(stats['empty_data_issues'])}")
    for issue in stats["empty_data_issues"]:
        print(f"     [!] {issue}")
    print("4. CASE-SENSITIVITY & TRIMMING:")
    print(f"   - Getrimmte Strings                      : {stats['trim_fixes']}")
    print(f"   - Engine Case-Insensitive & Trim aktiv   : {'JA (OK)' if has_lowercase_norm else 'FEHLT!'}")
    print(f"   - Aktualisierte JSON-Dateien             : {stats['files_modified']}")
    if stats["fixed_details"]:
        print("-" * 72)
        print("AUTOMATISCH BEHOBENE AUFFÄLLIGKEITEN (DETAILS):")
        for detail in stats["fixed_details"]:
            print(f"   * {detail}")
    print("=" * 72)


if __name__ == "__main__":
    audit_and_fix_all()
