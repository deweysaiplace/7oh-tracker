document.addEventListener('DOMContentLoaded', () => {
    // Application State
    let state = {
        dailyLimit: 30, // Default recommended starting limit
        dailyTally: 0,
        currentDate: new Date().toISOString().split('T')[0],
        lastDoseTime: null, // ISO string
        stash: {
            mango: 25.0,
            sevenOh: 45.0
        }
    };

    const CIRCLE_CIRCUMFERENCE = 339.29; // Based on r=54 in CSS
    let timerInterval = null;

    // DOM Elements
    const els = {
        limitDisplay: document.getElementById('daily-limit-display'),
        timeSince: document.getElementById('time-since'),
        totalEl: document.getElementById('daily-total'),
        remAmt: document.getElementById('remaining-amount'),
        remBadge: document.getElementById('remaining-badge'),
        progCircle: document.getElementById('progress-circle'),
        histList: document.getElementById('history-list'),

        // Buttons
        editLimitBtn: document.getElementById('edit-limit-btn'),
        logBtns: document.querySelectorAll('.log-btn:not(.log-custom-btn)'),
        customBtn: document.getElementById('custom-log-btn'),
        clearHistBtn: document.getElementById('clear-history-btn'),

        // Modals
        limitModal: document.getElementById('limit-modal'),
        limitInput: document.getElementById('limit-input'),
        closeLimitBtn: document.getElementById('close-limit-modal'),
        saveLimitBtn: document.getElementById('save-limit-btn'),

        customModal: document.getElementById('custom-modal'),
        customInput: document.getElementById('custom-input'),
        closeCustomBtn: document.getElementById('close-custom-modal'),
        saveCustomBtn: document.getElementById('save-custom-btn'),

        resetModal: document.getElementById('reset-modal'),
        closeResetBtn: document.getElementById('close-reset-modal'),
        confirmResetBtn: document.getElementById('confirm-reset-btn'),

        // Stash Elements
        stashMangoVal: document.getElementById('stash-mango-val'),
        stash7ohVal: document.getElementById('stash-7oh-val'),
        editStashBtn: document.getElementById('edit-stash-btn'),
        stashModal: document.getElementById('edit-stash-modal'),
        stashMangoInput: document.getElementById('edit-mango-input'),
        stash7ohInput: document.getElementById('edit-7oh-input'),
        closeStashBtn: document.getElementById('close-stash-modal'),
        saveStashBtn: document.getElementById('save-stash-btn'),
    };

    // --- Initialization ---
    loadData();
    updateUI();
    startTimer();

    // --- Event Listeners ---
    els.logBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Find closest log-btn in case click was on child element (span)
            const el = e.target.closest('.log-btn');
            const amt = parseFloat(el.dataset.amount);
            const stashType = el.dataset.stash;
            logDose(amt, stashType);
        });
    });

    els.clearHistBtn.addEventListener('click', () => {
        els.resetModal.classList.remove('hidden');
    });

    els.closeResetBtn.addEventListener('click', () => els.resetModal.classList.add('hidden'));

    els.confirmResetBtn.addEventListener('click', () => {
        const todayLogs = getHistory().filter(h => h.date !== state.currentDate);
        localStorage.setItem('7oh_history', JSON.stringify(todayLogs));
        state.dailyTally = 0;
        state.lastDoseTime = null;
        saveData();
        updateUI();
        updateTimerText();
        els.resetModal.classList.add('hidden');
    });

    // Modals
    els.editLimitBtn.addEventListener('click', () => {
        els.limitInput.value = state.dailyLimit;
        els.limitModal.classList.remove('hidden');
    });
    els.closeLimitBtn.addEventListener('click', () => els.limitModal.classList.add('hidden'));
    els.saveLimitBtn.addEventListener('click', () => {
        const val = parseFloat(els.limitInput.value);
        if (val > 0) {
            state.dailyLimit = val;
            saveData();
            updateUI();
            els.limitModal.classList.add('hidden');
        }
    });

    els.customBtn.addEventListener('click', () => {
        els.customInput.value = '';
        els.customModal.classList.remove('hidden');
        setTimeout(() => els.customInput.focus(), 100);
    });
    els.closeCustomBtn.addEventListener('click', () => els.customModal.classList.add('hidden'));
    els.saveCustomBtn.addEventListener('click', () => {
        const val = parseFloat(els.customInput.value);
        const selectedStashInfo = document.querySelector('input[name="custom_stash_type"]:checked');
        const stashType = selectedStashInfo ? selectedStashInfo.value : null;

        if (val > 0) {
            logDose(val, stashType);
            els.customModal.classList.add('hidden');
        }
    });

    els.editStashBtn.addEventListener('click', () => {
        els.stashMangoInput.value = state.stash.mango;
        els.stash7ohInput.value = state.stash.sevenOh;
        els.stashModal.classList.remove('hidden');
    });

    els.closeStashBtn.addEventListener('click', () => els.stashModal.classList.add('hidden'));

    els.saveStashBtn.addEventListener('click', () => {
        const newMango = parseFloat(els.stashMangoInput.value);
        const new7oh = parseFloat(els.stash7ohInput.value);

        if (!isNaN(newMango) && newMango >= 0) state.stash.mango = newMango;
        if (!isNaN(new7oh) && new7oh >= 0) state.stash.sevenOh = new7oh;

        saveData();
        updateUI();
        els.stashModal.classList.add('hidden');
    });

    // --- Core Logic ---
    function logDose(amount, stashType = null) {
        // Haptic feedback if available (works on some mobile browsers)
        if (navigator.vibrate) navigator.vibrate(50);

        state.dailyTally += amount;

        const now = new Date();
        state.lastDoseTime = now.toISOString();

        // Calculate stash deduction based on tablet mg sizes
        if (stashType === 'mango') {
            const pillsTaken = amount / 15.0; // Mango is 15mg per pill
            state.stash.mango = Math.max(0, state.stash.mango - pillsTaken);
        } else if (stashType === 'sevenOh') {
            const pillsTaken = amount / 80.0; // 7-OH is 80mg per pill
            state.stash.sevenOh = Math.max(0, state.stash.sevenOh - pillsTaken);
        }

        // Save history entry
        const history = getHistory();
        history.push({
            id: Date.now(),
            date: state.currentDate,
            timestamp: now.toISOString(),
            amount: amount,
            stash: stashType
        });
        localStorage.setItem('7oh_history', JSON.stringify(history));

        saveData();
        updateUI();
        updateTimerText();
    }

    function checkDayWrap() {
        const today = new Date().toISOString().split('T')[0];
        if (state.currentDate !== today) {
            state.currentDate = today;
            state.dailyTally = 0;
            saveData();
        }
    }

    function loadData() {
        const saved = localStorage.getItem('7oh_taper_state');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                state = { ...state, ...parsed };
            } catch (e) {
                console.error("Failed to parse state", e);
            }
        }
        checkDayWrap();

        // Try to migrate data from the old app version if it exists
        const oldState = localStorage.getItem('7oh_state');
        if (oldState && !saved) {
            try {
                const parsed = JSON.parse(oldState);
                if (parsed.currentDate === state.currentDate && parsed.dailyTally) {
                    state.dailyTally = parsed.dailyTally;
                }
            } catch (e) { }
        }
    }

    function saveData() {
        localStorage.setItem('7oh_taper_state', JSON.stringify(state));
    }

    function getHistory() {
        const h = localStorage.getItem('7oh_history');
        return h ? JSON.parse(h) : [];
    }

    // --- Timer Logic ---
    function startTimer() {
        updateTimerText();
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(updateTimerText, 60000); // UI updates every minute
    }

    function updateTimerText() {
        if (!state.lastDoseTime) {
            els.timeSince.textContent = "No data";
            return;
        }

        const lastTime = new Date(state.lastDoseTime).getTime();
        const now = new Date().getTime();
        const diffMs = now - lastTime;

        if (diffMs < 0) {
            els.timeSince.textContent = "Just now";
            return;
        }

        const hrs = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        if (hrs > 24) {
            const days = Math.floor(hrs / 24);
            els.timeSince.textContent = `${days}d ${hrs % 24}h`;
        } else {
            els.timeSince.textContent = `${hrs}h ${mins}m`;
        }
    }

    // --- UI Rendering ---
    function updateUI() {
        // Format Tally
        const formattedTally = state.dailyTally % 1 === 0 ? state.dailyTally : state.dailyTally.toFixed(1);
        els.totalEl.textContent = formattedTally;
        els.limitDisplay.innerHTML = `${state.dailyLimit}<span class="unit">mg</span>`;

        // Update Stash UI
        if (state.stash) {
            els.stashMangoVal.textContent = state.stash.mango % 1 === 0 ? state.stash.mango : state.stash.mango.toFixed(2);
            els.stash7ohVal.textContent = state.stash.sevenOh % 1 === 0 ? state.stash.sevenOh : state.stash.sevenOh.toFixed(2);
        }

        // Calculate progress ring and values
        const remaining = Math.max(0, state.dailyLimit - state.dailyTally);
        els.remAmt.textContent = remaining % 1 === 0 ? remaining : remaining.toFixed(1);

        const percent = Math.min(100, Math.max(0, (state.dailyTally / state.dailyLimit) * 100));
        const offset = CIRCLE_CIRCUMFERENCE - (percent / 100) * CIRCLE_CIRCUMFERENCE;
        els.progCircle.style.strokeDashoffset = offset;

        // Visual warnings based on progress
        els.progCircle.classList.remove('ring-warning', 'ring-danger');
        els.remBadge.classList.remove('badge-warning', 'badge-danger');

        if (percent >= 100) {
            els.progCircle.classList.add('ring-danger');
            els.remBadge.classList.add('badge-danger');
        } else if (percent >= 80) {
            els.progCircle.classList.add('ring-warning');
            els.remBadge.classList.add('badge-warning');
        }

        // Render History for Today
        const history = getHistory().filter(h => h.date === state.currentDate);
        els.histList.innerHTML = '';

        if (history.length === 0) {
            els.histList.innerHTML = '<li class="history-item history-empty">No doses logged today. Keep going!</li>';
        } else {
            [...history].reverse().forEach(entry => {
                const li = document.createElement('li');
                li.className = 'history-item';

                const entryDate = new Date(entry.timestamp);
                const timeStr = entryDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

                const dateSpan = document.createElement('span');
                dateSpan.className = 'hist-time';
                dateSpan.textContent = timeStr;

                const amtSpan = document.createElement('span');
                amtSpan.className = 'hist-amt';

                // Add tiny visual indicator of stash type to the history log
                let stashLabel = '';
                if (entry.stash === 'mango') stashLabel = '<span style="color:#f59e0b;font-size:0.75rem;margin-right:6px">Mango</span>';
                if (entry.stash === 'sevenOh') stashLabel = '<span style="color:#8b5cf6;font-size:0.75rem;margin-right:6px">7-OH</span>';

                amtSpan.innerHTML = `${stashLabel}+${entry.amount % 1 === 0 ? entry.amount : entry.amount.toFixed(1)} mg`;

                li.appendChild(dateSpan);
                li.appendChild(amtSpan);
                els.histList.appendChild(li);
            });
        }
    }

    // Register Service Worker mapping to Version 3 to ensure aggressive cache invalidation of the old UI
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(err => {
                console.log('SW Registration failed: ', err);
            });
        });
    }
});
