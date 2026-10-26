# Changelog – Grammar Mastery

Alle wesentlichen Architektur-, Design- und Funktionsänderungen an diesem Projekt werden in dieser Datei dokumentiert.

---

## [2.1.0] – 2026-10-26 (Schritt 2: Vollständige Content-Migration, Word Formation Challenge & Legacy-Bereinigung)

### 🧩 Teil A: Word Formation Challenge (`word-formation-u1`)
- **Neuer Challenge-Datensatz (`data/topics/word-formation-u1.json`)**:
  - Strukturiertes Wortfamilien-Training mit 4 Einheiten:
    1. *Nouns & Suffixes (-tion, -ment, -ance, -ness, -ity, -ature)*
    2. *Adjectives & Adverbs in Context (-ive, -ally, -able, -ous, -ful)*
    3. *Negative Prefixes (un-, in-, im-, il-, ir-, dis-)*
    4. *Exam Cloze: The Power of Curiosity* (`cloze_text`)
- **Integration im 2026 Lern-Hub (`index.html` & `data/topics-catalog.json`)**:
  - Dedizierte **Featured Challenge Spotlight-Card** auf der Startseite sowie eigener Filter-Tab `🧩 Challenges`, direkt verknüpft mit `exercise.html?topic=word-formation-u1`.

### 🤖 Teil B: Automatisierte Migration aller Klassenstufen (`scripts/migrate_topics.py`)
- **Deterministischer JS-Tokenizer & AST-Konverter (`scripts/migrate_topics.py`)**:
  - Extrahiert sämtliche Übungsdaten (`exerciseData`, `exercises`, `verbData`, `irregulars`), Grammatikregeln (`#topic-info`), Übungstitel (`#label-ex1..5`) und `localStorage`-Keys aus allen historischen HTML-Dateien.
  - Konvertiert alle historischen Aufgabentypen (`cloze`, `mc`, `race`, `sort`, `scramble`, `puzzle`, `background`, `spelling`, `factory`, `join`, `irregular`) verlustfrei in das universelle v2.0 JSON-Schema (`single_sentence` & `cloze_text`).
  - Validiert jede generierte JSON-Datei automatisch gegen die Pflichtfelder und Lücken-Platzhalter.
- **Übersicht aller 26 migrierten JSON-Themen in `data/topics/` (`hasJson: true`)**:
  - **Special Challenges**:
    - `word-formation-u1.json` (*Word Formation: Unit 1 Challenge* – 4 Übungen)
    - `irregular-verbs-7.json` (*Irregular Verbs Mastery Klasse 7* – 85 Verben in 5 Teilen)
    - `irregular-verbs-8.json` (*Irregular Verbs Mastery Klasse 8* – 89 Verben in 5 Teilen)
    - `irregular-verbs-9.json` (*Irregular Verbs Mastery Klasse 9* – 106 Verben in 6 Teilen)
    - `irregular-verbs-10.json` (*Irregular Verbs Mastery Klasse 10* – 106 Verben in 6 Teilen)
  - **Klasse 5**:
    - `klasse5-present.json` (*Simple Present vs. Present Progressive* – 4 Übungen)
  - **Klasse 6**:
    - `klasse6-simplepast.json` (*Simple Past* – 5 Übungen)
    - `klasse6-pastprog.json` (*Past Progressive* – 5 Übungen)
    - `klasse6-contrast.json` (*Simple Past vs. Past Progressive* – 5 Übungen)
    - `klasse6-presperf.json` (*Present Perfect Simple* – 5 Übungen)
    - `klasse6-future.json` (*Future Mix: Will vs. Going-to* – 5 Übungen)
  - **Klasse 7**:
    - `klasse7-sp-pp.json` (*Simple Past vs. Present Perfect* – 5 Übungen)
    - `klasse7-pp-prog.json` (*Present Perfect Progressive* – 5 Übungen)
    - `klasse7-pastperf.json` (*Past Perfect* – 5 Übungen)
    - `klasse7-modals.json` (*Modal Verbs & Substitutes* – 5 Übungen)
    - `klasse7-relative.json` (*Relative Clauses & Contact Clauses* – 5 Übungen)
    - `klasse7-adverbs.json` (*Adjectives vs. Adverbs of Manner* – 5 Übungen)
    - `klasse7-if1.json` (*If-Clauses Typ 1* – 5 Übungen)
    - `klasse7-if2.json` (*If-Clauses Typ 2* – 5 Übungen)
  - **Klasse 8**:
    - `klasse8-passive.json` (*The Passive Voice* – 5 Übungen)
    - `klasse8-personal-passive.json` (*Personal Passive* – 5 Übungen)
    - `klasse8-if3.json` (*If-Clauses Typ 3* – 5 Übungen)
    - `klasse8-if-revision.json` (*If-Clauses Typ 1–3 Master-Mix* – 5 Übungen)
    - `klasse8-pronouns.json` (*Reflexive Pronouns vs. each other* – 5 Übungen)
    - `klasse8-questions.json` (*Subject vs. Object Questions* – 5 Übungen)
  - **Klasse 9 & 10**:
    - `klasse9-10-mixed.json` (*Mixed Grammar Mastery: Beginner, Intermediate & Expert* – alle 15 Einheiten / 150 Sätze)

