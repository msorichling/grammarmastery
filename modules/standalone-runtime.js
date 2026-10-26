// Auto-generated standalone runtime fallback for local file:// protocol
(function () {
  if (window.__GM_MODULE_BOOTED) return;

/**
 * ==========================================================================
 * GRAMMAR MASTERY v2.0 - GAMIFICATION MODULE (/modules/gamification.js)
 * ==========================================================================
 * Kapselt XP, Streaks, Level-Berechnung, Badges, Web-Audio-Synthesizer
 * sowie die DSGVO-konforme Persistenz via localStorage.
 * ==========================================================================
 */

const STORAGE_KEYS = {
  XP: 'gm_global_xp',
  STREAK: 'gm_daily_streak',
  LAST_ACTIVE: 'gm_last_active_date',
  BADGES: 'gm_unlocked_badges',
  TOPIC_PROGRESS: 'gm_topic_progress_v2',
  MUTED: 'gm_audio_muted'
};
const POINTS_PER_LEVEL = 150;
const LEVEL_RANKS = {
  1: { title: 'Tense Novice', icon: '🌱' },
  2: { title: 'Verb Finder', icon: '🔍' },
  3: { title: 'Streak Starter', icon: '🔥' },
  4: { title: 'Sentence Builder', icon: '🏗️' },
  5: { title: 'Grammar Cadet', icon: '🎖️' },
  6: { title: 'Clause Captain', icon: '⚓' },
  7: { title: 'Verb Conjugator', icon: '⚔️' },
  8: { title: 'Syntax Wizard', icon: '🧙‍♂️' },
  9: { title: 'Tense Champion', icon: '🏆' },
  10: { title: 'Grammar Mastery Legend', icon: '👑' }
};
const TROPHY_BADGES = [
  { id: 'xp_100', icon: '🌱', label: 'XP Explorer', desc: 'Sammle 100 XP' },
  { id: 'xp_500', icon: '🎯', label: 'Verb Guru', desc: 'Sammle 500 XP' },
  { id: 'xp_1500', icon: '🧙‍♂️', label: 'Grammar Lord', desc: 'Sammle 1500 XP' },
  { id: 'streak_3', icon: '🔥', label: 'Streak Starter', desc: '3 Tage Serie' },
  { id: 'streak_7', icon: '⚡', label: 'Wochen-Hero', desc: '7 Tage Serie' },
  { id: 'beg_master', icon: '🎓', label: 'First Topic Master', desc: '1 Thema gemeistert' },
  { id: 'int_master', icon: '🎖️', label: 'Multi-Topic Pro', desc: '3 Themen gemeistert' },
  { id: 'exp_master', icon: '👑', label: 'Grammar Legend', desc: '5 Themen gemeistert' }
];

// Internal reactive listeners
const listeners = new Set();
let audioCtx = null;

function safeGetInt(key, fallback = 0) {
  try {
    const val = parseInt(localStorage.getItem(key) || String(fallback), 10);
    return Number.isNaN(val) ? fallback : val;
  } catch {
    return fallback;
  }
}

function safeGetJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn('localStorage write failed:', err);
  }
}

/**
 * Berechnet Level, Rang-Titel und prozentualen Fortschritt im aktuellen Level.
 * @param {number} [customXp]
 */
function getLevelInfo(customXp) {
  const totalXp = typeof customXp === 'number' ? customXp : safeGetInt(STORAGE_KEYS.XP, 0);
  const level = Math.floor(totalXp / POINTS_PER_LEVEL) + 1;
  const clampedLvl = Math.min(Math.max(level, 1), 10);
  const rankObj = LEVEL_RANKS[clampedLvl];
  const xpInCurrentLvl = totalXp % POINTS_PER_LEVEL;
  const progressPercent = Math.min(Math.round((xpInCurrentLvl / POINTS_PER_LEVEL) * 100), 100);

  return {
    level,
    rankTitle: rankObj.title,
    rankIcon: rankObj.icon,
    rankFull: `${rankObj.title} ${rankObj.icon}`,
    xpInCurrentLvl,
    pointsPerLevel: POINTS_PER_LEVEL,
    progressPercent
  };
}

/**
 * Liefert den aktuellen Gamification-Gesamtstatus.
 */
