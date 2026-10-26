/**
 * ==========================================================================
 * GRAMMAR MASTERY v2.0 - CORE TRAINER ENGINE (/modules/engine.js)
 * ==========================================================================
 * Dynamisches Laden des gewählten Themas via fetch(), Rendern des zentrierten
 * Startscreens sowie der beiden Übungsmodi:
 * - 'single_sentence' (Fokussierte Einzelsatz-Ansicht)
 * - 'cloze_text' (Zusammenhängender 100dvh Fließtext-Lückentext)
 * ==========================================================================
 */

import { Gamification } from './gamification.js';
import { UI } from './ui.js';

const DEFAULT_TOPIC_ID = 'klasse5-present';

export class GrammarEngine {
  constructor() {
    this.topicId = DEFAULT_TOPIC_ID;
    this.topicData = null;
    this.activeExerciseIndex = 0;
    this.activeExercise = null;

    /**
     * Flache Liste aller Lücken der aktuellen Übung:
     * [{ flatIndex, sentenceIndex, sentenceId, gapIndexInSentence, gapData, value, solved, attempts, hintStep }]
     */
    this.gapList = [];
    this.activeGapFlatIndex = 0;
    this.awaitingNextStep = false;
    this.unbindKeyboard = null;
  }

  /**
   * Initialisiert die Engine anhand der URL-Parameter (?topic=...&ex=...).
   */
  async init() {
    const params = new URLSearchParams(window.location.search);
    this.topicId = (params.get('topic') || DEFAULT_TOPIC_ID).trim();
    const requestedExId = params.get('ex');

    this.bindStaticControls();
    this.syncHeaderStats(Gamification.getStats());

    Gamification.subscribe((stats, detail) => {
      this.syncHeaderStats(stats);
      if (detail && detail.type === 'badge_unlocked' && detail.badge) {
        UI.showBadgeToast(detail.badge);
      }
    });

    await this.loadTopic(this.topicId, requestedExId);
  }

