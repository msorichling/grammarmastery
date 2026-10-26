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

export const POINTS_PER_LEVEL = 150;

export const LEVEL_RANKS = {
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

export const TROPHY_BADGES = [
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
export function getLevelInfo(customXp) {
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
export function getStats() {
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
export function subscribe(callback) {
  listeners.add(callback);
  callback(getStats(), { type: 'init' });
  return () => listeners.delete(callback);
}

/**
 * Aktualisiert den täglichen Streak anhand des aktuellen Datums.
 */
export function updateStreak() {
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
export function unlockBadge(badgeId) {
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
export function awardXp(points, reason = 'solved') {
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
export function deductXp(points, reason = 'hint') {
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
export function getTopicProgress(topicId, legacyMasteryKey) {
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
export function markExerciseSolved({
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
export function toggleMute() {
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
export function playSound(type) {
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

export const Gamification = {
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

export default Gamification;