function getStats() {
  const xp = safeGetInt(STORAGE_KEYS.XP, 0);
  const streak = safeGetInt(STORAGE_KEYS.STREAK, 0);
  const lastActive = localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE) || '';
  const unlockedBadges = safeGetJSON(STORAGE_KEYS.BADGES, []);
  const muted = localStorage.getItem(STORAGE_KEYS.MUTED) === 'true';
  const levelInfo = getLevelInfo(xp);

  return {
    xp,
    streak,
    lastActive,
    unlockedBadges,
    muted,
    ...levelInfo
  };
}

/**
 * Benachrichtigt alle registrierten UI-Komponenten über State-Updates.
 */
function emitChange(eventDetail = {}) {
  const stats = getStats();
  listeners.forEach((fn) => {
    try {
      fn(stats, eventDetail);
    } catch (e) {
      console.error('Gamification listener error:', e);
    }
  });
}

/**
 * Registriert einen Callback für State-Änderungen (XP, Streak, Level, Badges).
 * @param {(stats: ReturnType<typeof getStats>, detail: object) => void} callback
 * @returns {() => void} Unsubscribe-Funktion
 */
function subscribe(callback) {
  listeners.add(callback);
  callback(getStats(), { type: 'init' });
  return () => listeners.delete(callback);
}

/**
 * Aktualisiert den täglichen Streak anhand des aktuellen Datums.
 */
function updateStreak() {
  const todayStr = new Date().toISOString().split('T')[0];
  const lastActive = localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE) || '';
  let streak = safeGetInt(STORAGE_KEYS.STREAK, 0);

  if (lastActive === todayStr) {
    return streak;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (lastActive === yesterdayStr) {
    streak += 1;
  } else {
    streak = 1;
  }

  safeSetItem(STORAGE_KEYS.STREAK, String(streak));
  safeSetItem(STORAGE_KEYS.LAST_ACTIVE, todayStr);

  if (streak >= 3) unlockBadge('streak_3');
  if (streak >= 7) unlockBadge('streak_7');

  emitChange({ type: 'streak', streak });
  return streak;
}

/**
 * Schaltet ein Trophy-Badge frei, falls noch nicht vorhanden.
 * @param {string} badgeId
 */
function unlockBadge(badgeId) {
  const unlocked = safeGetJSON(STORAGE_KEYS.BADGES, []);
  if (!unlocked.includes(badgeId)) {
    unlocked.push(badgeId);
    safeSetItem(STORAGE_KEYS.BADGES, JSON.stringify(unlocked));
    const badgeMeta = TROPHY_BADGES.find((b) => b.id === badgeId) || {
      id: badgeId,
      icon: '🏆',
      label: badgeId,
      desc: 'Auszeichnung freigeschaltet!'
    };
    playSound('success');
    emitChange({ type: 'badge_unlocked', badge: badgeMeta });
    return badgeMeta;
  }
  return null;
}

/**
 * Vergibt Erfahrungspunkte (XP), prüft Level-Ups & Meilenstein-Badges.
 * @param {number} points
 * @param {string} [reason]
 */
function awardXp(points, reason = 'solved') {
  if (!points || points <= 0) return getStats();
  const prevXp = safeGetInt(STORAGE_KEYS.XP, 0);
  const prevLevel = getLevelInfo(prevXp).level;

  const nextXp = prevXp + points;
  safeSetItem(STORAGE_KEYS.XP, String(nextXp));

  updateStreak();

  if (nextXp >= 100) unlockBadge('xp_100');
  if (nextXp >= 500) unlockBadge('xp_500');
  if (nextXp >= 1500) unlockBadge('xp_1500');

  const nextLevel = getLevelInfo(nextXp).level;
  const leveledUp = nextLevel > prevLevel;

  emitChange({
    type: 'xp_gain',
    delta: points,
    reason,
    leveledUp,
    newLevel: nextLevel
  });

  return getStats();
}

/**
 * Zieht Erfahrungspunkte ab (z. B. -5 XP für einen Tipp), niemals unter 0 XP.
 * @param {number} points
 * @param {string} [reason]
 */
function deductXp(points, reason = 'hint') {
  if (!points || points <= 0) return getStats();
  const prevXp = safeGetInt(STORAGE_KEYS.XP, 0);
  const nextXp = Math.max(0, prevXp - points);
  safeSetItem(STORAGE_KEYS.XP, String(nextXp));

  emitChange({
    type: 'xp_deduct',
    delta: -points,
    reason
  });

  return getStats();
}

