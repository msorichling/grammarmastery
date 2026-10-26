#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Grammar Mastery v2.0 — Automated Topic Migration Script
=======================================================
Parses legacy HTML topic files (klasse5..10, irregular_verbs_7..10),
extracts grammar rules, exercise instructions, sentences, gaps, prompts,
solutions, and explanations, validates against the v2.0 JSON schema,
writes /data/topics/[topic-id].json, and updates /data/topics-catalog.json.
"""

import json
import os
import re
import sys
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOPICS_DIR = ROOT / "data" / "topics"
CATALOG_PATH = ROOT / "data" / "topics-catalog.json"


# ---------------------------------------------------------------------------
# 1. Deterministic JS Object Literal Tokenizer & Parser
# ---------------------------------------------------------------------------
def tokenize_js(src: str):
    """Tokenizes a JavaScript object/array literal into (type, value) tokens."""
    i = 0
    n = len(src)
    tokens = []
    while i < n:
        ch = src[i]
        # Whitespace
        if ch in " \t\r\n":
            i += 1
            continue
        # Line comment
        if src.startswith("//", i):
            nl = src.find("\n", i + 2)
            i = n if nl == -1 else nl + 1
            continue
        # Block comment
        if src.startswith("/*", i):
            end = src.find("*/", i + 2)
            i = n if end == -1 else end + 2
            continue
        # Punctuation
        if ch in "{}[]:,":
            tokens.append((ch, ch))
            i += 1
            continue
        # String literal
        if ch in ("'", '"'):
            quote = ch
            i += 1
            buf = []
            while i < n:
                c = src[i]
                if c == "\\":
                    if i + 1 < n:
                        nxt = src[i + 1]
                        if nxt == "n":
                            buf.append("\n")
                        elif nxt == "t":
                            buf.append("\t")
                        else:
                            buf.append(nxt)
                        i += 2
                        continue
                if c == quote:
                    i += 1
                    break
                buf.append(c)
                i += 1
            tokens.append(("STRING", "".join(buf)))
            continue
        # Number
        if ch.isdigit() or (ch == "-" and i + 1 < n and src[i + 1].isdigit()):
            start = i
            i += 1
            while i < n and (src[i].isdigit() or src[i] == "."):
                i += 1
            num_str = src[start:i]
            val = float(num_str) if "." in num_str else int(num_str)
            tokens.append(("NUMBER", val))
            continue
        # Identifier / Keyword
        if ch.isalpha() or ch in "_$":
            start = i
            while i < n and (src[i].isalnum() or src[i] in "_$"):
                i += 1
            ident = src[start:i]
            if ident == "true":
                tokens.append(("BOOL", True))
            elif ident == "false":
                tokens.append(("BOOL", False))
            elif ident in ("null", "undefined"):
                tokens.append(("NULL", None))
            else:
                tokens.append(("IDENT", ident))
            continue
        # Unknown character - skip
        i += 1
    return tokens


class JSParser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = 0

    def peek(self):
        return self.tokens[self.pos] if self.pos < len(self.tokens) else (None, None)

    def next(self):
        tok = self.peek()
        self.pos += 1
        return tok

    def parse_value(self):
        ttype, tval = self.peek()
        if ttype == "{":
            return self.parse_object()
        if ttype == "[":
            return self.parse_array()
        if ttype in ("STRING", "NUMBER", "BOOL", "NULL"):
            self.next()
            return tval
        if ttype == "IDENT":
            self.next()
            return tval
        raise ValueError(f"Unexpected token {ttype}:{tval} at pos {self.pos}")

    def parse_object(self):
        self.next()  # consume '{'
        obj = {}
        while True:
            ttype, tval = self.peek()
            if ttype is None or ttype == "}":
                self.next()
                break
            if ttype == ",":
                self.next()
                continue
            # Key can be IDENT, STRING, or NUMBER
            ktype, kval = self.next()
            key = str(kval)
            colon, _ = self.peek()
            if colon == ":":
                self.next()
            val = self.parse_value()
            obj[key] = val
            if self.peek()[0] == ",":
                self.next()
        return obj

    def parse_array(self):
        self.next()  # consume '['
        arr = []
        while True:
            ttype, _ = self.peek()
            if ttype is None or ttype == "]":
                self.next()
                break
            if ttype == ",":
                self.next()
                continue
            arr.append(self.parse_value())
            if self.peek()[0] == ",":
                self.next()
        return arr


def extract_js_assignment(html: str, var_name: str):
    """Finds `const <var_name> = ...` and parses the balanced JS literal."""
    pattern = re.compile(rf"(?:const|let|var)\s+{re.escape(var_name)}\s*=\s*([\{{\[])")
    m = pattern.search(html)
    if not m:
        return None
    start_idx = m.start(1)
    open_ch = m.group(1)
    close_ch = "}" if open_ch == "{" else "]"

    # Scan with string/comment awareness to find matching closing bracket
    i = start_idx
    n = len(html)
    depth = 0
    while i < n:
        ch = html[i]
        if html.startswith("//", i):
            nl = html.find("\n", i + 2)
            i = n if nl == -1 else nl + 1
            continue
        if html.startswith("/*", i):
            end = html.find("*/", i + 2)
            i = n if end == -1 else end + 2
            continue
        if ch in ("'", '"'):
            q = ch
            i += 1
            while i < n:
                if html[i] == "\\":
                    i += 2
                    continue
                if html[i] == q:
                    i += 1
                    break
                i += 1
            continue
        if ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                js_slice = html[start_idx : i + 1]
                tokens = tokenize_js(js_slice)
                return JSParser(tokens).parse_value()
        i += 1
    return None


# ---------------------------------------------------------------------------
# 2. HTML Metadata & Rule Helpers
# ---------------------------------------------------------------------------
def strip_html(text: str) -> str:
    if not text:
        return ""
    # Replace <br> with space or newline
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def extract_rules_from_html(html: str, default_title: str) -> dict:
    info_m = re.search(
        r'<div[^>]*id=["\']topic-info["\'][^>]*>(.*?)</div>\s*<div[^>]*id=["\']exercise-accordion["\']',
        html,
        flags=re.S | re.I,
    )
    if not info_m:
        return {
            "title": f"{default_title} – Überblick",
            "summary": f"Wichtige Grammatikregeln und Signalwörter zum Thema {default_title}.",
            "examples": [],
        }

    block = info_m.group(1)
    h3_m = re.search(r"<h3[^>]*>(.*?)</h3>", block, flags=re.S | re.I)
    rule_title = strip_html(h3_m.group(1)) if h3_m else f"{default_title} – Regeln"

    paragraphs = [strip_html(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", block, flags=re.S | re.I)]
    paragraphs = [p for p in paragraphs if p]

    examples = []
    for ex_m in re.findall(r'<div[^>]*class=["\']example["\'][^>]*>(.*?)</div>', block, flags=re.S | re.I):
        lines = [strip_html(line) for line in re.split(r"<br\s*/?>", ex_m, flags=re.I)]
        for l in lines:
            if l:
                examples.append(l)

    for li_m in re.findall(r"<li[^>]*>(.*?)</li>", block, flags=re.S | re.I):
        cleaned = strip_html(li_m)
        if cleaned:
            examples.append(cleaned)

    summary = " ".join(paragraphs) if paragraphs else f"Regelübersicht zu {default_title}."
    return {
        "title": rule_title,
        "summary": summary,
        "examples": examples[:8] if examples else [summary],
    }


def extract_exercise_titles(html: str) -> dict:
    titles = {}
    for num, label in re.findall(
        r'id=["\']label-ex(\d+)["\'][^>]*>(.*?)</span>', html, flags=re.S | re.I
    ):
        titles[str(num)] = strip_html(label)
    return titles


def extract_storage_keys(html: str, fallback_prefix: str):
    state_m = re.search(r"localStorage\.getItem\(['\"]([^'\"]+_state)['\"]\)", html)
    mast_m = re.search(r"localStorage\.setItem\(['\"]([^'\"]+_mastered)['\"]", html)
    return (
        state_m.group(1) if state_m else f"{fallback_prefix}_state",
        mast_m.group(1) if mast_m else f"{fallback_prefix}_mastered",
    )


def clean_prompt(raw_prompt: str) -> str:
    if not raw_prompt:
        return "form"
    p = strip_html(str(raw_prompt)).strip()
    if p.startswith("(") and p.endswith(")"):
        p = p[1:-1].strip()
    return p or "form"


def build_hints(solutions: list, explanation: str, grammar_hint: str = "") -> list:
    hints = []
    if explanation:
        hints.append(strip_html(explanation))
    if solutions:
        first_sol = str(solutions[0]).strip()
        if len(first_sol) > 2:
            hints.append(f"Lösung beginnt mit „{first_sol[:2]}…“ ({len(first_sol.split())} Wort/Wörter).")
    return hints if hints else ["Achte auf die Zeitform und das Subjekt des Satzes."]


# ---------------------------------------------------------------------------
# 3. Converter: Legacy Exercise Object -> v2.0 Schema Exercise
# ---------------------------------------------------------------------------
def convert_legacy_exercise(ex_key: str, ex_title: str, ex_obj: dict) -> dict:
    ex_type = ex_obj.get("type", "cloze")
    instruction = strip_html(ex_obj.get("instruction", "Löse die folgenden Aufgaben."))

    # CASE 1: Cloze (Continuous text OR single sentences)
    if ex_type == "cloze":
        raw_items = ex_obj.get("items", [])
        is_continuous = bool(ex_obj.get("continuous", False))

        if is_continuous:
            text_parts = []
            gaps = []
            for idx, item in enumerate(raw_items):
                before = strip_html(item.get("textBefore", ""))
                after = strip_html(item.get("textAfter", ""))
                prompt = clean_prompt(item.get("prompt", ""))
                sols = [str(s).strip() for s in item.get("correct", []) if str(s).strip()]
                fb = strip_html(item.get("fb", "Richtige Form im Kontext."))

                piece = f"{before} {{{{{idx}}}}} {after}".strip()
                text_parts.append(piece)
                gaps.append(
                    {
                        "index": idx,
                        "prompt": prompt,
                        "grammarHint": fb[:90] if fb else f"Lücke {idx + 1}",
                        "hints": build_hints(sols, fb),
                        "solutions": sols or [""],
                        "explanation": fb or f"Lösung: {', '.join(sols)}",
                    }
                )
            return {
                "id": f"ex{ex_key}",
                "title": ex_title,
                "type": "cloze_text",
                "instruction": instruction,
                "text": " ".join(text_parts),
                "gaps": gaps,
            }
        else:
            items = []
            for idx, item in enumerate(raw_items):
                before = strip_html(item.get("textBefore", ""))
                after = strip_html(item.get("textAfter", ""))
                prompt = clean_prompt(item.get("prompt", ""))
                sols = [str(s).strip() for s in item.get("correct", []) if str(s).strip()]
                fb = strip_html(item.get("fb", "Achte auf die passende Form."))

                if before and after:
                    sentence = f"{before} {{{{0}}}} {after}"
                elif before:
                    sentence = f"{before} {{{{0}}}}"
                else:
                    sentence = f"{{{{0}}}} {after}"

                items.append(
                    {
                        "id": f"s{idx + 1}",
                        "sentence": re.sub(r"\s+", " ", sentence).strip(),
                        "gaps": [
                            {
                                "index": 0,
                                "prompt": prompt,
                                "grammarHint": fb[:90] if fb else prompt,
                                "hints": build_hints(sols, fb),
                                "solutions": sols or [""],
                                "explanation": fb or f"Richtige Lösung: {', '.join(sols)}",
                            }
                        ],
                    }
                )
            return {
                "id": f"ex{ex_key}",
                "title": ex_title,
                "type": "single_sentence",
                "instruction": instruction,
                "items": items,
            }

    # CASE 2: Multiple Choice ('mc') or Time Race ('race')
    if ex_type in ("mc", "race"):
        questions = ex_obj.get("questions", [])
        items = []
        for idx, q in enumerate(questions):
            raw_text = strip_html(q.get("text", ""))
            options = [str(o).strip() for o in q.get("options", [])]
            correct = str(q.get("correct", "")).strip()
            prompt_str = " / ".join(options) if options else "choose"

            if "..." in raw_text:
                sentence = raw_text.replace("...", "{{0}}", 1)
            elif "___" in raw_text:
                sentence = re.sub(r"_+", "{{0}}", raw_text, count=1)
            else:
                sentence = f"{raw_text} → {{{{0}}}}"

            items.append(
                {
                    "id": f"s{idx + 1}",
                    "sentence": re.sub(r"\s+", " ", sentence).strip(),
                    "gaps": [
                        {
                            "index": 0,
                            "prompt": prompt_str,
                            "grammarHint": f"Auswahl: {prompt_str}",
                            "hints": [f"Wähle eine der Optionen: {prompt_str}"],
                            "solutions": [correct],
                            "explanation": f"„{correct}“ ist hier die richtige Wahl aus ({prompt_str}).",
                        }
                    ],
                }
            )
        return {
            "id": f"ex{ex_key}",
            "title": ex_title,
            "type": "single_sentence",
            "instruction": instruction,
            "items": items,
        }

    # CASE 3: Sort ('sort')
    if ex_type == "sort":
        raw_items = ex_obj.get("items", [])
        categories = [str(c) for c in ex_obj.get("categories", [])]
        left_label = ex_obj.get("left")
        right_label = ex_obj.get("right")
        if not categories and left_label and right_label:
            categories = [str(left_label), str(right_label)]
        cat_prompt = " / ".join(categories) if categories else "Kategorie"
        items = []
        for idx, it in enumerate(raw_items):
            text = strip_html(it.get("text") or it.get("word") or "")
            raw_cat = str(it.get("cat", "")).strip()
            if raw_cat == "left" and left_label:
                cat = str(left_label)
            elif raw_cat == "right" and right_label:
                cat = str(right_label)
            else:
                cat = raw_cat
            items.append(
                {
                    "id": f"s{idx + 1}",
                    "sentence": f"„{text}“ gehört zu: {{{{0}}}}",
                    "gaps": [
                        {
                            "index": 0,
                            "prompt": cat_prompt,
                            "grammarHint": f"Ordne zu: {cat_prompt}",
                            "hints": [f"Entscheide zwischen: {cat_prompt}"],
                            "solutions": [cat],
                            "explanation": f"„{text}“ wird der Kategorie „{cat}“ zugeordnet.",
                        }
                    ],
                }
            )
        return {
            "id": f"ex{ex_key}",
            "title": ex_title,
            "type": "single_sentence",
            "instruction": f"{instruction} (Tippe: {cat_prompt})",
            "items": items,
        }

    # CASE 4: Scramble ('scramble')
    if ex_type == "scramble":
        sentences = ex_obj.get("sentences", [])
        items = []
        for idx, s in enumerate(sentences):
            correct = strip_html(s.get("correct", "")).rstrip(".")
            correct_full = strip_html(s.get("correct", ""))
            active = strip_html(s.get("active", ""))
            words = [str(w) for w in s.get("words", [])]
            words_hint = " / ".join(words)
            sols = list(dict.fromkeys([correct_full, correct]))

            prefix = f"Ausgangssatz: „{active}“ → " if active else ""
            items.append(
                {
                    "id": f"s{idx + 1}",
                    "sentence": f"{prefix}{{{{0}}}}",
                    "gaps": [
                        {
                            "index": 0,
                            "prompt": words_hint,
                            "grammarHint": f"Bausteine: {words_hint}",
                            "hints": [
                                f"Nutze alle Wörter: {words_hint}",
                                f"Satzanfang: „{' '.join(correct_full.split()[:2])}…“",
                            ],
                            "solutions": sols,
                            "explanation": f"Vollständiger Satz: „{correct_full}“.",
                        }
                    ],
                }
            )
        return {
            "id": f"ex{ex_key}",
            "title": ex_title,
            "type": "single_sentence",
            "instruction": instruction,
            "items": items,
        }

    # CASE 5: Puzzle / Matching ('puzzle') or Background ('background')
    if ex_type in ("puzzle", "background"):
        pairs = ex_obj.get("pairs") or ex_obj.get("items") or []
        cols = [str(c) for c in ex_obj.get("cols", [])]
        items = []
        for idx, p in enumerate(pairs):
            if "text" in p and "cat" in p:
                text_val = strip_html(p.get("text", ""))
                cat_val = strip_html(p.get("cat", ""))
                prompt_str = " / ".join(cols) if cols else cat_val
                items.append(
                    {
                        "id": f"s{idx + 1}",
                        "sentence": f"Bezugswort „{text_val}“ verlangt Relativpronomen: {{{{0}}}}",
                        "gaps": [
                            {
                                "index": 0,
                                "prompt": prompt_str,
                                "grammarHint": f"Wähle aus: {prompt_str}",
                                "hints": [f"Person (who), Sache (which), Ort (where) oder Besitz (whose)?"],
                                "solutions": [cat_val, cat_val.lower()],
                                "explanation": f"Zu „{text_val}“ passt das Relativpronomen „{cat_val.lower()}“.",
                            }
                        ],
                    }
                )
            elif "s" in p and "isBG" in p:
                s_text = strip_html(p.get("s", ""))
                is_bg = bool(p.get("isBG"))
                sol = "Background" if is_bg else "Action"
                alt_sol = "Past Progressive" if is_bg else "Simple Past"
                items.append(
                    {
                        "id": f"s{idx + 1}",
                        "sentence": f"„{s_text}“ → {{{{0}}}}",
                        "gaps": [
                            {
                                "index": 0,
                                "prompt": "Background / Action",
                                "grammarHint": "Hintergrundhandlung (Background) oder plötzliches Ereignis (Action)?",
                                "hints": ["Tippe 'Background' (Hintergrund) oder 'Action' (Ereignis)."],
                                "solutions": [sol, alt_sol],
                                "explanation": f"„{s_text}“ ist eine {'Hintergrundhandlung (Background / Past Progressive)' if is_bg else 'plötzliche Handlung (Action / Simple Past)'}.",
                            }
                        ],
                    }
                )
            elif "left" in p:
                left = strip_html(p.get("left", ""))
                right = strip_html(p.get("right", ""))
                opts = [strip_html(o) for o in p.get("options", [])]
                prompt_str = " / ".join(opts) if opts else right
                items.append(
                    {
                        "id": f"s{idx + 1}",
                        "sentence": f"{left} {{{{0}}}}",
                        "gaps": [
                            {
                                "index": 0,
                                "prompt": prompt_str,
                                "grammarHint": "Wähle den passenden Satzteil",
                                "hints": [f"Optionen: {prompt_str}"],
                                "solutions": [right, right.rstrip(".")],
                                "explanation": f"Kombination: „{left} {right}“",
                            }
                        ],
                    }
                )
            else:
                bg = strip_html(p.get("bg", ""))
                inc = strip_html(p.get("inc", ""))
                ans = strip_html(p.get("ans", ""))
                opts = [strip_html(o) for o in p.get("options", [])]
                prompt_str = " / ".join(opts) if opts else f"{bg} / {inc}"
                items.append(
                    {
                        "id": f"s{idx + 1}",
                        "sentence": f"Hintergrund ({bg}) + Ereignis ({inc}): {{{{0}}}}",
                        "gaps": [
                            {
                                "index": 0,
                                "prompt": prompt_str,
                                "grammarHint": "Past Progressive (Hintergrund) + Simple Past (Ereignis)",
                                "hints": [f"Richtiger Satz: {ans[:20]}…"],
                                "solutions": [ans, ans.rstrip(".")],
                                "explanation": f"Lösung: „{ans}“",
                            }
                        ],
                    }
                )
        return {
            "id": f"ex{ex_key}",
            "title": ex_title,
            "type": "single_sentence",
            "instruction": instruction,
            "items": items,
        }

    # CASE 6: Spelling ('spelling') or Adjective-to-Adverb Factory ('factory')
    if ex_type in ("spelling", "factory"):
        raw_items = ex_obj.get("items", [])
        items = []
        for idx, it in enumerate(raw_items):
            base = strip_html(it.get("verb") or it.get("adj") or it.get("inf") or "")
            ans = strip_html(it.get("ans") or it.get("adv") or it.get("correct") or "")
            rule = strip_html(it.get("rule", "Beachte die Rechtschreibregel (-ing / -ly)."))
            items.append(
                {
                    "id": f"s{idx + 1}",
                    "sentence": f"{base} → {{{{0}}}}",
                    "gaps": [
                        {
                            "index": 0,
                            "prompt": base,
                            "grammarHint": rule,
                            "hints": [rule, f"Beginnt mit „{ans[:2]}…“"],
                            "solutions": [ans],
                            "explanation": f"{base} → {ans} ({rule})",
                        }
                    ],
                }
            )
        return {
            "id": f"ex{ex_key}",
            "title": ex_title,
            "type": "single_sentence",
            "instruction": instruction,
            "items": items,
        }

    # CASE 7: Sentence Join ('join' in Relative Clauses)
    if ex_type == "join":
        sentences = ex_obj.get("sentences") or ex_obj.get("items") or []
        items = []
        for idx, s in enumerate(sentences):
            s1 = strip_html(s.get("s1", ""))
            s2 = strip_html(s.get("s2", ""))
            head = strip_html(s.get("head", ""))
            pron = strip_html(s.get("pronoun", ""))
            ans = strip_html(s.get("answer") or s.get("correct") or "")
            sols = list(dict.fromkeys([ans, ans.rstrip(".")]))
            if head:
                sentence_str = f"({s1} + {s2}) → {head} {{{{0}}}}."
                prompt_str = "relative clause"
                grammar_hint = "Relativsatz mit who / which / where / whose ergänzen"
            else:
                sentence_str = f"{s1} + {s2} → {{{{0}}}}"
                prompt_str = f"join with '{pron}'"
                grammar_hint = f"Verbinde beide Sätze mit dem Relativpronomen „{pron}“"
            items.append(
                {
                    "id": f"s{idx + 1}",
                    "sentence": sentence_str,
                    "gaps": [
                        {
                            "index": 0,
                            "prompt": prompt_str,
                            "grammarHint": grammar_hint,
                            "hints": [
                                f"Beginnt mit „{' '.join(ans.split()[:2])}…“",
                            ],
                            "solutions": sols,
                            "explanation": f"Verbundener Relativsatz: „{(head + ' ' + ans).strip() if head else ans}“",
                        }
                    ],
                }
            )
        return {
            "id": f"ex{ex_key}",
            "title": ex_title,
            "type": "single_sentence",
            "instruction": instruction,
            "items": items,
        }

    # CASE 8: Irregular Verb Forms ('irregular' in klasse6-presperf / klasse6-simplepast)
    if ex_type == "irregular":
        raw_items = ex_obj.get("items", [])
        items = []
        for idx, it in enumerate(raw_items):
            inf = strip_html(it.get("inf", ""))
            past = strip_html(it.get("past", ""))
            part = strip_html(it.get("part") or it.get("pp") or "")
            hint = strip_html(it.get("hint") or it.get("de") or "Stammform")
            if "de" in it and not it.get("part"):
                # Simple Past / 3-form factory (klasse6-simplepast)
                items.append(
                    {
                        "id": f"s{idx + 1}",
                        "sentence": f"🇩🇪 „{hint}“ → to {inf} – Simple Past: {{{{0}}}} – Past Participle: {{{{1}}}}",
                        "gaps": [
                            {
                                "index": 0,
                                "prompt": f"{inf} (Simple Past)",
                                "grammarHint": f"2. Stammform von „to {inf}“ ({hint})",
                                "hints": [f"Beginnt mit „{past[:2]}…“"],
                                "solutions": expand_slash_variants(past),
                                "explanation": f"Simple Past von „to {inf}“: {past}.",
                            },
                            {
                                "index": 1,
                                "prompt": f"{inf} (Past Participle)",
                                "grammarHint": f"3. Stammform von „to {inf}“ ({hint})",
                                "hints": [f"Beginnt mit „{part[:2]}…“"],
                                "solutions": expand_slash_variants(part),
                                "explanation": f"Stammformen: {inf} – {past} – {part} ({hint}).",
                            },
                        ],
                    }
                )
            else:
                items.append(
                    {
                        "id": f"s{idx + 1}",
                        "sentence": f"{inf} – {past} – {{{{0}}}}",
                        "gaps": [
                            {
                                "index": 0,
                                "prompt": f"{inf} (Past Participle)",
                                "grammarHint": f"Deutsch: {hint} | 3. Form gesucht",
                                "hints": [f"Bedeutung: {hint}", f"Beginnt mit „{part[:2]}…“"],
                                "solutions": expand_slash_variants(part),
                                "explanation": f"Stammformen: {inf} – {past} – {part} ({hint}).",
                            }
                        ],
                    }
                )
        return {
            "id": f"ex{ex_key}",
            "title": ex_title,
            "type": "single_sentence",
            "instruction": instruction,
            "items": items,
        }

    raise ValueError(f"Unsupported legacy exercise type: {ex_type}")


# ---------------------------------------------------------------------------
# 4. Topic Definitions & Migration Pipeline
# ---------------------------------------------------------------------------
STANDARD_TOPICS = [
    # Grade 6
    {
        "id": "klasse6-simplepast",
        "file": "klasse6-simplepast.html",
        "title": "Simple Past",
        "grade": "6",
        "icon": "⏳",
        "description": "Abgeschlossene Handlungen in der Vergangenheit: Regelmäßige (-ed) & unregelmäßige Verben, Fragen mit did und Verneinung mit didn't.",
    },
    {
        "id": "klasse6-pastprog",
        "file": "klasse6-pastprog.html",
        "title": "Past Progressive",
        "grade": "6",
        "icon": "🎬",
        "description": "Handlungen im Verlauf in der Vergangenheit mit was/were + Verb-ing sowie Hintergrundhandlungen.",
    },
    {
        "id": "klasse6-contrast",
        "file": "klasse6-contrast.html",
        "title": "Simple Past vs. Past Progressive",
        "grade": "6",
        "icon": "⚡",
        "description": "Kontrasttraining mit when & while: Laufende Hintergrundhandlung (Past Progressive) vs. plötzlich eintretendes Ereignis (Simple Past).",
    },
    {
        "id": "klasse6-presperf",
        "file": "klasse6-presperf.html",
        "title": "Present Perfect Simple",
        "grade": "6",
        "icon": "🌉",
        "description": "Die Brücke zwischen Vergangenheit und Gegenwart: have/has + Past Participle (3. Form) mit just, already, yet, ever, never.",
    },
    {
        "id": "klasse6-future",
        "file": "klasse6-future.html",
        "title": "Future Mix (Will vs. Going-to)",
        "grade": "6",
        "icon": "🚀",
        "description": "Pläne und Beweise (going to) vs. spontane Entscheidungen, Versprechen und Vorhersagen (will/won't).",
    },
    # Grade 7
    {
        "id": "klasse7-sp-pp",
        "file": "klasse7-sp-pp.html",
        "title": "Simple Past vs. Present Perfect",
        "grade": "7",
        "icon": "🕰️",
        "description": "Abgeschlossener Zeitpunkt (yesterday, ago, in 2020) vs. Auswirkungen im Jetzt (since, for, just, yet).",
    },
    {
        "id": "klasse7-pp-prog",
        "file": "klasse7-pp-prog.html",
        "title": "Present Perfect Progressive",
        "grade": "7",
        "icon": "🔄",
        "description": "Wie lange dauert etwas schon an? Bildung mit have/has + been + Verb-ing samt since/for-Training.",
    },
    {
        "id": "klasse7-pastperf",
        "file": "klasse7-pastperf.html",
        "title": "Past Perfect",
        "grade": "7",
        "icon": "⏪",
        "description": "Die Vorvergangenheit mit had + Past Participle im Zusammenspiel mit dem Simple Past (after, before, when).",
    },
    {
        "id": "klasse7-modals",
        "file": "klasse7-modals.html",
        "title": "Modal Verbs & Substitutes",
        "grade": "7",
        "icon": "🛠️",
        "description": "Ersatzformen der Modalverben in allen Zeiten: be able to, have to und be allowed to.",
    },
    {
        "id": "klasse7-relative",
        "file": "klasse7-relative.html",
        "title": "Relative Clauses & Contact Clauses",
        "grade": "7",
        "icon": "🔗",
        "description": "Relativsätze mit who, which, that, whose sowie Contact Clauses (Weglassen des Relativpronomens).",
    },
    {
        "id": "klasse7-adverbs",
        "file": "klasse7-adverbs.html",
        "title": "Adjectives vs. Adverbs of Manner",
        "grade": "7",
        "icon": "🏃",
        "description": "Bildung auf -ly, unregelmäßige Adverbien (good → well, fast, hard) und Einsatz nach Verben der Wahrnehmung.",
    },
    {
        "id": "klasse7-if1",
        "file": "klasse7-if1.html",
        "title": "If-Clauses Typ 1",
        "grade": "7",
        "icon": "🌦️",
        "description": "Reale Bedingungen: Simple Present im If-Satz + will/can/must + Infinitiv im Hauptsatz.",
    },
    {
        "id": "klasse7-if2",
        "file": "klasse7-if2.html",
        "title": "If-Clauses Typ 2",
        "grade": "7",
        "icon": "💭",
        "description": "Irreale Bedingungen und Träume: Simple Past im If-Satz (If I were you) + would/could + Infinitiv.",
    },
    # Grade 8
    {
        "id": "klasse8-passive",
        "file": "klasse8-passive.html",
        "title": "The Passive Voice",
        "grade": "8",
        "icon": "🏛️",
        "description": "Aktiv in Passiv umwandeln, korrekte Formen von 'to be' + Past Participle in allen Zeitformen und by-Agent.",
    },
    {
        "id": "klasse8-personal-passive",
        "file": "klasse8-personal-passive.html",
        "title": "Personal Passive",
        "grade": "8",
        "icon": "👤",
        "description": "Persönliches Passiv bei Verben mit zwei Objekten (give, send, show, offer, promise).",
    },
    {
        "id": "klasse8-if3",
        "file": "klasse8-if3.html",
        "title": "If-Clauses Typ 3",
        "grade": "8",
        "icon": "⏮️",
        "description": "Irreale Bedingungen der Vergangenheit: had + Past Participle im If-Satz und would/could have + Past Participle.",
    },
    {
        "id": "klasse8-if-revision",
        "file": "klasse8-if-revision.html",
        "title": "If-Clauses Typ 1–3 (Master-Mix)",
        "grade": "8",
        "icon": "🎯",
        "description": "Alle drei Bedingungssatz-Typen im direkten Vergleich sicher erkennen und fehlerfrei bilden.",
    },
    {
        "id": "klasse8-pronouns",
        "file": "klasse8-pronouns.html",
        "title": "Reflexive Pronouns vs. each other",
        "grade": "8",
        "icon": "🪞",
        "description": "Unterscheidung zwischen rückbezüglichen Pronomen (myself, themselves) und wechselseitigem 'each other'.",
    },
    {
        "id": "klasse8-questions",
        "file": "klasse8-questions.html",
        "title": "Subject vs. Object Questions",
        "grade": "8",
        "icon": "❓",
        "description": "Fragen mit who und what: Wann braucht man das Hilfsverb 'do/did' (Objektfrage) und wann nicht (Subjektfrage)?",
    },
]


def migrate_standard_topic(meta: dict) -> dict:
    html_path = ROOT / meta["file"]
    if not html_path.exists():
        # Might already be in _legacy/
        html_path = ROOT / "_legacy" / meta["file"]
    html = html_path.read_text(encoding="utf-8")

    ex_data = extract_js_assignment(html, "exerciseData")
    if not ex_data:
        raise RuntimeError(f"Could not extract exerciseData from {meta['file']}")

    titles = extract_exercise_titles(html)
    rules = extract_rules_from_html(html, meta["title"])
    state_key, mastered_key = extract_storage_keys(html, f"grammar_{meta['id'].replace('-', '_')}")

    exercises = []
    for k in sorted(ex_data.keys(), key=lambda x: int(x) if x.isdigit() else x):
        ex_title = titles.get(str(k), f"Übung {k}")
        ex_obj = ex_data[k]
        if ex_obj.get("type") == "irregular" and not ex_obj.get("items"):
            fallback_irr = extract_js_assignment(html, "irregulars")
            if fallback_irr:
                ex_obj["items"] = fallback_irr
        exercises.append(convert_legacy_exercise(str(k), ex_title, ex_obj))

    return {
        "id": meta["id"],
        "title": meta["title"],
        "grade": meta["grade"],
        "icon": meta["icon"],
        "description": meta["description"],
        "legacyStorageKey": state_key,
        "legacyMasteredKey": mastered_key,
        "rules": rules,
        "exercises": exercises,
    }


def migrate_grade9_10() -> dict:
    html_path = ROOT / "klasse9-10.html"
    if not html_path.exists():
        html_path = ROOT / "_legacy" / "klasse9-10.html"
    html = html_path.read_text(encoding="utf-8")

    raw_ex = extract_js_assignment(html, "exercises")
    if not raw_ex:
        raise RuntimeError("Could not extract exercises from klasse9-10.html")

    ordered_keys = sorted(raw_ex.keys(), key=lambda k: raw_ex[k].get("num", 99))
    exercises = []

    for key in ordered_keys:
        ex_obj = raw_ex[key]
        cat = ex_obj.get("cat", "Mixed")
        num = ex_obj.get("num", 1)
        title = ex_obj.get("title", f"Exercise {num}")
        content = ex_obj.get("content", [])

        items = []
        for idx, it in enumerate(content):
            before = strip_html(it.get("textBefore", ""))
            after = strip_html(it.get("textAfter", ""))
            prompt = clean_prompt(it.get("prompt", ""))
            sols = [str(s).strip() for s in it.get("correct", []) if str(s).strip()]
            fb = strip_html(it.get("fb", "Mixed Grammar Revision"))

            if before and after:
                sentence = f"{before} {{{{0}}}} {after}"
            elif before:
                sentence = f"{before} {{{{0}}}}"
            else:
                sentence = f"{{{{0}}}} {after}"

            items.append(
                {
                    "id": f"s{idx + 1}",
                    "sentence": re.sub(r"\s+", " ", sentence).strip(),
                    "gaps": [
                        {
                            "index": 0,
                            "prompt": prompt,
                            "grammarHint": f"[{cat}] {fb}",
                            "hints": build_hints(sols, fb),
                            "solutions": sols or [""],
                            "explanation": f"{fb} → Lösung: {', '.join(sols)}",
                        }
                    ],
                }
            )

        exercises.append(
            {
                "id": key.lower(),
                "title": f"{num}. [{cat}] {title}",
                "type": "single_sentence",
                "instruction": f"Mixed Grammar ({cat}): Setze die passende Form, Präposition oder Struktur ein.",
                "items": items,
            }
        )

    return {
        "id": "klasse9-10-mixed",
        "title": "Mixed Grammar Mastery (Beginner • Intermediate • Expert)",
        "grade": "9-10",
        "icon": "🏆",
        "description": "15 umfassende Mixed-Grammar-Einheiten (150 Sätze): Gerund vs. Infinitive, Participles, Passive, Conditionals I–III & Inversion.",
        "legacyStorageKey": "grammar_g9_10_state",
        "legacyMasteredKey": "grammar_g9_10_mastered",
        "rules": {
            "title": "Oberstufen- & Prüfungs-Grammatik im Mix",
            "summary": "In Klasse 9/10 greifen alle Strukturen ineinander: Achte besonders auf Verben mit Gerund (-ing) vs. to-Infinitive, Partizipialkonstruktionen (Having + Past Participle), unpersönliches Passiv (is said to be / to have been) und Mixed Conditionals.",
            "examples": [
                "Gerund: avoid, enjoy, mind, suggest, look forward to, succeed in + -ing",
                "Infinitive: decide, refuse, manage, expect, promise + to + Infinitive",
                "Participles: Having finished the report, she went home.",
                "Reporting Passive: The fortress is reported to have been built in 1240."
            ],
        },
        "exercises": exercises,
    }


def expand_slash_variants(form: str) -> list:
    """Turns 'was/were' into ['was/were', 'was / were', 'was', 'were'] or 'burnt/burned' into both."""
    f = form.strip()
    variants = [f]
    if "/" in f:
        parts = [p.strip() for p in f.split("/") if p.strip()]
        variants.append(" / ".join(parts))
        variants.extend(parts)
    return list(dict.fromkeys(variants))


def migrate_irregular_verbs(grade_str: str, html_filename: str, display_grade: str) -> dict:
    html_path = ROOT / html_filename
    if not html_path.exists():
        html_path = ROOT / "_legacy" / html_filename
    html = html_path.read_text(encoding="utf-8")

    verbs = extract_js_assignment(html, "verbData")
    if not verbs:
        raise RuntimeError(f"Could not extract verbData from {html_filename}")

    # Group verbs into chunks of 20 so students can complete manageable sets
    chunk_size = 20
    exercises = []
    for chunk_idx in range(0, len(verbs), chunk_size):
        chunk = verbs[chunk_idx : chunk_idx + chunk_size]
        part_num = (chunk_idx // chunk_size) + 1
        first_inf = chunk[0]["inf"]
        last_inf = chunk[-1]["inf"]

        items = []
        for idx, v in enumerate(chunk):
            de = strip_html(v["de"])
            inf = strip_html(v["inf"])
            sp = strip_html(v["sp"])
            pp = strip_html(v["pp"])

            items.append(
                {
                    "id": f"v{chunk_idx + idx + 1}",
                    "sentence": f"🇩🇪 „{de}“ → Infinitive: {{{{0}}}} | Simple Past: {{{{1}}}} | Past Participle: {{{{2}}}}",
                    "gaps": [
                        {
                            "index": 0,
                            "prompt": "1. Form (Infinitive)",
                            "grammarHint": f"Deutsch: „{de}“ – Grundform (to ...)",
                            "hints": [f"Beginnt mit „{inf[:2]}…“ ({len(inf)} Buchstaben)."],
                            "solutions": expand_slash_variants(inf),
                            "explanation": f"Infinitive von „{de}“: to {inf} ({inf} – {sp} – {pp}).",
                        },
                        {
                            "index": 1,
                            "prompt": "2. Form (Simple Past)",
                            "grammarHint": f"Simple Past von „to {inf}“ ({de})",
                            "hints": [f"2. Stammform beginnt mit „{sp[:2]}…“."],
                            "solutions": expand_slash_variants(sp),
                            "explanation": f"Simple Past von „to {inf}“: {sp} ({inf} – {sp} – {pp}).",
                        },
                        {
                            "index": 2,
                            "prompt": "3. Form (Past Participle)",
                            "grammarHint": f"Past Participle (3. Form) von „to {inf}“",
                            "hints": [f"3. Stammform beginnt mit „{pp[:2]}…“."],
                            "solutions": expand_slash_variants(pp),
                            "explanation": f"Past Participle von „to {inf}“: {pp} ({inf} – {sp} – {pp}).",
                        },
                    ],
                }
            )

        exercises.append(
            {
                "id": f"ex{part_num}",
                "title": f"Teil {part_num}: {first_inf} – {last_inf} ({len(chunk)} Verben)",
                "type": "single_sentence",
                "instruction": "Gib alle drei Stammformen (Infinitive, Simple Past, Past Participle) zum deutschen Verb ein.",
                "items": items,
            }
        )

    topic_id = f"irregular-verbs-{grade_str}"
    return {
        "id": topic_id,
        "title": f"Irregular Verbs Mastery ({display_grade})",
        "grade": "9-10" if grade_str in ("9", "10") else grade_str,
        "icon": "⚡",
        "description": f"Alle {len(verbs)} unregelmäßigen Verben der {display_grade} mit 3-Stammformen-Training (Infinitive, Simple Past, Past Participle).",
        "legacyStorageKey": f"grammar_irreg_{grade_str}_state",
        "legacyMasteredKey": f"grammar_irreg_{grade_str}_mastered",
        "rules": {
            "title": "Drei Stammformen sicher beherrschen",
            "summary": "Unregelmäßige Verben folgen oft festen Lautmustern (z. B. sing–sang–sung, bring–brought–brought oder put–put–put). Präge dir immer alle drei Formen gemeinsam ein.",
            "examples": [
                "AAA-Gruppe (alle gleich): cost – cost – cost | hit – hit – hit | put – put – put",
                "ABB-Gruppe (2. & 3. gleich): buy – bought – bought | catch – caught – caught | build – built – built",
                "ABC-Gruppe (Vokalwechsel): sing – sang – sung | drive – drove – driven | speak – spoke – spoken",
            ],
        },
        "exercises": exercises,
    }


# ---------------------------------------------------------------------------
# 5. Schema Validation
# ---------------------------------------------------------------------------
def validate_topic_json(data: dict, filename: str):
    required_top = ["id", "title", "grade", "description", "rules", "exercises"]
    for req in required_top:
        if req not in data:
            raise AssertionError(f"[{filename}] Missing top-level key: {req}")

    if str(data["grade"]) not in ("5", "6", "7", "8", "9-10", "challenges"):
        raise AssertionError(f"[{filename}] Invalid grade: {data['grade']}")

    if not isinstance(data["exercises"], list) or len(data["exercises"]) == 0:
        raise AssertionError(f"[{filename}] 'exercises' must be a non-empty list")

    for ex in data["exercises"]:
        for k in ("id", "title", "type"):
            if k not in ex:
                raise AssertionError(f"[{filename}] Exercise missing '{k}'")
        if ex["type"] == "single_sentence":
            item_list = ex.get("items") or ex.get("sentences") or []
            if not item_list:
                raise AssertionError(f"[{filename}] Exercise {ex['id']} has empty items/sentences")
            for it in item_list:
                s_txt = it.get("sentence") or it.get("text") or ""
                if "{{0}}" not in s_txt and "{{gap}}" not in s_txt:
                    raise AssertionError(f"[{filename}] Item {it['id']} in {ex['id']} missing gap placeholder")
                for g in it.get("gaps", []):
                    if not g.get("solutions"):
                        raise AssertionError(f"[{filename}] Gap in {ex['id']}/{it['id']} has no solutions")
        elif ex["type"] == "cloze_text":
            has_text_gaps = bool(ex.get("text") and ex.get("gaps"))
            has_sentences = bool(ex.get("sentences"))
            if not (has_text_gaps or has_sentences):
                raise AssertionError(f"[{filename}] Cloze exercise {ex['id']} missing text/gaps or sentences")


# ---------------------------------------------------------------------------
# 6. Main Execution
# ---------------------------------------------------------------------------
def main():
    TOPICS_DIR.mkdir(parents=True, exist_ok=True)
    generated_topics = []

    # 1. Standard Klasse 6-8 topics
    for meta in STANDARD_TOPICS:
        topic_data = migrate_standard_topic(meta)
        validate_topic_json(topic_data, f"{meta['id']}.json")
        out_path = TOPICS_DIR / f"{meta['id']}.json"
        out_path.write_text(json.dumps(topic_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        generated_topics.append(topic_data)
        print(f"[OK] Migrated {meta['id']} ({len(topic_data['exercises'])} exercises)")

    # 2. Klasse 9-10 Mixed Grammar (all 15 units = 150 sentences)
    g9_data = migrate_grade9_10()
    validate_topic_json(g9_data, "klasse9-10-mixed.json")
    (TOPICS_DIR / "klasse9-10-mixed.json").write_text(
        json.dumps(g9_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    generated_topics.append(g9_data)
    print(f"[OK] Migrated klasse9-10-mixed ({len(g9_data['exercises'])} exercises)")

    # 3. Irregular Verbs 7, 8, 9, 10
    irreg_configs = [
        ("7", "irregular_verbs_7.html", "Klasse 7"),
        ("8", "irregular_verbs_8.html", "Klasse 8"),
        ("9", "irregular_verbs_9.html", "Klasse 9"),
        ("10", "irregular_verbs_10.html", "Klasse 10"),
    ]
    for g_str, fname, label in irreg_configs:
        irreg_data = migrate_irregular_verbs(g_str, fname, label)
        validate_topic_json(irreg_data, f"{irreg_data['id']}.json")
        (TOPICS_DIR / f"{irreg_data['id']}.json").write_text(
            json.dumps(irreg_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        generated_topics.append(irreg_data)
        print(f"[OK] Migrated {irreg_data['id']} ({len(irreg_data['exercises'])} exercises)")

    # 4. Validate pre-existing klasse5-present.json & word-formation-u1.json
    for existing_name in ("klasse5-present.json", "word-formation-u1.json"):
        p = TOPICS_DIR / existing_name
        d = json.loads(p.read_text(encoding="utf-8"))
        validate_topic_json(d, existing_name)
        print(f"[OK] Validated existing {existing_name} ({len(d['exercises'])} exercises)")

    # 5. Update data/topics-catalog.json
    grade_accent_map = {
        "5": "blue",
        "6": "violet",
        "7": "emerald",
        "8": "amber",
        "9-10": "rose",
        "challenges": "violet",
    }
    grade_category_map = {
        "5": "Klasse 5 · Foundations",
        "6": "Klasse 6 · Past & Future",
        "7": "Klasse 7 · Clauses & Modals",
        "8": "Klasse 8 · Passive & Conditionals",
        "9-10": "Klasse 9 & 10 · Mixed Mastery",
        "challenges": "B2 / Challenges",
    }

    catalog = {
        "version": "2.0.0",
        "grades": [
            {
                "id": "5",
                "grade": "5",
                "label": "Klasse 5",
                "icon": "🌱",
                "subtitle": "Grundlagen & Erste Zeiten",
                "accentColor": "blue",
            },
            {
                "id": "6",
                "grade": "6",
                "label": "Klasse 6",
                "icon": "📚",
                "subtitle": "Vergangenheit & Zukunft",
                "accentColor": "violet",
            },
            {
                "id": "7",
                "grade": "7",
                "label": "Klasse 7",
                "icon": "📖",
                "subtitle": "Komplexe Sätze & Zeitenfolge",
                "accentColor": "emerald",
            },
            {
                "id": "8",
                "grade": "8",
                "label": "Klasse 8",
                "icon": "📝",
                "subtitle": "Passiv, Bedingungssätze & Satzbau",
                "accentColor": "amber",
            },
            {
                "id": "9-10",
                "grade": "9-10",
                "label": "Klasse 9 & 10",
                "icon": "🎓",
                "subtitle": "Mixed Grammar & Prüfungs-Training",
                "accentColor": "rose",
            },
            {
                "id": "challenges",
                "grade": "challenges",
                "label": "B2 / Challenges",
                "icon": "🧩",
                "subtitle": "Word Formation & Irregular Verbs Challenges",
                "accentColor": "violet",
            },
        ],
        "topics": [
            {
                "id": "klasse5-present",
                "title": "Simple Present vs. Present Progressive",
                "grade": "5",
                "category": grade_category_map["5"],
                "icon": "🌱",
                "accentColor": "blue",
                "description": "Routine & Fakten (every day, usually) vs. Handlungen genau jetzt (Look!, right now).",
                "exerciseCount": 4,
                "legacyMasteryKey": "grammar_g5_presentcontrast_mastered",
                "legacyMasteredKey": "grammar_g5_pres_contrast_mastered",
                "hasJson": True,
            },
        ],
    }

    for meta in STANDARD_TOPICS:
        t_json = json.loads((TOPICS_DIR / f"{meta['id']}.json").read_text(encoding="utf-8"))
        g = str(t_json["grade"])
        catalog["topics"].append(
            {
                "id": t_json["id"],
                "title": t_json["title"],
                "grade": g,
                "category": grade_category_map.get(g, f"Klasse {g}"),
                "icon": t_json["icon"],
                "accentColor": grade_accent_map.get(g, "blue"),
                "description": t_json["description"],
                "exerciseCount": len(t_json["exercises"]),
                "legacyMasteryKey": t_json["legacyMasteredKey"],
                "legacyMasteredKey": t_json["legacyMasteredKey"],
                "hasJson": True,
            }
        )

    # Add Grade 9-10 Mixed
    catalog["topics"].append(
        {
            "id": g9_data["id"],
            "title": g9_data["title"],
            "grade": g9_data["grade"],
            "category": grade_category_map["9-10"],
            "icon": g9_data["icon"],
            "accentColor": "rose",
            "description": g9_data["description"],
            "exerciseCount": len(g9_data["exercises"]),
            "legacyMasteryKey": g9_data["legacyMasteredKey"],
            "legacyMasteredKey": g9_data["legacyMasteredKey"],
            "hasJson": True,
        }
    )

    # Add Word Formation Unit 1 under B2 / Challenges
    catalog["topics"].append(
        {
            "id": "word-formation-u1",
            "title": "Word Formation: Unit 1",
            "grade": "challenges",
            "category": "B2 / Challenges · Word Families",
            "icon": "🧩",
            "accentColor": "violet",
            "description": "Wortfamilien-Training: Nomen-Suffixe, Adjektive/Adverbien, negative Präfixe (un-, in-, im-, il-, ir-, dis-) & Exam Cloze.",
            "exerciseCount": 4,
            "legacyMasteryKey": "grammar_wf_u1_mastered",
            "legacyMasteredKey": "grammar_wf_u1_mastered",
            "hasJson": True,
            "isChallenge": True,
        }
    )

    # Add Irregular Verbs 7, 8, 9, 10 under B2 / Challenges
    for g_str, fname, label in irreg_configs:
        t_id = f"irregular-verbs-{g_str}"
        t_json = json.loads((TOPICS_DIR / f"{t_id}.json").read_text(encoding="utf-8"))
        catalog["topics"].append(
            {
                "id": t_json["id"],
                "title": t_json["title"],
                "grade": "challenges",
                "category": f"B2 / Challenges · {label}",
                "icon": t_json["icon"],
                "accentColor": "emerald",
                "description": t_json["description"],
                "exerciseCount": len(t_json["exercises"]),
                "legacyMasteryKey": t_json["legacyMasteredKey"],
                "legacyMasteredKey": t_json["legacyMasteredKey"],
                "hasJson": True,
                "isChallenge": True,
            }
        )

    CATALOG_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[OK] Updated {CATALOG_PATH.name} with {len(catalog['topics'])} total topics.")

    # 6. Write data/topics-bundle.js for local file:// fallback (when fetch is blocked by CORS)
    all_topics_map = {}
    for p in sorted(TOPICS_DIR.glob("*.json")):
        obj = json.loads(p.read_text(encoding="utf-8"))
        all_topics_map[obj["id"]] = obj

    bundle_js = (
        "// Auto-generated fallback bundle for local file:// protocol execution\n"
        f"window.GM_CATALOG = {json.dumps(catalog, ensure_ascii=False)};\n"
        f"window.GM_TOPICS = {json.dumps(all_topics_map, ensure_ascii=False)};\n"
    )
    bundle_path = ROOT / "data" / "topics-bundle.js"
    bundle_path.write_text(bundle_js, encoding="utf-8")
    print(f"[OK] Wrote {bundle_path.name} ({len(all_topics_map)} bundled topics for offline/file:// fallback).")

    # 7. Build modules/standalone-runtime.js for file:// protocol fallback
    mod_dir = ROOT / "modules"
    gam_src = (mod_dir / "gamification.js").read_text(encoding="utf-8")
    ui_src = (mod_dir / "ui.js").read_text(encoding="utf-8")
    eng_src = (mod_dir / "engine.js").read_text(encoding="utf-8")

    def strip_esm(code: str) -> str:
        code = re.sub(r"^\s*import\s+.*?;?\s*$", "", code, flags=re.M)
        code = re.sub(r"^\s*export\s+default\s+.*?;?\s*$", "", code, flags=re.M)
        code = re.sub(r"^\s*export\s+(const|let|var|class|function)\s+", r"\1 ", code, flags=re.M)
        return code

    standalone_code = (
        "// Auto-generated standalone runtime fallback for local file:// protocol\n"
        "(function () {\n"
        "  if (window.__GM_MODULE_BOOTED) return;\n\n"
        + strip_esm(gam_src)
        + "\n\n"
        + strip_esm(ui_src)
        + "\n\n"
        + strip_esm(eng_src)
        + "\n  window.GM_Gamification = Gamification;\n"
        "  window.GM_TROPHY_BADGES = TROPHY_BADGES;\n"
        "  window.GM_UI = UI;\n"
        "})();\n"
    )
    (mod_dir / "standalone-runtime.js").write_text(standalone_code, encoding="utf-8")
    print("[OK] Wrote modules/standalone-runtime.js for file:// fallback.")

    # 8. Pre-render all grade sections & topic cards into index.html #hub-topics-root
    index_path = ROOT / "index.html"
    if index_path.exists():
        idx_html = index_path.read_text(encoding="utf-8")
        sections_html = []
        for g_meta in catalog["grades"]:
            g_id = str(g_meta["grade"])
            items = [t for t in catalog["topics"] if str(t["grade"]) == g_id]
            if not items:
                continue
            cards = []
            for t in items:
                href = f"exercise.html?topic={t['id']}"
                color = t.get("accentColor") or g_meta.get("accentColor") or "blue"
                cards.append(
                    f'          <a href="{href}" class="gm-topic-card" data-topic-id="{t["id"]}" data-color="{color}">\n'
                    f'            <div>\n'
                    f'              <div class="gm-topic-card-top">\n'
                    f'                <div class="gm-topic-badges">\n'
                    f'                  <span class="gm-card-tag">{t.get("category", g_meta["label"])}</span>\n'
                    f'                  <span class="gm-card-tag is-engine">⚡ 2026 Engine</span>\n'
                    f'                </div>\n'
                    f'                <span class="gm-topic-icon" aria-hidden="true">{t.get("icon", "📘")}</span>\n'
                    f'              </div>\n'
                    f'              <h3 class="gm-topic-card-title">{t["title"]}</h3>\n'
                    f'              <p class="gm-topic-card-desc">{t["description"]}</p>\n'
                    f'            </div>\n'
                    f'            <div class="gm-topic-card-footer">\n'
                    f'              <span>{t["exerciseCount"]} Übungen · Einzelsätze &amp; Text</span>\n'
                    f'              <span class="gm-topic-cta">Starten →</span>\n'
                    f'            </div>\n'
                    f'          </a>'
                )
            sections_html.append(
                f'      <section class="gm-grade-section" data-grade-section="{g_id}">\n'
                f'        <div class="gm-grade-section-header">\n'
                f'          <h2 class="gm-grade-section-title"><span>{g_meta["icon"]}</span><span>{g_meta["label"]}</span></h2>\n'
                f'          <span class="gm-grade-section-sub">{g_meta.get("subtitle", "")}</span>\n'
                f'        </div>\n'
                f'        <div class="gm-topics-grid">\n'
                + "\n".join(cards)
                + "\n        </div>\n      </section>"
            )

        new_main = (
            '<main id="hub-topics-root" aria-live="polite">\n'
            + "\n".join(sections_html)
            + "\n    </main>"
        )
        idx_html_updated = re.sub(
            r'<main id="hub-topics-root"[^>]*>.*?</main>',
            lambda _: new_main,
            idx_html,
            flags=re.S,
        )
        index_path.write_text(idx_html_updated, encoding="utf-8")
        print("[OK] Pre-rendered all 26 topic cards into index.html #hub-topics-root.")


if __name__ == "__main__":
    main()
