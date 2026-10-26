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
export function spawnFloatingXp(anchorEl, deltaXp, customLabel = '') {
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
export function syncGapSlotDOM({ gapSlotEl, value, prompt, state }) {
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
export function updateInputDock({
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
export function showFeedbackDrawer({
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
export function hideFeedbackDrawer() {
  const drawer = document.getElementById('gm-feedback-drawer');
  if (!drawer) return;
  drawer.classList.remove('is-open', 'is-correct', 'is-incorrect', 'is-hint');
}

/**
 * Scrollt das aktive Lücken-Element innerhalb des scrollbaren Bühnen-Containers
 * sanft in den sichtbaren Bereich, ohne das 100dvh-Hauptlayout zu verschieben.
 * @param {HTMLElement | null} gapEl
 */
export function ensureGapVisible(gapEl) {
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
export function bindKeyboardController({ onEnter, onTabGap, onTriggerHint, onEscape }) {
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
export function showExerciseCompletionModal({
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
export function showBadgeToast(badge) {
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
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const UI = {
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

export default UI;
