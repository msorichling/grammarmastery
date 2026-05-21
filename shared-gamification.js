/* 
   ==========================================================================
   GRAMMAR MASTERY - GLOBAL PORTAL-WIDE GAMIFICATION & ENGINE
   ==========================================================================
   Author: Antigravity AI Coding Assistant
   Purpose: Pure client-side GDPR-compliant gamification, dynamic headers, 
            Web Audio synth, on-demand hint bulb injector & real-time inputs.
   ==========================================================================
*/

(function() {
    // --- GAMIFICATION STATE MANAGEMENT ---
    let xp = parseInt(localStorage.getItem('gm_global_xp') || '0');
    let streak = parseInt(localStorage.getItem('gm_daily_streak') || '0');
    let lastActive = localStorage.getItem('gm_last_active_date') || '';
    let unlockedBadges = JSON.parse(localStorage.getItem('gm_unlocked_badges') || '[]');

    const pointsPerLevel = 150;

    // Ranks based on level
    const levelRanks = {
        1: "Tense Novice 🌱",
        2: "Verb Finder 🔍",
        3: "Streak Starter 🔥",
        4: "Sentence Builder 🏗️",
        5: "Grammar Cadet 🎖️",
        6: "Clause Captain ⚓",
        7: "Verb Conjugator ⚔️",
        8: "Syntax Wizard 🧙‍♂️",
        9: "Tense Champion 🏆",
        10: "Grammar Mastery Legend 👑"
    };

    function getLevelInfo(totalXp) {
        const lvl = Math.floor(totalXp / pointsPerLevel) + 1;
        const rank = levelRanks[Math.min(lvl, 10)];
        const xpInCurrentLvl = totalXp % pointsPerLevel;
        const progressPercent = Math.min((xpInCurrentLvl / pointsPerLevel) * 100, 100);
        return { level: lvl, rank, xpInCurrentLvl, progressPercent };
    }

    // --- PURE WEB AUDIO SYNTHESIZER ---
    let audioCtx = null;
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function playSynthSound(type) {
        try {
            initAudio();
            if (!audioCtx) return;

            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            const now = audioCtx.currentTime;

            if (type === 'correct') {
                // Sleek major chime: C5 -> E5 -> G5
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523.25, now); // C5
                osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
                osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
                
                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(0.12, now + 0.05);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                osc.start(now);
                osc.stop(now + 0.5);
            } 
            else if (type === 'incorrect') {
                // Low buzzer dissonance: A3 -> G#3
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(220.00, now); // A3
                osc.frequency.setValueAtTime(207.65, now + 0.1); // G#3
                
                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(0.15, now + 0.05);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
                osc.start(now);
                osc.stop(now + 0.4);
            }
            else if (type === 'hint') {
                // Light soft bell: F5
                osc.type = 'sine';
                osc.frequency.setValueAtTime(698.46, now); // F5
                
                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(0.08, now + 0.02);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
            }
            else if (type === 'success') {
                // Celebration fanfare: C4 -> G4 -> C5 -> E5 -> G5 -> C6
                osc.type = 'triangle';
                const freqs = [261.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(0.15, now + 0.05);
                
                freqs.forEach((f, i) => {
                    osc.frequency.setValueAtTime(f, now + (i * 0.08));
                });
                
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
                osc.start(now);
                osc.stop(now + 0.8);
            }
        } catch (e) {
            console.warn("Audio Context blocked or failed:", e);
        }
    }

    // --- STREAK CALCULATION ENGINE ---
    function updateStreak() {
        const todayStr = new Date().toISOString().split('T')[0];
        
        if (lastActive === todayStr) {
            // Already active today
            return;
        }

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (lastActive === yesterdayStr) {
            // Consecutive day active!
            streak += 1;
        } else {
            // Streak broken or brand new
            streak = 1;
        }

        lastActive = todayStr;
        localStorage.setItem('gm_daily_streak', streak.toString());
        localStorage.setItem('gm_last_active_date', lastActive);
        
        // Unlock badge if streak milestones reached
        if (streak >= 3) unlockBadge('streak_3', 'Streak Starter', '3 Tage in Folge geübt');
        if (streak >= 7) unlockBadge('streak_7', 'Wochen-Hero', '7 Tage in Folge geübt');
        
        syncHeaderDOM();
    }

    // --- BADGE TROPHY CABINET SYSTEM ---
    function unlockBadge(id, title, desc) {
        if (!unlockedBadges.includes(id)) {
            unlockedBadges.push(id);
            localStorage.setItem('gm_unlocked_badges', JSON.stringify(unlockedBadges));
            
            // Render a smooth temporary bottom notification
            const toast = document.createElement('div');
            toast.style.position = 'fixed';
            toast.style.bottom = '24px';
            toast.style.right = '24px';
            toast.style.zIndex = '9999';
            toast.style.background = 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)';
            toast.style.border = '2px solid #fbbf24';
            toast.style.borderRadius = '16px';
            toast.style.padding = '16px 20px';
            toast.style.boxShadow = '0 10px 30px rgba(251, 191, 36, 0.3)';
            toast.style.display = 'flex';
            toast.style.alignItems = 'center';
            toast.style.gap = '12px';
            toast.style.color = '#fff';
            toast.style.transform = 'translateY(100px)';
            toast.style.opacity = '0';
            toast.style.transition = 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

            toast.innerHTML = `
                <div style="font-size: 2.2rem;">🏆</div>
                <div>
                    <h5 style="margin:0; font-size: 0.95rem; color:#fbbf24; font-weight:800;">Badge freigeschaltet!</h5>
                    <p style="margin:2px 0 0 0; font-size:0.8rem; color:#94a3b8;">${title} - ${desc}</p>
                </div>
            `;
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.style.transform = 'translateY(0)';
                toast.style.opacity = '1';
                playSynthSound('success');
            }, 100);

            setTimeout(() => {
                toast.style.transform = 'translateY(100px)';
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 500);
            }, 5000);
        }
    }

    // --- GLOBAL STICKY STATS HEADER ---
    function injectGlobalHeader() {
        if (document.querySelector('.gm-header-container')) return; // Already injected

        const container = document.createElement('div');
        container.className = 'gm-header-container';

        const info = getLevelInfo(xp);

        container.innerHTML = `
            <div class="gm-header-left">
                <a href="index.html" class="gm-logo">🏫 Grammar Mastery</a>
            </div>
            <div class="gm-header-right">
                <!-- Streak Badge -->
                <div class="gm-stat-badge gm-streak-badge" title="Tägliche Serie: Lerne jeden Tag, um die Flamme am Leben zu erhalten!">
                    🔥 <span id="gm-header-streak">${streak}</span>
                </div>
                <!-- XP Badge -->
                <div class="gm-stat-badge gm-xp-badge" title="Gesamte Erfahrungspunkte">
                    ⭐ <span id="gm-header-xp">${xp}</span> XP
                </div>
                <!-- Level Badge -->
                <div class="gm-stat-badge gm-level-badge" title="Dein aktuelles Level">
                    🏆 Level <span id="gm-header-level">${info.level}</span>
                </div>
                <!-- Level Progress Bar -->
                <div class="gm-level-bar-wrapper" title="${info.xpInCurrentLvl} / ${pointsPerLevel} XP zum nächsten Level">
                    <span style="font-size: 0.65rem; color: #94a3b8; font-weight: 700;">${info.rank}</span>
                    <div class="gm-level-bar-bg">
                        <div class="gm-level-bar-fill" id="gm-header-progress" style="width: ${info.progressPercent}%"></div>
                    </div>
                </div>
                <!-- Rules Button -->
                <button class="gm-stat-badge" id="gm-header-help-btn" style="cursor: pointer; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.4); color: #60a5fa; font-weight: 700; border-radius: 12px; padding: 6px 12px; transition: all 0.2s;" title="Spielregeln & XP-Erklärung anzeigen">
                    ❓ Regeln
                </button>
            </div>
        `;

        document.body.insertBefore(container, document.body.firstChild);

        // Bind rules button
        const helpBtn = container.querySelector('#gm-header-help-btn');
        if (helpBtn) {
            helpBtn.onclick = function() {
                injectOnboardingBanner(true); // Force show / toggle
            };
        }
    }

    function syncHeaderDOM() {
        const streakEl = document.getElementById('gm-header-streak');
        const xpEl = document.getElementById('gm-header-xp');
        const lvlEl = document.getElementById('gm-header-level');
        const fillEl = document.getElementById('gm-header-progress');

        if (streakEl) streakEl.innerText = streak;
        if (xpEl) xpEl.innerText = xp;

        const info = getLevelInfo(xp);
        if (lvlEl) lvlEl.innerText = info.level;
        if (fillEl) fillEl.style.width = info.progressPercent + '%';

        // Update levels ranks on page label if present
        const badgeLabel = document.querySelector('.gm-level-bar-wrapper span');
        if (badgeLabel) badgeLabel.innerText = info.rank;

        // Sync landing page specific elements if they exist
        const portalXp = document.getElementById('portal-xp-display');
        const portalStreak = document.getElementById('portal-streak-display');
        const portalRank = document.getElementById('portal-rank-display');
        if (portalXp) portalXp.innerText = xp;
        if (portalStreak) portalStreak.innerText = streak;
        if (portalRank) portalRank.innerText = info.rank;
    }

    // --- GAME INTRO RULES BANNER ---
    function injectOnboardingBanner(forceShow = false) {
        // Remove existing if any
        const existing = document.querySelector('.gm-intro-card');
        if (existing) {
            existing.remove();
            if (forceShow === true && !localStorage.getItem('gm_intro_dismissed')) {
                // If it was clicked to toggle, just let it close
                return;
            }
            if (forceShow === true && localStorage.getItem('gm_intro_dismissed') === 'true') {
                // if it's already hidden but we clicked rules, we want to re-open it, so continue.
            } else {
                return;
            }
        } else if (!forceShow && localStorage.getItem('gm_intro_dismissed') === 'true') {
            return;
        }
        
        // Find sticky header to insert right after it
        const header = document.querySelector('.gm-header-container');
        if (!header) return;

        const banner = document.createElement('div');
        banner.className = 'gm-intro-card';
        banner.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
                <div>
                    <h3 style="margin:0 0 8px 0; color:#fbbf24; font-size: 1.4rem;">🎮 Willkommen bei Grammar Mastery!</h3>
                    <p style="margin:0; font-size: 0.95rem; color:#cbd5e1; max-width: 800px;">
                        Lerne Englisch und sammle spielerisch Punkte! Alle deine Fortschritte werden <b>zu 100% datenschutzkonform</b> direkt in deinem Browser (localStorage) gespeichert. Keine Registrierung, keine Passwörter.
                    </p>
                </div>
            </div>
            
            <h4 style="margin: 16px 0 8px 0; color: #60a5fa; font-size: 1.1rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">Punkte &amp; Regeln (XP und Abzüge):</h4>
            <div class="gm-intro-grid">
                <div class="gm-intro-item">
                    <span class="gm-intro-icon">⭐</span>
                    <div class="gm-intro-text">
                        <h5 style="color: #34d399;">+10 XP Lücken-Bonus</h5>
                        <p>Für jede richtige Antwort erhältst du <b>+10 XP</b>. Die Prüfung erfolgt sofort beim Verlassen des Feldes oder Drücken von Enter!</p>
                    </div>
                </div>
                <div class="gm-intro-item">
                    <span class="gm-intro-icon">🎉</span>
                    <div class="gm-intro-text">
                        <h5 style="color: #34d399;">+50 XP Übungs-Bonus</h5>
                        <p>Schließe alle Lücken einer Übung komplett ab und erhalte einen Extra-Bonus von <b>+50 XP</b> sowie einen Stage-Master-Badge!</p>
                    </div>
                </div>
                <div class="gm-intro-item">
                    <span class="gm-intro-icon">💡</span>
                    <div class="gm-intro-text">
                        <h5 style="color: #fbbf24;">-5 XP Tipp-Kosten</h5>
                        <p>Klicke auf die Glühbirne (💡) für den ersten Buchstaben. Das kostet einmalig <b>-5 XP</b> (vor dem Klick am roten Badge zu sehen!).</p>
                    </div>
                </div>
                <div class="gm-intro-item">
                    <span class="gm-intro-icon">🛡️</span>
                    <div class="gm-intro-text">
                        <h5 style="color: #60a5fa;">0 XP bei Fehlern</h5>
                        <p>Falsche Antworten kosten dich <b>keine XP</b>! Probiere es einfach aus und lerne aus Fehlern – das kostet dich gar nichts!</p>
                    </div>
                </div>
            </div>
            
            <div style="text-align: right; margin-top: 12px;">
                <button class="gm-intro-close-btn" id="gm-dismiss-intro-btn">Alles klar, ich bin bereit! 🚀</button>
            </div>
        `;

        header.parentNode.insertBefore(banner, header.nextSibling);

        document.getElementById('gm-dismiss-intro-btn').onclick = function() {
            banner.style.animation = 'gmSlideDown 0.3s ease-in reverse';
            setTimeout(() => {
                banner.remove();
                localStorage.setItem('gm_intro_dismissed', 'true');
            }, 300);
        };
    }

    // --- RECT ACTIVE GLOW BACKGROUND BLOBS ---
    function injectBackgroundBlobs() {
        if (document.querySelector('.gm-glow-blob')) return; // Already exists
        const blob1 = document.createElement('div');
        blob1.className = 'gm-glow-blob gm-blob-blue';
        const blob2 = document.createElement('div');
        blob2.className = 'gm-glow-blob gm-blob-purple';
        document.body.appendChild(blob1);
        document.body.appendChild(blob2);
    }

    // --- EXPORTED PUBLIC UTILITY API ---
    window.gmAwardXp = function(points) {
        xp += points;
        localStorage.setItem('gm_global_xp', xp.toString());
        
        // Check milestone badges
        if (xp >= 100) unlockBadge('xp_100', 'XP Explorer', '100 Erfahrungspunkte gesammelt');
        if (xp >= 500) unlockBadge('xp_500', 'Verb Guru', '500 Erfahrungspunkte gesammelt');
        if (xp >= 1500) unlockBadge('xp_1500', 'Grammar Lord', '1500 Erfahrungspunkte gesammelt');
        
        updateStreak();
        syncHeaderDOM();
    };

    window.gmDeductXp = function(points) {
        xp = Math.max(0, xp - points);
        localStorage.setItem('gm_global_xp', xp.toString());
        syncHeaderDOM();
    };

    window.gmTriggerChime = function(type) {
        playSynthSound(type);
    };

    // Beautiful dynamic completion modal celebration
    window.gmShowSuccessOverlay = function(bonusXp, badgeTitle, nextBtnCallback) {
        // Trigger completion sound
        playSynthSound('success');
        
        const overlay = document.createElement('div');
        overlay.className = 'gm-success-overlay';
        overlay.innerHTML = `
            <div class="gm-success-card">
                <div class="gm-success-star">🎉</div>
                <h3 class="gm-success-title">Hervorragend gelöst!</h3>
                <p class="gm-success-desc">Du hast alle Sätze dieses Abschnitts richtig gemeistert.</p>
                <div class="gm-success-points">
                    ⭐ +${bonusXp} XP Abschluss-Bonus!
                </div>
                <div style="display:block; margin-bottom:24px;">
                    ${badgeTitle ? `<span style="font-size:0.9rem; color:#fbbf24; font-weight:800;">🏆 Freigeschaltet: ${badgeTitle}</span>` : ''}
                </div>
                <button class="gm-success-btn" id="gm-success-close">Weiter</button>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('gm-success-close').onclick = function() {
            overlay.remove();
            if (nextBtnCallback) nextBtnCallback();
        };
    };

    // --- DYNAMIC INPUT BINDING SYSTEM (THE HEART OF THE CLOZE UPGRADE) ---
    window.gmRegisterInput = function(inputEl, correctAnswers, explanation, tenseName, onSolvedCallback) {
        if (!inputEl) return;

        // Wrap input in premium wrapper if not already
        let wrapper = inputEl.parentElement;
        if (!wrapper.classList.contains('gap-input-wrapper')) {
            wrapper = document.createElement('span');
            wrapper.className = 'gap-input-wrapper';
            inputEl.parentNode.insertBefore(wrapper, inputEl);
            wrapper.appendChild(inputEl);
        }

        // Add class to input
        inputEl.classList.add('gap-input');
        inputEl.setAttribute('autocomplete', 'off');
        inputEl.setAttribute('spellcheck', 'false');

        // Create interactive lightbulb hint button inside the wrapper
        if (!wrapper.querySelector('.gm-hint-btn')) {
            const hintBtn = document.createElement('button');
            hintBtn.type = 'button';
            hintBtn.className = 'gm-hint-btn';
            hintBtn.innerHTML = '💡';
            hintBtn.setAttribute('data-tooltip', 'Tipp nutzen (-5 XP)');
            hintBtn.title = "Ersten Buchstaben anzeigen (-5 XP)";
            wrapper.appendChild(hintBtn);

            // Add the floating cost badge directly inside the wrapper next to the bulb
            const costBadge = document.createElement('span');
            costBadge.className = 'gm-hint-cost-badge';
            costBadge.innerText = '-5 XP';
            wrapper.appendChild(costBadge);

            // Handle Hint Click
            hintBtn.onclick = function(e) {
                e.stopPropagation();
                initAudio();
                
                // Only allow hints if not already solved and hint wasn't already used
                if (inputEl.classList.contains('correct') || inputEl.classList.contains('gm-hinted')) return;

                // Fill first letter
                const targetWord = correctAnswers[0].trim();
                if (targetWord.length > 0) {
                    const firstLetter = targetWord.charAt(0);
                    inputEl.value = firstLetter;
                    inputEl.classList.add('gm-hinted');
                    inputEl.focus();
                    
                    // Deduct 5 XP and play sound
                    window.gmDeductXp(5);
                    playSynthSound('hint');
                    
                    // Hide the cost badge since the hint is now used!
                    costBadge.style.display = 'none';
                    hintBtn.classList.add('used');
                    
                    // Render temporary tooltip text "Tipp genutzt!"
                    hintBtn.setAttribute('data-tooltip', 'Tipp genutzt!');
                    hintBtn.title = "Tipp bereits genutzt";
                }
            };
        }

        // Create elegant drop-down feedback card below the parent sentence/wrapper
        // Find parent block to append feedback card (usually a line or paragraph)
        let parentSentence = wrapper.parentNode;
        // In some sheets, sentences are inside elements. Let's create the container
        let fbContainerId = 'gm-fb-' + inputEl.id;
        let fbContainer = document.getElementById(fbContainerId);
        if (!fbContainer) {
            fbContainer = document.createElement('div');
            fbContainer.id = fbContainerId;
            fbContainer.className = 'gm-feedback-container';
            
            // Insert it after the parent paragraph or adjacent
            parentSentence.appendChild(fbContainer);
        }

        let isCorrected = false;

        // Core validation function
        function validateInput() {
            if (inputEl.classList.contains('correct')) return; // Already solved

            const val = inputEl.value.toLowerCase().trim();
            const correctArr = correctAnswers.map(c => c.toLowerCase().trim());
            const isOk = correctArr.includes(val);

            if (isOk) {
                // CORRECT FLOW
                inputEl.className = 'gap-input correct';
                inputEl.disabled = true; // Lock field
                
                // Hide feedback box with animation
                fbContainer.classList.remove('active');
                fbContainer.innerHTML = '';

                // Award points only if they solved it without hint or just 10 XP anyway
                // If they used a hint, maybe still award +5 XP (net +0 since hint cost -5 XP)
                const isHinted = inputEl.classList.contains('gm-hinted');
                const pointsGained = isHinted ? 10 : 10;
                
                window.gmAwardXp(pointsGained);
                playSynthSound('correct');

                isCorrected = true;
                
                if (onSolvedCallback) {
                    onSolvedCallback(true);
                }
            } else if (val.length > 0) {
                // INCORRECT FLOW
                inputEl.className = 'gap-input incorrect';
                playSynthSound('incorrect');

                // Render beautiful didactical feedback explaining this tense
                const cleanTense = tenseName ? tenseName.replace(/_/g, ' ') : '';
                fbContainer.innerHTML = `
                    <div class="gm-feedback-card">
                        ${cleanTense ? `<span class="gm-tense-tag">${cleanTense}</span>` : ''}
                        Lösung: <b>${correctAnswers[0]}</b>. ${explanation || ''}
                    </div>
                `;
                fbContainer.classList.add('active');

                if (onSolvedCallback) {
                    onSolvedCallback(false);
                }
            }
        }

        // Bind events: blur & Enter key
        inputEl.onblur = function() {
            if (inputEl.value.trim().length > 0) {
                validateInput();
            }
        };

        inputEl.onkeydown = function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                validateInput();
            }
        };
    };

    // --- AUTO START INITIALIZER ---
    window.addEventListener('DOMContentLoaded', () => {
        injectBackgroundBlobs();
        injectGlobalHeader();
        
        // Show rules explanation banner
        injectOnboardingBanner();
        
        // Trigger initial streak check on start
        const todayStr = new Date().toISOString().split('T')[0];
        if (lastActive !== todayStr) {
            updateStreak();
        }
    });

})();