### 🧹 Bereinigung & Archivierung (`_legacy/`)
- Alle 29 redundanten historischen HTML-Dateien (`grade7.html`, `klasse5.html`, `klasse6*.html`, `klasse7*.html`, `klasse8*.html`, `klasse9-10.html`, `irregular_verbs_*.html`) wurden aus dem Root-Verzeichnis in den Archiv-Ordner `_legacy/` verschoben.
- Im Root-Verzeichnis verbleiben ausschließlich die beiden Einstiegspunkte der neuen Single-Engine-Architektur: `index.html` (Lern-Hub) und `exercise.html` (Universeller Trainer).

---

## [2.0.0] – 2026-10-26 (Schritt 1: Architektur-Refactoring, "2026 Dark Aesthetic" & Mobile-First 100dvh)

### 🏗️ Architektur-Refactoring (Single-Engine-System)
Überführung der historischen Struktur mit über 20 redundanten Themen-HTML-Dateien in eine modulare **Single-Engine-Architektur**:
- **Zentrale Übungsansicht (`exercise.html`)**: Universeller Grammatik-Trainer, gesteuert über URL-Parameter (z. B. `exercise.html?topic=klasse5-present` oder `exercise.html?topic=klasse7-if1&ex=ex2`).
- **Trennung von Daten & Logik (`/data/` & `/modules/`)**:
  - `/data/schema.json`: Formales JSON-Schema (Draft 2020-12) für alle Grammatik-Themen.
  - `/data/topics-catalog.json`: Zentraler Themen-Katalog über alle Jahrgangsstufen (Klasse 5 bis 10) mit Abwärtskompatibilitäts-Mapping für bestehende `localStorage`-Mastery-Keys.
  - `/data/topics/*.json`: Reine Inhaltsdaten mit Metadaten (`id`, `title`, `grade`, `category`, `description`, `rules`) und `exercises`-Array (`single_sentence` & `cloze_text`), Sätzen, Lücken-Definitionen (`gap`/`prompt`, `grammarHint`, `hints`, `solutions`) und didaktischen Erklärungen (`explanation`).

### 🧩 Native ES-Module (`/modules/`)
- **`/modules/engine.js`**:
  - Dynamisches Laden des gewählten Themas via `fetch('data/topics/<topic>.json')` inklusive Schema-Normalisierung (`normalizeTopicData`).
  - Dedizierte Renderer für **Einzelsätze (`single_sentence`)** und **zusammenhängende Lückentexte (`cloze_text`)**.
  - Tolerante Antwort-Normalisierung (Groß-/Kleinschreibung, typografische Apostrophe, Kurz-/Langformen).
- **`/modules/gamification.js`**:
  - Saubere Kapselung von Erfahrungspunkten (`gm_global_xp`), täglichen Lernserien (`gm_daily_streak`), Level- & Rang-Berechnung (`POINTS_PER_LEVEL = 150`) und Trophäen-Badges (`gm_unlocked_badges`).
  - Persistenz des Themen- und Übungsfortschritts (`gm_topic_progress_v2`) inklusive bidirektionaler Synchronisation mit Legacy-`localStorage`-Keys.
  - Reaktives Pub/Sub-Pattern (`subscribe`) und autarker Web-Audio-Synthesizer (`playSound`).
- **`/modules/ui.js`**:
  - Echtzeit-Synchronisation zwischen der fixierten unteren Eingabezeile (`#gm-dock-input`) und den aktiven Lücken-Slots im Satz bzw. Fließtext (`syncGapSlotDOM`, `updateInputDock`).
  - Slide-Up **Feedback-Drawer** (`#gm-feedback-drawer`) für unmittelbare didaktische Erklärungen, Lösungen und abgestufte Tipps.
  - Globales **Tastatur-Handling** (`bindKeyboardController`): Intelligente `Enter`-Steuerung (Prüfen → Weiter zur nächsten Lücke), `Tab` / `Shift+Tab` zur Lücken-Navigation und `Escape` zum Schließen von Drawern/Modals.

### 🎨 Design-Upgrade ("2026 Dark Aesthetic") & Layout-Bugfixes
- **Überlappungsfreie Hinweise**:
  - Infinitiv- und Grammatik-Hinweise überdecken niemals das Eingabefeld.
  - Feste Positionierung in einer dedizierten Hinweis-Leiste oberhalb des Eingabefelds (`#gm-dock-cue-bar`), im Satz-Header (`.gm-non-overlapping-hint-bar`) sowie als vertikal gestapelte Micro-Badges (`.gm-gap-cue-above`) über Fließtext-Lücken.
- **Klick-transparente Floating XP Badges (`.gm-floating-xp`)**:
  - `-5 XP` (Tipp) und `+10 XP` (Gelöst) Badges animieren per `@keyframes gmFloatUpFade` sanft nach oben weg und entfernen sich selbst aus dem DOM (`pointer-events: none`), ohne Textfluss oder Klickbereiche zu blockieren.
- **Zentrierte Startscreens**:
  - Moderne, zentrierte Themen-Startansicht mit klarer Typografie, kompaktem Grammatik-Regel-Grid und übersichtlicher Auswahl der Übungseinheiten ohne verlorene Buttons.
- **Mobile-First & Scrollfreies `100dvh`-Layout**:
  - Die Trainer-Ansicht (`exercise.html`) arbeitet strikt innerhalb von `100dvh` (`overflow: hidden` auf der App-Shell, internes Auto-Focus-Scrolling für aktive Lücken).
  - Die Eingabezeile (`.gm-input-dock`) ist mobil bündig am unteren Bildschirmrand fixiert (`env(safe-area-inset-bottom)`) und nutzt `autocorrect="off"`, `autocapitalize="off"`, `spellcheck="false"` sowie `font-size: 16px` zur Verhinderung des automatischen iOS-Safari-Zooms.