/**
 * Liest den gespeicherten Übungsfortschritt eines Themas aus.
 * Berücksichtigt sowohl das v2-Store-Format als auch Legacy-Keys.
 * @param {string} topicId
 * @param {string} [legacyMasteryKey]
 */
function getTopicProgress(topicId, legacyMasteryKey) {
  const store = safeGetJSON(STORAGE_KEYS.TOPIC_PROGRESS, {});
  const entry = store[topicId] || { solvedExercises: [], mastered: false, updatedAt: null };

  if (legacyMasteryKey && localStorage.getItem(legacyMasteryKey) === 'true') {
    entry.mastered = true;
  }

  return entry;
}

/**
 * Markiert eine Teilübung (z. B. 'ex1') innerhalb eines Themas als gelöst.
 * Wenn alle Übungen des Themas gelöst sind, wird das Thema als 'mastered' markiert.
 * @param {object} params
 * @param {string} params.topicId
 * @param {string} params.exerciseId
 * @param {number} params.totalExercises
 * @param {string} [params.legacyStateKey]
 * @param {string} [params.legacyMasteryKey]
 */
function markExerciseSolved({
  topicId,
  exerciseId,
  totalExercises,
  legacyStateKey,
  legacyMasteryKey
}) {
  const store = safeGetJSON(STORAGE_KEYS.TOPIC_PROGRESS, {});
  const current = store[topicId] || { solvedExercises: [], mastered: false, updatedAt: null };

  const isFirstTimeExercise = !current.solvedExercises.includes(exerciseId);
  if (isFirstTimeExercise) {
    current.solvedExercises.push(exerciseId);
  }

  const allSolved = totalExercises > 0 && current.solvedExercises.length >= totalExercises;
  const newlyMastered = allSolved && !current.mastered;

  if (allSolved) {
    current.mastered = true;
    if (legacyMasteryKey) {
      safeSetItem(legacyMasteryKey, 'true');
    }
  }

  // Legacy state key sync (z.B. grammar_g7_if1_state -> {"1": true})
  if (legacyStateKey) {
    const legacyState = safeGetJSON(legacyStateKey, {});
    const numericIdx = String(exerciseId).replace(/\D/g, '') || exerciseId;
    legacyState[numericIdx] = true;
    safeSetItem(legacyStateKey, JSON.stringify(legacyState));
  }

  current.updatedAt = new Date().toISOString();
  store[topicId] = current;
  safeSetItem(STORAGE_KEYS.TOPIC_PROGRESS, JSON.stringify(store));

  // Prüfe globale Themen-Mastery-Badges
  const masteredCount = Object.values(store).filter((item) => item && item.mastered).length;
  if (masteredCount >= 1) unlockBadge('beg_master');
  if (masteredCount >= 3) unlockBadge('int_master');
  if (masteredCount >= 5) unlockBadge('exp_master');

  emitChange({
    type: 'exercise_completed',
    topicId,
    exerciseId,
    isFirstTimeExercise,
    allSolved,
    newlyMastered
  });

  return {
    isFirstTimeExercise,
    allSolved,
    newlyMastered,
    progress: current
  };
}

/**
 * Schaltet den Audio-Synthesizer stumm oder aktiv.
 */
function toggleMute() {
  const currentlyMuted = localStorage.getItem(STORAGE_KEYS.MUTED) === 'true';
  const nextMuted = !currentlyMuted;
  safeSetItem(STORAGE_KEYS.MUTED, String(nextMuted));
  emitChange({ type: 'mute_change', muted: nextMuted });
  return nextMuted;
}

/**
 * Web-Audio-Synthesizer für unmittelbares akustisches Feedback ohne externe Audiodateien.
 * @param {'correct' | 'incorrect' | 'hint' | 'success'} type
 */
function playSound(type) {
  if (localStorage.getItem(STORAGE_KEYS.MUTED) === 'true') return;

  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'correct') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.11, now + 0.03);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      osc.start(now);
      osc.stop(now + 0.42);
    } else if (type === 'incorrect') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220.0, now); // A3
      osc.frequency.setValueAtTime(196.0, now + 0.1); // G3
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.13, now + 0.03);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'hint') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(698.46, now); // F5
      osc.frequency.setValueAtTime(587.33, now + 0.08); // D5
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.08, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.28);
    } else if (type === 'success') {
      osc.type = 'triangle';
      const freqs = [261.63, 392.0, 523.25, 659.25, 783.99, 1046.5];
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.14, now + 0.04);
      freqs.forEach((f, idx) => {
        osc.frequency.setValueAtTime(f, now + idx * 0.075);
      });
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
      osc.start(now);
      osc.stop(now + 0.75);
    }
  } catch (err) {
    // AudioContext kann vor erster User-Interaktion blockiert sein
  }
}