  /**
   * Bindet Header-, Dock- und Tastatur-Events.
   */
  bindStaticControls() {
    const dockInput = document.getElementById('gm-dock-input');
    const hintBtn = document.getElementById('gm-dock-hint-btn');
    const submitBtn = document.getElementById('gm-dock-submit-btn');
    const rulesToggleBtn = document.getElementById('gm-header-rules-btn');
    const backToStartBtn = document.getElementById('gm-stage-back-btn');
    const muteBtn = document.getElementById('gm-header-mute-btn');

    if (dockInput) {
      dockInput.addEventListener('input', (e) => {
        const currentGap = this.gapList[this.activeGapFlatIndex];
        if (!currentGap || currentGap.solved) return;

        currentGap.value = e.target.value;
        dockInput.classList.remove('is-incorrect');

        const slotEl = this.getGapSlotElement(this.activeGapFlatIndex);
        UI.syncGapSlotDOM({
          gapSlotEl: slotEl,
          value: currentGap.value,
          prompt: currentGap.gapData.prompt || currentGap.gapData.gap,
          state: currentGap.hintStep > 0 ? 'hinted' : 'active'
        });
      });
    }

    if (hintBtn) {
      hintBtn.addEventListener('click', () => {
        this.triggerHint();
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        this.handlePrimaryAction();
      });
    }

    if (rulesToggleBtn) {
      rulesToggleBtn.addEventListener('click', () => {
        this.toggleRulesModal();
      });
    }

    if (backToStartBtn) {
      backToStartBtn.addEventListener('click', () => {
        this.showStartScreen();
      });
    }

    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        Gamification.toggleMute();
      });
    }

    if (this.unbindKeyboard) this.unbindKeyboard();
    this.unbindKeyboard = UI.bindKeyboardController({
      onEnter: () => this.handlePrimaryAction(),
      onTabGap: (dir) => this.cycleGap(dir),
      onTriggerHint: () => this.triggerHint(),
      onEscape: () => this.closeRulesModal()
    });
  }

  /**
   * Synchronisiert die Header-Anzeige (XP, Streak, Level, Audio-Status).
   */
  syncHeaderStats(stats) {
    const streakEl = document.getElementById('gm-stat-streak');
    const xpEl = document.getElementById('gm-stat-xp');
    const levelEl = document.getElementById('gm-stat-level');
    const muteBtn = document.getElementById('gm-header-mute-btn');

    if (streakEl) streakEl.textContent = String(stats.streak);
    if (xpEl) xpEl.textContent = String(stats.xp);
    if (levelEl) levelEl.textContent = `Lvl ${stats.level}`;
    if (muteBtn) {
      muteBtn.textContent = stats.muted ? '🔇' : '🔊';
      muteBtn.title = stats.muted ? 'Ton einschalten' : 'Ton stummschalten';
    }
  }

  /**
   * Normalisiert unterschiedliche JSON-Schema-Varianten (sentences vs. items,
   * cloze text/gaps vs. sentences, rules.sections vs. rules.examples), damit alle
   * migrierten Themen und Challenge-JSONs konsistent gerendert werden.
   */
  normalizeTopicData(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    const data = { ...raw };

    data.legacyMasteryKey = data.legacyMasteryKey || data.legacyMasteredKey || `grammar_${data.id}_mastered`;
    data.legacyStateKey = data.legacyStateKey || data.legacyStorageKey || `grammar_${data.id}_state`;

    // Rules normalisieren
    const rules = data.rules ? { ...data.rules } : { summary: '', sections: [] };
    if (!Array.isArray(rules.sections) || rules.sections.length === 0) {
      rules.sections = [
        {
          title: rules.title || `${data.title} – Regeln & Struktur`,
          formula: rules.formula || rules.summary || '',
          signalWords: Array.isArray(rules.signalWords) ? rules.signalWords : [],
          examples: Array.isArray(rules.examples) ? rules.examples : []
        }
      ];
    }
    data.rules = rules;

    // Exercises normalisieren
    data.exercises = (data.exercises || []).map((ex, exIdx) => {
      const normEx = { ...ex };
      if (!normEx.id) normEx.id = `ex${exIdx + 1}`;

      let rawSentences = normEx.sentences || normEx.items || [];

      // Falls cloze_text mit Top-Level text + gaps vorliegt:
      if ((!rawSentences || rawSentences.length === 0) && normEx.text && Array.isArray(normEx.gaps)) {
        rawSentences = [
          {
            id: `${normEx.id}_p1`,
            text: normEx.text,
            gaps: normEx.gaps
          }
        ];
      }

      normEx.sentences = rawSentences.map((s, sIdx) => {
        const textVal = s.text || s.sentence || '';
        const gaps = (s.gaps || []).map((g, gIdx) => {
          const promptVal = g.prompt || g.gap || g.baseWord || g.stem || '';
          const rawSols =
            g.solutions ||
            g.acceptedAnswers ||
            g.correct ||
            (g.answer ? [g.answer] : g.solution ? [g.solution] : []);
          const cleanSols = (Array.isArray(rawSols) ? rawSols : [String(rawSols)])
            .map((x) => String(x || '').trim())
            .filter(Boolean);
          return {
            ...g,
            id: g.id || `g${gIdx + 1}`,
            gap: g.gap || promptVal,
            prompt: promptVal,
            grammarHint: g.grammarHint || g.hint || '',
            hints: Array.isArray(g.hints)
              ? g.hints
              : g.hint
              ? [g.hint]
              : [],
            answer: cleanSols[0] || '',
            acceptedAnswers: cleanSols,
            solutions: cleanSols,
            explanation: g.explanation || g.fb || ''
          };
        });
        return {
          ...s,
          id: s.id || `s${sIdx + 1}`,
          text: textVal,
          sentence: textVal,
          gaps
        };
      });

      return normEx;
    });

    return data;
  }

  /**
   * Lädt die Themen-JSON-Datei aus /data/topics/<topicId>.json.
   * Falls ein Thema noch nicht als JSON vorliegt, wird der Katalog geprüft.
   */
  async loadTopic(topicId, requestedExId = null) {
    const loadingEl = document.getElementById('gm-loading-state');
    if (loadingEl) loadingEl.hidden = false;

    try {
      let rawData = null;
      try {
        const response = await fetch(`data/topics/${encodeURIComponent(topicId)}.json`, {
          cache: 'no-cache'
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        rawData = await response.json();
      } catch (fetchErr) {
        if (typeof window !== 'undefined' && window.GM_TOPICS && window.GM_TOPICS[topicId]) {
          rawData = window.GM_TOPICS[topicId];
        } else {
          throw fetchErr;
        }
      }

      this.topicData = this.normalizeTopicData(rawData);
      document.title = `${this.topicData.title} · Klasse ${this.topicData.grade} | Grammar Mastery`;

      // Setze Akzentfarbe auf Body für konsistentes Theming
      document.body.dataset.accent = this.topicData.accentColor || 'blue';

      const headerTitle = document.getElementById('gm-header-topic-title');
      const headerGrade = document.getElementById('gm-header-grade-pill');
      if (headerTitle) headerTitle.textContent = this.topicData.title;
      if (headerGrade) headerGrade.textContent = `Klasse ${this.topicData.grade}`;

      if (loadingEl) loadingEl.hidden = true;

      if (requestedExId) {
        const idx = this.topicData.exercises.findIndex((ex) => ex.id === requestedExId);
        if (idx !== -1) {
          this.startExercise(idx);
          return;
        }
      }

      this.showStartScreen();
    } catch (err) {
      if (loadingEl) loadingEl.hidden = true;
      await this.renderFallbackOrError(topicId);
    }
  }

  /**
   * Falls ein älteres Thema noch in Schritt 2 auf JSON migriert wird,
   * prüfe /data/topics-catalog.json und biete eine saubere Brücke an.
   */
  async renderFallbackOrError(topicId) {
    const startView = document.getElementById('gm-start-screen');
    const stageView = document.getElementById('gm-trainer-stage');
    const dock = document.getElementById('gm-input-dock');

    if (stageView) stageView.hidden = true;
    if (dock) dock.hidden = true;
    if (!startView) return;
    startView.hidden = false;

    let catalogItem = null;
    try {
      const catRes = await fetch('data/topics-catalog.json');
      if (catRes.ok) {
        const catData = await catRes.json();
        catalogItem = (catData.topics || []).find((t) => t.id === topicId);
      }
    } catch {
      // Ignorieren
    }

    if (catalogItem && catalogItem.legacyUrl) {
      startView.innerHTML = `
        <div class="gm-start-card">
          <div class="gm-start-eyebrow">KLASSE ${UI.escapeHtml(catalogItem.grade)} · ${UI.escapeHtml(catalogItem.category)}</div>
          <div class="gm-start-icon">${catalogItem.icon || '📘'}</div>
          <h1 class="gm-start-title">${UI.escapeHtml(catalogItem.title)}</h1>
          <p class="gm-start-desc">${UI.escapeHtml(catalogItem.description)}</p>
          <div class="gm-rule-warning">
            ⚡ Dieses Modul nutzt aktuell noch die klassische Ansicht und wird im nächsten Content-Rollout in die JSON-Engine überführt.
          </div>
          <div class="gm-start-cta-row">
            <a href="${UI.escapeHtml(catalogItem.legacyUrl)}" class="gm-btn-primary">
              Klassisches Training öffnen →
            </a>
            <a href="index.html" class="gm-btn-secondary">
              Zurück zum Lern-Hub
            </a>
          </div>
        </div>
      `;
    } else {
      startView.innerHTML = `
        <div class="gm-start-card">
          <div class="gm-start-eyebrow">THEMA NICHT GEFUNDEN</div>
          <div class="gm-start-icon">🧭</div>
          <h1 class="gm-start-title">Datensatz "${UI.escapeHtml(topicId)}" nicht verfügbar</h1>
          <p class="gm-start-desc">
            Wähle ein verfügbares Übungsthema auf der Startseite oder starte direkt mit unseren empfohlenen Themen.
          </p>
          <div class="gm-start-cta-row">
            <a href="exercise.html?topic=klasse5-present" class="gm-btn-primary">
              Klasse 5: Present Tenses starten
            </a>
            <a href="exercise.html?topic=klasse7-if1" class="gm-btn-secondary">
              Klasse 7: If-Clauses 0 & 1 starten
            </a>
            <a href="index.html" class="gm-btn-secondary">
              Zum Lern-Hub
            </a>
          </div>
        </div>
      `;
    }
  }

  /**
   * Rendert den zentrierten, modernen Startscreen des geladenen Themas.
   */
  showStartScreen() {
    UI.hideFeedbackDrawer();
    const startView = document.getElementById('gm-start-screen');
    const stageView = document.getElementById('gm-trainer-stage');
    const dock = document.getElementById('gm-input-dock');

    if (stageView) stageView.hidden = true;
    if (dock) dock.hidden = true;
    if (!startView || !this.topicData) return;
    startView.hidden = false;

    const progress = Gamification.getTopicProgress(
      this.topicData.id,
      this.topicData.legacyMasteryKey
    );
    const solvedSet = new Set(progress.solvedExercises || []);
    const exercises = this.topicData.exercises || [];

    // Bestimme die nächste noch offene Übung für den Haupt-CTA
    let nextExIndex = exercises.findIndex((ex) => !solvedSet.has(ex.id));
    if (nextExIndex === -1) nextExIndex = 0;

    const rules = this.topicData.rules || { summary: '', sections: [] };

    const rulesHtml = (rules.sections || [])
      .map(
        (sec) => `
        <div class="gm-rule-box">
          <h3 class="gm-rule-box-title">${UI.escapeHtml(sec.title)}</h3>
          <div class="gm-rule-formula">${UI.escapeHtml(sec.formula)}</div>
          ${
            sec.signalWords && sec.signalWords.length
              ? `<div class="gm-signal-pills">
                   ${sec.signalWords
                     .map((w) => `<span class="gm-signal-pill">${UI.escapeHtml(w)}</span>`)
                     .join('')}
                 </div>`
              : ''
          }
          ${
            sec.examples && sec.examples.length
              ? `<ul class="gm-rule-examples">
                   ${sec.examples.map((ex) => `<li>${UI.escapeHtml(ex)}</li>`).join('')}
                 </ul>`
              : ''
          }
        </div>
      `
      )
      .join('');

    const exercisesHtml = exercises
      .map((ex, idx) => {
        const isDone = solvedSet.has(ex.id);
        const totalGaps = (ex.sentences || []).reduce(
          (acc, s) => acc + (s.gaps ? s.gaps.length : 0),
          0
        );
        const modeLabel =
          ex.type === 'cloze_text' ? '📖 Fließtext-Lückentext' : '🎯 Einzelsätze';

        return `
          <button
            type="button"
            class="gm-ex-select-card ${isDone ? 'is-solved' : ''}"
            data-ex-index="${idx}"
          >
            <div class="gm-ex-select-left">
              <span class="gm-ex-num-badge">${isDone ? '✓' : idx + 1}</span>
              <div class="gm-ex-select-meta">
                <div class="gm-ex-select-title">${UI.escapeHtml(ex.title)}</div>
                <div class="gm-ex-select-sub">
                  <span>${modeLabel}</span>
                  <span>•</span>
                  <span>${totalGaps} Lücken</span>
                </div>
              </div>
            </div>
            <div class="gm-ex-select-right">
              <span class="gm-ex-status-pill ${isDone ? 'is-done' : ''}">
                ${isDone ? 'Gelöst ★' : 'Starten →'}
              </span>
            </div>
          </button>
        `;
      })
      .join('');

    startView.innerHTML = `
      <div class="gm-start-card">
        <div class="gm-start-header">
          <div class="gm-start-eyebrow">
            KLASSE ${UI.escapeHtml(this.topicData.grade)} · ${UI.escapeHtml(
              this.topicData.category || 'GRAMMAR MASTERY'
            )}
          </div>
          <div class="gm-start-icon">${this.topicData.icon || '✨'}</div>
          <h1 class="gm-start-title">${UI.escapeHtml(this.topicData.title)}</h1>
          <p class="gm-start-desc">${UI.escapeHtml(this.topicData.description)}</p>

          <div class="gm-start-cta-row">
            <button type="button" class="gm-btn-primary gm-btn-lg" id="gm-start-primary-btn">
              <span>${
                solvedSet.size > 0 && solvedSet.size < exercises.length
                  ? `Weiter mit Übung ${nextExIndex + 1}`
                  : 'Jetzt Training starten'
              }</span>
              <span aria-hidden="true">→</span>
            </button>
            <a href="index.html" class="gm-btn-secondary">
              ← Alle Themen
            </a>
          </div>
        </div>

        ${
          rules.warning
            ? `<div class="gm-rule-warning">${UI.escapeHtml(rules.warning)}</div>`
            : ''
        }

        <div class="gm-rules-grid">
          ${rulesHtml}
        </div>

        <div class="gm-ex-list-section">
          <div class="gm-ex-list-header">
            <h2>Übungseinheiten (${solvedSet.size}/${exercises.length} gelöst)</h2>
            ${
              progress.mastered
                ? `<span class="gm-mastered-pill">🏆 Topic Mastered</span>`
                : ''
            }
          </div>
          <div class="gm-ex-select-grid">
            ${exercisesHtml}
          </div>
        </div>
      </div>
    `;

    const primaryBtn = startView.querySelector('#gm-start-primary-btn');
    if (primaryBtn) {
      primaryBtn.onclick = () => this.startExercise(nextExIndex);
    }

    startView.querySelectorAll('.gm-ex-select-card').forEach((card) => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.exIndex || '0', 10);
        this.startExercise(idx);
      });
    });
  }

  /**
   * Startet eine spezifische Übungseinheit (Einzelsätze oder Lückentext).
   * @param {number} exerciseIndex
   */
  startExercise(exerciseIndex) {
    if (!this.topicData || !this.topicData.exercises[exerciseIndex]) return;

    this.activeExerciseIndex = exerciseIndex;
    this.activeExercise = this.topicData.exercises[exerciseIndex];
    this.awaitingNextStep = false;
    UI.hideFeedbackDrawer();

    // Erzeuge flache Lücken-Registry für nahtlose Navigation
    this.gapList = [];
    (this.activeExercise.sentences || []).forEach((sentence, sIdx) => {
      (sentence.gaps || []).forEach((gap, gIdx) => {
        this.gapList.push({
          flatIndex: this.gapList.length,
          sentenceIndex: sIdx,
          sentenceId: sentence.id,
          sentenceText: sentence.text,
          gapIndexInSentence: gIdx,
          gapData: gap,
          value: '',
          solved: false,
          attempts: 0,
          hintStep: 0
        });
      });
    });

    this.activeGapFlatIndex = 0;

    // Umschalten auf 100dvh Trainer-Bühne
    const startView = document.getElementById('gm-start-screen');
    const stageView = document.getElementById('gm-trainer-stage');
    const dock = document.getElementById('gm-input-dock');

    if (startView) startView.hidden = true;
    if (stageView) stageView.hidden = false;
    if (dock) dock.hidden = false;

    this.renderStageHeader();
    this.renderStageContent();
    this.activateGap(0, true);
  }

  /**
   * Aktualisiert die Kopfzeile der aktiven Übung (Titel, Modus, Fortschrittsbalken).
   */
  renderStageHeader() {
    const titleEl = document.getElementById('gm-stage-ex-title');
    const modeBadgeEl = document.getElementById('gm-stage-mode-badge');
    const instructionEl = document.getElementById('gm-stage-instruction');

    if (titleEl && this.activeExercise) {
      titleEl.textContent = `${this.activeExerciseIndex + 1}. ${this.activeExercise.title}`;
    }

    if (modeBadgeEl && this.activeExercise) {
      modeBadgeEl.textContent =
        this.activeExercise.type === 'cloze_text' ? '📖 Lückentext' : '🎯 Einzelsätze';
    }

    if (instructionEl && this.activeExercise) {
      instructionEl.textContent = this.activeExercise.instruction || '';
    }

    this.updateProgressBar();
  }

  /**
   * Berechnet und aktualisiert den Fortschrittsbalken der aktuellen Übung.
   */
  updateProgressBar() {
    const total = this.gapList.length || 1;
    const solvedCount = this.gapList.filter((g) => g.solved).length;
    const percent = Math.round((solvedCount / total) * 100);

    const fillEl = document.getElementById('gm-stage-progress-fill');
    const textEl = document.getElementById('gm-stage-progress-text');

    if (fillEl) fillEl.style.width = `${percent}%`;
    if (textEl) textEl.textContent = `${solvedCount}/${total} (${percent}%)`;
  }

  /**
   * Rendert den Hauptbereich je nach Übungstyp ('single_sentence' vs. 'cloze_text').
   */
  renderStageContent() {
    const container = document.getElementById('gm-stage-workspace');
    if (!container || !this.activeExercise) return;

    if (this.activeExercise.type === 'cloze_text') {
      this.renderClozeWorkspace(container);
    } else {
      this.renderSingleSentenceWorkspace(container);
    }
  }

  /**
   * MODUS 1: Einzelsätze ('single_sentence')
   * Zeigt den aktuellen Satz groß und zentriert mit einem festen, nicht-überlappenden
   * Hinweis-Banner oberhalb des Satzes sowie Fortschritts-Punkten.
   */
  renderSingleSentenceWorkspace(container) {
    const activeGap = this.gapList[this.activeGapFlatIndex];
    if (!activeGap) return;

    const currentSentenceIdx = activeGap.sentenceIndex;
    const sentences = this.activeExercise.sentences || [];
    const sentenceObj = sentences[currentSentenceIdx];

    // Stepper-Dots für alle Lücken
    const dotsHtml = this.gapList
      .map((g, idx) => {
        const classes = [
          'gm-step-dot',
          idx === this.activeGapFlatIndex ? 'is-current' : '',
          g.solved ? 'is-solved' : ''
        ]
          .filter(Boolean)
          .join(' ');
        return `<button type="button" class="${classes}" data-gap-flat="${idx}" aria-label="Satz ${
          idx + 1
        }">${idx + 1}</button>`;
      })
      .join('');

    // Satz mit Lücken-Slots aufbauen
    const sentenceHtml = this.buildSentenceMarkup(sentenceObj, currentSentenceIdx);

    const cueText = activeGap.gapData.prompt || activeGap.gapData.gap || '';
    const grammarHint = activeGap.gapData.grammarHint || 'Setze die passende Form ein';

    container.innerHTML = `
      <div class="gm-single-sentence-layout">
        <div class="gm-step-dots-bar" role="tablist" aria-label="Satz-Navigation">
          ${dotsHtml}
        </div>

        <article class="gm-sentence-focus-card">
          <!-- Fester, niemals überlappender Hinweis-Header oberhalb des Satzes -->
          <div class="gm-non-overlapping-hint-bar">
            <span class="gm-infinitive-pill">
              <span class="gm-pill-label">Infinitiv / Vorgabe:</span>
              <strong>(${UI.escapeHtml(cueText)})</strong>
            </span>
            <span class="gm-grammar-pill">
              🧭 ${UI.escapeHtml(grammarHint)}
            </span>
          </div>

          <div class="gm-sentence-display">
            ${sentenceHtml}
          </div>
        </article>
      </div>
    `;

    this.bindGapSlotClicks(container);

    container.querySelectorAll('.gm-step-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        const idx = parseInt(dot.dataset.gapFlat || '0', 10);
        this.activateGap(idx, true);
      });
    });
  }

  /**
   * MODUS 2: Zusammenhängender Lückentext ('cloze_text')
   * Scrollfreies 100dvh-Layout mit nicht-überlappenden Mini-Prompts direkt oberhalb jeder Lücke.
   */
  renderClozeWorkspace(container) {
    const sentences = this.activeExercise.sentences || [];
    const paragraphsHtml = sentences
      .map((sentenceObj, sIdx) => {
        return `<span class="gm-cloze-sentence">${this.buildSentenceMarkup(
          sentenceObj,
          sIdx,
          true
        )}</span>`;
      })
      .join(' ');

    container.innerHTML = `
      <div class="gm-cloze-card">
        <div class="gm-cloze-passage">
          ${paragraphsHtml}
        </div>
      </div>
    `;

    this.bindGapSlotClicks(container);
  }

  /**
   * Ersetzt '{{gap}}' (oder '{{0}}', '{{1}}') im Satz-String durch interaktive,
   * nicht-überlappende Lücken-Slots.
   */
  buildSentenceMarkup(sentenceObj, sentenceIndex, isClozeMode = false) {
    let rawText = sentenceObj.text || '';
    const gapsInSentence = this.gapList.filter((g) => g.sentenceIndex === sentenceIndex);

    let localGapPointer = 0;

    // Unterstütze sowohl {{gap}} als auch {{0}}, {{1}}
    const replaced = rawText.replace(/\{\{(?:gap|\d+)\}\}/g, () => {
      const gapItem = gapsInSentence[localGapPointer];
      localGapPointer += 1;
      if (!gapItem) return '___';

      const cue = gapItem.gapData.prompt || gapItem.gapData.gap || '';
      const isCurrent = gapItem.flatIndex === this.activeGapFlatIndex;
      const stateClass = gapItem.solved
        ? 'is-correct'
        : isCurrent
        ? 'is-active'
        : gapItem.hintStep > 0
        ? 'is-hinted'
        : '';

      const displayValue =
        gapItem.value.trim().length > 0 ? gapItem.value : `(${cue})`;
      const hasValueClass = gapItem.value.trim().length > 0 ? 'has-value' : '';

      return `<span class="gm-inline-gap-group ${isClozeMode ? 'is-cloze' : 'is-single'}">
        <span class="gm-gap-cue-above" aria-hidden="true">${UI.escapeHtml(cue)}</span>
        <button
          type="button"
          class="gm-gap-slot ${stateClass} ${hasValueClass}"
          id="gm-gap-slot-${gapItem.flatIndex}"
          data-gap-flat="${gapItem.flatIndex}"
          aria-label="Lücke ${gapItem.flatIndex + 1}: Vorgabe ${UI.escapeHtml(cue)}"
        >
          <span class="gm-gap-num">${gapItem.flatIndex + 1}</span>
          <span class="gm-gap-value">${UI.escapeHtml(displayValue)}</span>
        </button>
      </span>`;
    });

    return replaced;
  }

  /**
   * Verbindet Klicks auf Lücken-Buttons im Text mit activateGap().
   */
  bindGapSlotClicks(container) {
    container.querySelectorAll('.gm-gap-slot').forEach((btn) => {
      btn.addEventListener('click', () => {
        const flatIdx = parseInt(btn.dataset.gapFlat || '0', 10);
        this.activateGap(flatIdx, true);
      });
    });
  }

  /**
   * Liefert das DOM-Element eines Lücken-Slots anhand seines Flat-Index.
   */
  getGapSlotElement(flatIndex) {
    return document.getElementById(`gm-gap-slot-${flatIndex}`);
  }

  /**
   * Aktiviert eine Lücke, synchronisiert die untere Eingabezeile und hebt die Lücke hervor.
   */
  activateGap(flatIndex, autoFocus = true) {
    if (flatIndex < 0 || flatIndex >= this.gapList.length) return;

    const prevIndex = this.activeGapFlatIndex;
    this.activeGapFlatIndex = flatIndex;
    this.awaitingNextStep = false;

    const targetGap = this.gapList[flatIndex];

    if (this.activeExercise && this.activeExercise.type === 'single_sentence') {
      const container = document.getElementById('gm-stage-workspace');
      if (container) {
        this.renderSingleSentenceWorkspace(container);
      }
    } else {
      // Im Cloze-Modus nur aktive Klassen umschalten, ohne das DOM neu zu bauen
      const prevSlot = this.getGapSlotElement(prevIndex);
      if (prevSlot) prevSlot.classList.remove('is-active');

      const nextSlot = this.getGapSlotElement(flatIndex);
      if (nextSlot) {
        nextSlot.classList.add('is-active');
        UI.ensureGapVisible(nextSlot);
      }
    }

    UI.updateInputDock({
      gapData: targetGap.gapData,
      currentValue: targetGap.value,
      isSolved: targetGap.solved,
      hintUsed: targetGap.hintStep > 0,
      gapIndex: flatIndex,
      totalGaps: this.gapList.length,
      autoFocus
    });

    if (targetGap.solved) {
      UI.showFeedbackDrawer({
        type: 'correct',
        title: 'Bereits gelöst ✓',
        message: targetGap.gapData.explanation || '',
        solution: targetGap.gapData.solutions[0],
        actionLabel: 'Nächste Lücke',
        onAction: () => this.advanceToNextUnsolvedGap()
      });
    } else {
      UI.hideFeedbackDrawer();
    }
  }

  /**
   * Wechselt per Tab / Shift+Tab zur nächsten bzw. vorherigen Lücke.
   */
  cycleGap(direction = 1) {
    if (!this.gapList.length) return;
    const nextIdx =
      (this.activeGapFlatIndex + direction + this.gapList.length) % this.gapList.length;
    this.activateGap(nextIdx, true);
  }

  /**
   * Haupt-Aktion bei Klick auf "Prüfen ↵" oder Drücken der Enter-Taste.
   */
  handlePrimaryAction() {
    const currentGap = this.gapList[this.activeGapFlatIndex];
    if (!currentGap) return;

    // Wenn bereits gelöst oder nach korrekter Antwort auf "Weiter" gewartet wird:
    if (currentGap.solved || this.awaitingNextStep) {
      this.advanceToNextUnsolvedGap();
      return;
    }

    this.evaluateActiveGap();
  }

  /**
   * Normalisiert Nutzereingaben und Lösungen für fairen, case-insensitiven Vergleich
   * (trimmt Whitespaces, vereinheitlicht Apostrophe, entfernt optionale Ellipsen/Satzpunkte).
   */
  normalizeAnswer(str) {
    return String(str || '')
      .replace(/[’‘`´]/g, "'")
      .replace(/^\.{2,}\s*/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * Erzeugt alle akzeptierten Vergleichsvarianten einer Musterlösung
   * (inkl. Variante ohne Klammerzusatz und ohne abschließenden Punkt).
   */
  expandNormalizedVariants(solutionStr) {
    const base = this.normalizeAnswer(solutionStr);
    const variants = new Set([base]);
    // Ohne abschließenden Punkt/Ausrufezeichen
    variants.add(base.replace(/[.!]+$/, '').trim());
    // Ohne Klammerzusatz wie "subject (wer?)" -> "subject"
    const withoutParens = base.replace(/\s*\([^)]*\)/g, '').trim();
    if (withoutParens) {
      variants.add(withoutParens);
      variants.add(withoutParens.replace(/[.!]+$/, '').trim());
    }
    return Array.from(variants).filter(Boolean);
  }

  /**
   * Prüft die Eingabe der aktiven Lücke gegen alle gültigen Lösungen (case-insensitive).
   */
  evaluateActiveGap() {
    const currentGap = this.gapList[this.activeGapFlatIndex];
    const dockInput = document.getElementById('gm-dock-input');
    if (!currentGap || !dockInput) return;

    const rawInput = dockInput.value;
    currentGap.value = rawInput;
    const normalizedUser = this.normalizeAnswer(rawInput);
    const normalizedUserNoDot = normalizedUser.replace(/[.!]+$/, '').trim();

    if (!normalizedUser) {
      dockInput.focus();
      return;
    }

    const rawSolutions =
      currentGap.gapData.solutions || currentGap.gapData.acceptedAnswers || [];
    let matchedIdx = -1;
    for (let i = 0; i < rawSolutions.length; i += 1) {
      const variants = this.expandNormalizedVariants(rawSolutions[i]);
      if (variants.includes(normalizedUser) || variants.includes(normalizedUserNoDot)) {
        matchedIdx = i;
        break;
      }
    }
    const isCorrect = matchedIdx !== -1;
    const slotEl = this.getGapSlotElement(this.activeGapFlatIndex);

    if (isCorrect) {
      currentGap.solved = true;
      this.awaitingNextStep = true;

      // Kanonische Schreibweise übernehmen, falls Groß-/Kleinschreibung abweicht
      const canonical = rawSolutions[matchedIdx] || rawSolutions[0];
      currentGap.value = canonical;

      UI.syncGapSlotDOM({
        gapSlotEl: slotEl,
        value: canonical,
        prompt: currentGap.gapData.prompt || currentGap.gapData.gap,
        state: 'correct'
      });

      UI.updateInputDock({
        gapData: currentGap.gapData,
        currentValue: canonical,
        isSolved: true,
        hintUsed: currentGap.hintStep > 0,
        gapIndex: this.activeGapFlatIndex,
        totalGaps: this.gapList.length,
        autoFocus: false
      });

      Gamification.playSound('correct');
      Gamification.awardXp(10, 'gap_solved');
      UI.spawnFloatingXp(slotEl || dockInput, 10);

      this.updateProgressBar();

      const allDone = this.gapList.every((g) => g.solved);

      UI.showFeedbackDrawer({
        type: 'correct',
        title: 'Richtig! +10 XP',
        message: currentGap.gapData.explanation || 'Perfekt gelöst!',
        actionLabel: allDone ? 'Übung abschließen' : 'Weiter',
        onAction: () => this.advanceToNextUnsolvedGap()
      });
    } else {
      currentGap.attempts += 1;
      Gamification.playSound('incorrect');

      dockInput.classList.remove('is-incorrect');
      // Force reflow für erneute Shake-Animation
      void dockInput.offsetWidth;
      dockInput.classList.add('is-incorrect');

      UI.syncGapSlotDOM({
        gapSlotEl: slotEl,
        value: rawInput,
        prompt: currentGap.gapData.prompt || currentGap.gapData.gap,
        state: 'incorrect'
      });

      const showSolutionNow = currentGap.attempts >= 2;
      const hintFallback =
        (currentGap.gapData.hints && currentGap.gapData.hints[0]) ||
        currentGap.gapData.explanation ||
        'Prüfe Zeitform und Person noch einmal genau.';

      UI.showFeedbackDrawer({
        type: 'incorrect',
        title:
          currentGap.attempts === 1
            ? 'Noch nicht ganz – versuch es nochmal!'
            : 'Hinweis & Erklärung',
        message: showSolutionNow
          ? currentGap.gapData.explanation || hintFallback
          : hintFallback,
        solution: showSolutionNow ? currentGap.gapData.solutions[0] : ''
      });

      dockInput.focus();
      dockInput.select();
    }
  }

  /**
   * Springt zur nächsten noch ungelösten Lücke oder schließt die Übung ab,
   * wenn alle Lücken gelöst wurden.
   */
  advanceToNextUnsolvedGap() {
    const allSolved = this.gapList.every((g) => g.solved);
    if (allSolved) {
      this.completeCurrentExercise();
      return;
    }

    // Suche nächste ungelöste Lücke ab aktueller Position
    const total = this.gapList.length;
    for (let offset = 1; offset <= total; offset++) {
      const candidateIdx = (this.activeGapFlatIndex + offset) % total;
      if (!this.gapList[candidateIdx].solved) {
        this.activateGap(candidateIdx, true);
        return;
      }
    }
  }

  /**
   * Löst einen Tipp (-5 XP) für die aktive Lücke aus:
   * - Animiert das "-5 XP" Badge sanft nach oben weg (ohne Klickbereiche zu blockieren)
   * - Füllt den Anfangsbuchstaben / Wortanfang ein
   * - Zeigt den didaktischen Tipp im Feedback-Drawer
   */
  triggerHint() {
    const currentGap = this.gapList[this.activeGapFlatIndex];
    const hintBtn = document.getElementById('gm-dock-hint-btn');
    const dockInput = document.getElementById('gm-dock-input');
    if (!currentGap || currentGap.solved) return;

    const targetSolution = (currentGap.gapData.solutions || [''])[0];
    if (!targetSolution) return;

    // Beim ersten Tipp-Klick für diese Lücke -5 XP abziehen & Floating Badge spawnen
    if (currentGap.hintStep === 0) {
      Gamification.deductXp(5, 'hint');
      Gamification.playSound('hint');
      UI.spawnFloatingXp(hintBtn || dockInput, -5, '-5 XP');
    } else {
      Gamification.playSound('hint');
    }

    currentGap.hintStep += 1;

    // Fülle die ersten Zeichen als Starthilfe ein
    const revealChars = Math.min(currentGap.hintStep === 1 ? 1 : 3, targetSolution.length);
    const starterText = targetSolution.slice(0, revealChars);

    if (!currentGap.value || !targetSolution.toLowerCase().startsWith(currentGap.value.toLowerCase())) {
      currentGap.value = starterText;
    }

    const slotEl = this.getGapSlotElement(this.activeGapFlatIndex);
    UI.syncGapSlotDOM({
      gapSlotEl: slotEl,
      value: currentGap.value,
      prompt: currentGap.gapData.prompt || currentGap.gapData.gap,
      state: 'hinted'
    });

    UI.updateInputDock({
      gapData: currentGap.gapData,
      currentValue: currentGap.value,
      isSolved: false,
      hintUsed: true,
      gapIndex: this.activeGapFlatIndex,
      totalGaps: this.gapList.length,
      autoFocus: true
    });

    if (dockInput) {
      dockInput.setSelectionRange(currentGap.value.length, currentGap.value.length);
    }

    const hintsArr = currentGap.gapData.hints || [];
    const hintText =
      hintsArr[Math.min(currentGap.hintStep - 1, hintsArr.length - 1)] ||
      currentGap.gapData.grammarHint ||
      `Die gesuchte Form beginnt mit "${starterText}…"`;

    UI.showFeedbackDrawer({
      type: 'hint',
      title: `💡 Tipp: Beginnt mit "${starterText}…"`,
      message: hintText
    });
  }

  /**
   * Schlusspunkt einer vollständig gelösten Übungseinheit:
   * Vergibt +50 XP Abschluss-Bonus, speichert den Fortschritt und zeigt das Erfolgs-Modal.
   */
  completeCurrentExercise() {
    UI.hideFeedbackDrawer();

    const bonusXp = 50;
    Gamification.awardXp(bonusXp, 'exercise_bonus');
    Gamification.playSound('success');

    const totalExercises = (this.topicData.exercises || []).length;
    const masteryResult = Gamification.markExerciseSolved({
      topicId: this.topicData.id,
      exerciseId: this.activeExercise.id,
      totalExercises,
      legacyStateKey: this.topicData.legacyStateKey,
      legacyMasteryKey: this.topicData.legacyMasteryKey
    });

    const hasNext = this.activeExerciseIndex + 1 < totalExercises;

    UI.showExerciseCompletionModal({
      exerciseTitle: this.activeExercise.title,
      bonusXp,
      hasNextExercise: hasNext,
      topicMastered: masteryResult.allSolved,
      topicTitle: this.topicData.title,
      onNext: () => this.startExercise(this.activeExerciseIndex + 1),
      onOverview: () => this.showStartScreen()
    });
  }

  /**
   * Öffnet oder schließt das kompakte Grammatik-Regel-Modal während einer laufenden Übung.
   */
  toggleRulesModal() {
    const existing = document.getElementById('gm-rules-modal');
    if (existing) {
      existing.remove();
      return;
    }
    if (!this.topicData || !this.topicData.rules) return;

    const rules = this.topicData.rules;
    const overlay = document.createElement('div');
    overlay.id = 'gm-rules-modal';
    overlay.className = 'gm-modal-overlay';

    const sectionsHtml = (rules.sections || [])
      .map(
        (sec) => `
        <div class="gm-rule-box">
          <h4 class="gm-rule-box-title">${UI.escapeHtml(sec.title)}</h4>
          <div class="gm-rule-formula">${UI.escapeHtml(sec.formula)}</div>
          ${
            sec.examples && sec.examples.length
              ? `<ul class="gm-rule-examples">
                   ${sec.examples.map((ex) => `<li>${UI.escapeHtml(ex)}</li>`).join('')}
                 </ul>`
              : ''
          }
        </div>
      `
      )
      .join('');

    overlay.innerHTML = `
      <div class="gm-modal-card gm-modal-wide">
        <div class="gm-modal-header-row">
          <div>
            <div class="gm-modal-eyebrow">GRAMMAR CHECK</div>
            <h3 class="gm-modal-title">${UI.escapeHtml(this.topicData.title)}</h3>
          </div>
          <button type="button" class="gm-feedback-close-btn" id="gm-rules-close-btn" aria-label="Schließen">✕</button>
        </div>
        <p class="gm-modal-desc">${UI.escapeHtml(rules.summary || '')}</p>
        ${
          rules.warning
            ? `<div class="gm-rule-warning">${UI.escapeHtml(rules.warning)}</div>`
            : ''
        }
        <div class="gm-rules-grid">
          ${sectionsHtml}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const closeBtn = overlay.querySelector('#gm-rules-close-btn');
    if (closeBtn) closeBtn.onclick = () => overlay.remove();
  }

  closeRulesModal() {
    const existing = document.getElementById('gm-rules-modal');
    if (existing) existing.remove();
  }
}

// Auto-Bootstrapping wenn auf exercise.html eingebunden
if (typeof window !== 'undefined') {
  window.__GM_MODULE_BOOTED = true;
}
if (typeof document !== 'undefined') {
  const boot = () => {
    if (document.getElementById('gm-exercise-app') && !window.gmEngineInstance) {
      const engine = new GrammarEngine();
      window.gmEngineInstance = engine;
      engine.init();
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}

export default GrammarEngine;