// Globale Bridge für etwaige Legacy-Seiten
if (typeof window !== 'undefined') {
  window.gmAwardXp = (pts) => awardXp(pts, 'legacy');
  window.gmDeductXp = (pts) => deductXp(pts, 'legacy_hint');
  window.gmTriggerChime = (type) => playSound(type);
}
const Gamification = {
  POINTS_PER_LEVEL,
  LEVEL_RANKS,
  TROPHY_BADGES,
  getStats,
  getLevelInfo,
  awardXp,
  deductXp,
  updateStreak,
  unlockBadge,
  getTopicProgress,
  markExerciseSolved,
  playSound,
  toggleMute,
  subscribe
};


/**
 * ==========================================================================
 * GRAMMAR MASTERY v2.0 - UI & INTERACTION MODULE (/modules/ui.js)
 * ==========================================================================
 * Verantwortlich für:
 * - Floating XP Badges (-5 XP / +10 XP) mit sanfter Upward-Fade-Animation
 * - Lücken-Synchronisation zwischen Hauptbühne (Satz / Lückentext) & Bottom-Input-Dock
 * - Didaktischen Feedback-Drawer (Erklärungen, Tipps, Fehleranalyse)
 * - Tastatur-Steuerung (Enter-State-Machine, Tab-Navigation, Escape)
 * - Header-Synchronisation & Celebration-Modals
 * ==========================================================================
 */

/**
 * Animiert ein schwebendes XP-Badge (+10 XP oder -5 XP) sanft nach oben weg,
 * absolut klick-transparent (pointer-events: none) und außerhalb des Textflusses.
 * @param {HTMLElement | null} anchorEl Referenz-Element für die Startposition
 * @param {number} deltaXp Positiver oder negativer XP-Wert (z. B. -5 oder +10)
 * @param {string} [customLabel] Optionaler Zusatztext
 */
function spawnFloatingXp(anchorEl, deltaXp, customLabel = '') {
  const badge = document.createElement('div');
  const isPositive = deltaXp >= 0;
  badge.className = `gm-floating-xp ${isPositive ? 'is-gain' : 'is-deduct'}`;
  badge.setAttribute('aria-hidden', 'true');

  const sign = isPositive ? '+' : '';
  badge.textContent = customLabel || `${sign}${deltaXp} XP`;

  // Berechne Bildschirmkoordinaten ohne Layout-Shift
  let left = window.innerWidth / 2;
  let top = window.innerHeight - 90;

  if (anchorEl && typeof anchorEl.getBoundingClientRect === 'function') {
    const rect = anchorEl.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      left = rect.left + rect.width / 2;
      top = Math.max(24, rect.top - 6);
    }
  }

  badge.style.left = `${Math.round(left)}px`;
  badge.style.top = `${Math.round(top)}px`;

  document.body.appendChild(badge);

  // Entferne das Element nach Abschluss der Keyframe-Animation
  setTimeout(() => {
    badge.remove();
  }, 950);
}

/**
 * Synchronisiert den angezeigten Text und Status einer Lücke in der Hauptansicht
 * mit der Eingabe in der fixierten unteren Eingabezeile.
 * @param {object} params
 * @param {HTMLElement | null} params.gapSlotEl Das aktive Lücken-Element im Text
 * @param {string} params.value Aktueller Textwert
 * @param {string} params.prompt Infinitiv-Hinweis (z. B. "get up")
 * @param {'idle' | 'active' | 'correct' | 'incorrect' | 'hinted'} [params.state]
 */
function syncGapSlotDOM({ gapSlotEl, value, prompt, state }) {
  if (!gapSlotEl) return;

  const valueSpan = gapSlotEl.querySelector('.gm-gap-value') || gapSlotEl;
  const trimmed = (value || '').trim();

  if (trimmed.length > 0) {
    valueSpan.textContent = value;
    gapSlotEl.classList.add('has-value');
  } else {
    valueSpan.textContent = prompt ? `(${prompt})` : '___';
    gapSlotEl.classList.remove('has-value');
  }

  if (state) {
    gapSlotEl.classList.remove('is-active', 'is-correct', 'is-incorrect', 'is-hinted');
    if (state === 'active') gapSlotEl.classList.add('is-active');
    if (state === 'correct') gapSlotEl.classList.add('is-correct');
    if (state === 'incorrect') gapSlotEl.classList.add('is-incorrect');
    if (state === 'hinted') gapSlotEl.classList.add('is-hinted');
  }
}

/**
 * Aktualisiert die nicht-überlappende Hinweis-Leiste (Infinitiv & Grammatik-Tipp)
 * direkt oberhalb des Eingabefeldes sowie das Eingabefeld selbst.
 * @param {object} params
 * @param {object} params.gapData Datenobjekt der aktiven Lücke
 * @param {string} params.currentValue Bisherige Nutzereingabe für diese Lücke
 * @param {boolean} params.isSolved Ob die Lücke bereits gelöst ist
 * @param {boolean} params.hintUsed Ob bereits ein Tipp (-5 XP) genutzt wurde
 * @param {number} params.gapIndex 0-basierter Index der aktuellen Lücke
 * @param {number} params.totalGaps Gesamtanzahl der Lücken in dieser Übung
 * @param {boolean} [params.autoFocus] Ob das Eingabefeld fokussiert werden soll
 */
function updateInputDock({
  gapData,
  currentValue = '',
  isSolved = false,
  hintUsed = false,
  gapIndex = 0,
  totalGaps = 1,
  autoFocus = true
}) {
  const promptChip = document.getElementById('gm-dock-prompt');
  const grammarChip = document.getElementById('gm-dock-grammar-hint');
  const stepCounter = document.getElementById('gm-dock-step');
  const inputEl = document.getElementById('gm-dock-input');
  const hintBtn = document.getElementById('gm-dock-hint-btn');
  const submitBtn = document.getElementById('gm-dock-submit-btn');

  if (!gapData || !inputEl) return;

  const verbCue = gapData.prompt || gapData.gap || '';

  if (promptChip) {
    promptChip.innerHTML = `<span class="gm-cue-label">Vorgabe:</span> <strong>(${escapeHtml(verbCue)})</strong>`;
  }

  if (grammarChip) {
    if (gapData.grammarHint) {
      grammarChip.textContent = gapData.grammarHint;
      grammarChip.hidden = false;
    } else {
      grammarChip.hidden = true;
    }
  }

  if (stepCounter) {
    stepCounter.textContent = `Lücke ${gapIndex + 1} / ${totalGaps}`;
  }

  inputEl.value = currentValue;
  inputEl.placeholder = verbCue ? `${verbCue} …` : 'Antwort eingeben …';
  inputEl.disabled = Boolean(isSolved);
  inputEl.classList.remove('is-correct', 'is-incorrect', 'is-hinted');

  if (isSolved) {
    inputEl.classList.add('is-correct');
  } else if (hintUsed) {
    inputEl.classList.add('is-hinted');
  }

  if (hintBtn) {
    hintBtn.disabled = Boolean(isSolved);
    hintBtn.classList.toggle('is-used', Boolean(hintUsed));
    hintBtn.innerHTML = hintUsed
      ? `<span aria-hidden="true">💡</span><span>Tipp aktiv</span>`
      : `<span aria-hidden="true">💡</span><span>Tipp <small>-5 XP</small></span>`;
  }

  if (submitBtn) {
    submitBtn.innerHTML = isSolved
      ? `<span>Weiter</span><kbd aria-hidden="true">↵</kbd>`
      : `<span>Prüfen</span><kbd aria-hidden="true">↵</kbd>`;
  }

  if (autoFocus && !isSolved) {
    requestAnimationFrame(() => {
      try {
        inputEl.focus({ preventScroll: true });
      } catch {
        inputEl.focus();
      }
    });
  }
}

/**
 * Öffnet den didaktischen Feedback-Drawer oberhalb der Eingabezeile.
 * @param {object} params
 * @param {'correct' | 'incorrect' | 'hint'} params.type
 * @param {string} params.title
 * @param {string} params.message
 * @param {string} [params.solution]
 * @param {string} [params.actionLabel]
 * @param {() => void} [params.onAction]
 */
function showFeedbackDrawer({
  type,
  title,
  message,
  solution = '',
  actionLabel = '',
  onAction = null
}) {
  const drawer = document.getElementById('gm-feedback-drawer');
  if (!drawer) return;

  drawer.className = `gm-feedback-drawer is-open is-${type}`;

  const icon = type === 'correct' ? '✅' : type === 'hint' ? '💡' : '⚠️';

  drawer.innerHTML = `
    <div class="gm-feedback-drawer-inner">
      <div class="gm-feedback-main">
        <span class="gm-feedback-icon" aria-hidden="true">${icon}</span>
        <div class="gm-feedback-copy">
          <div class="gm-feedback-title">${escapeHtml(title)}</div>
          <div class="gm-feedback-text">${escapeHtml(message)}</div>
          ${
            solution
              ? `<div class="gm-feedback-solution">Lösung: <strong>${escapeHtml(solution)}</strong></div>`
              : ''
          }
        </div>
      </div>
      ${
        actionLabel
          ? `<button type="button" class="gm-feedback-action-btn" id="gm-feedback-action-btn">
               <span>${escapeHtml(actionLabel)}</span>
               <kbd aria-hidden="true">↵</kbd>
             </button>`
          : `<button type="button" class="gm-feedback-close-btn" id="gm-feedback-close-btn" aria-label="Schließen">✕</button>`
      }
    </div>
  `;

  const actionBtn = drawer.querySelector('#gm-feedback-action-btn');
  if (actionBtn && onAction) {
    actionBtn.onclick = () => onAction();
  }

  const closeBtn = drawer.querySelector('#gm-feedback-close-btn');
  if (closeBtn) {
    closeBtn.onclick = () => hideFeedbackDrawer();
  }
}

/**
 * Schließt den Feedback-Drawer sanft.
 */
function hideFeedbackDrawer() {
  const drawer = document.getElementById('gm-feedback-drawer');
  if (!drawer) return;
  drawer.classList.remove('is-open', 'is-correct', 'is-incorrect', 'is-hint');
}

/**
 * Scrollt das aktive Lücken-Element innerhalb des scrollbaren Bühnen-Containers
 * sanft in den sichtbaren Bereich, ohne das 100dvh-Hauptlayout zu verschieben.
 * @param {HTMLElement | null} gapEl
 */
function ensureGapVisible(gapEl) {
  if (!gapEl) return;
  const stageScroll = gapEl.closest('.gm-stage-scroll');
  if (!stageScroll) return;

  const containerRect = stageScroll.getBoundingClientRect();
  const elRect = gapEl.getBoundingClientRect();

  const offsetTop = elRect.top - containerRect.top;
  const offsetBottom = elRect.bottom - containerRect.bottom;

  if (offsetTop < 28 || offsetBottom > -28) {
    gapEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }
}

/**
 * Registriert das globale und Eingabefeld-bezogene Tastatur-Handling
 * (Enter-Steuerung, Tab-Wechsel zwischen Lücken, Escape).
 * @param {object} handlers
 * @param {() => void} handlers.onEnter
 * @param {(direction: 1 | -1) => void} handlers.onTabGap
 * @param {() => void} handlers.onTriggerHint
 * @param {() => void} [handlers.onEscape]
 * @returns {() => void} Cleanup-Funktion
 */
function bindKeyboardController({ onEnter, onTabGap, onTriggerHint, onEscape }) {
  const handleKeyDown = (e) => {
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    const isInputFocused =
      document.activeElement && document.activeElement.id === 'gm-dock-input';

    if (e.key === 'Enter') {
      // Wenn ein Modal-Button fokussiert ist, Standardverhalten zulassen
      if (
        document.activeElement &&
        document.activeElement.closest('.gm-modal-overlay')
      ) {
        return;
      }
      e.preventDefault();
      if (onEnter) onEnter();
      return;
    }

    if (e.key === 'Tab' && onTabGap) {
      const stageActive = document.getElementById('gm-trainer-stage');
      if (stageActive && !stageActive.hidden) {
        e.preventDefault();
        onTabGap(e.shiftKey ? -1 : 1);
      }
      return;
    }

    if (e.key === 'Escape') {
      hideFeedbackDrawer();
      if (onEscape) onEscape();
      return;
    }

    // Shortcut Alt+H oder Ctrl+Space für Tipp
    if ((e.altKey && e.key.toLowerCase() === 'h') && onTriggerHint) {
      e.preventDefault();
      onTriggerHint();
      return;
    }

    // Wenn der Nutzer direkt auf der Tastatur tippt, während die Übungsansicht offen ist,
    // fokussiere automatisch das Bottom-Dock-Inputfeld
    if (
      !isInputFocused &&
      activeTag !== 'INPUT' &&
      activeTag !== 'TEXTAREA' &&
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      const dockInput = document.getElementById('gm-dock-input');
      if (dockInput && !dockInput.disabled) {
        dockInput.focus();
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}

/**
 * Zeigt ein zentriertes Erfolgs-Overlay nach Abschluss einer Übung an.
 * @param {object} params
 * @param {string} params.exerciseTitle
 * @param {number} params.bonusXp
 * @param {boolean} params.hasNextExercise
 * @param {boolean} params.topicMastered
 * @param {string} params.topicTitle
 * @param {() => void} params.onNext
 * @param {() => void} params.onOverview
 */
function showExerciseCompletionModal({
  exerciseTitle,
  bonusXp = 50,
  hasNextExercise = false,
  topicMastered = false,
  topicTitle = '',
  onNext,
  onOverview
}) {
  const existing = document.getElementById('gm-completion-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'gm-completion-modal';
  overlay.className = 'gm-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  overlay.innerHTML = `
    <div class="gm-modal-card">
      <div class="gm-modal-badge-icon">${topicMastered ? '👑' : '🎉'}</div>
      <div class="gm-modal-eyebrow">${
        topicMastered ? 'THEMA KOMPLETT GEMEISTERT' : 'ÜBUNG ERFOLGREICH GELÖST'
      }</div>
      <h2 class="gm-modal-title">${escapeHtml(
        topicMastered ? `${topicTitle} Master!` : exerciseTitle
      )}</h2>
      <p class="gm-modal-desc">
        ${
          topicMastered
            ? 'Herausragend! Du hast sämtliche Übungen dieses Grammatik-Themas fehlerfrei abgeschlossen.'
            : 'Stark gemacht! Alle Lücken dieser Einheit wurden vollständig gelöst.'
        }
      </p>
      <div class="gm-modal-reward-pill">
        <span>⭐ +${bonusXp} XP Abschluss-Bonus</span>
      </div>
      <div class="gm-modal-actions">
        ${
          hasNextExercise
            ? `<button type="button" class="gm-btn-primary" id="gm-modal-next-btn">
                 Nächste Übung starten →
               </button>
               <button type="button" class="gm-btn-secondary" id="gm-modal-overview-btn">
                 Zur Themen-Übersicht
               </button>`
            : `<button type="button" class="gm-btn-primary" id="gm-modal-overview-btn">
                 Zurück zur Themen-Übersicht →
               </button>`
        }
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const nextBtn = overlay.querySelector('#gm-modal-next-btn');
  const overviewBtn = overlay.querySelector('#gm-modal-overview-btn');

  if (nextBtn) {
    nextBtn.onclick = () => {
      overlay.remove();
      if (onNext) onNext();
    };
    nextBtn.focus();
  } else if (overviewBtn) {
    overviewBtn.focus();
  }

  if (overviewBtn) {
    overviewBtn.onclick = () => {
      overlay.remove();
      if (onOverview) onOverview();
    };
  }
}

/**
 * Zeigt einen dezenten Toast am oberen Bildschirmrand an (z. B. bei neuem Badge).
 * @param {object} badge
 */
function showBadgeToast(badge) {
  if (!badge) return;
  const toast = document.createElement('div');
  toast.className = 'gm-badge-toast';
  toast.innerHTML = `
    <span class="gm-badge-toast-icon">${badge.icon || '🏆'}</span>
    <div>
      <div class="gm-badge-toast-title">Badge freigeschaltet: ${escapeHtml(badge.label)}</div>
      <div class="gm-badge-toast-desc">${escapeHtml(badge.desc || '')}</div>
    </div>
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('is-visible');
  });

  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 350);
  }, 4000);
}

/**
 * Hilfsfunktion zum sicheren Escapen von HTML-Strings.
 * @param {string} str
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const UI = {
  spawnFloatingXp,
  syncGapSlotDOM,
  updateInputDock,
  showFeedbackDrawer,
  hideFeedbackDrawer,
  ensureGapVisible,
  bindKeyboardController,
  showExerciseCompletionModal,
  showBadgeToast,
  escapeHtml
};


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


const DEFAULT_TOPIC_ID = 'klasse5-present';
class GrammarEngine {
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

  window.GM_Gamification = Gamification;
  window.GM_TROPHY_BADGES = TROPHY_BADGES;
  window.GM_UI = UI;
})();
