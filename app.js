document.addEventListener('DOMContentLoaded', () => {
    
    // --- APP STATE ---
    const STORAGE_KEY = 'dose_tracker_v2_data';
    let state = {
        stash: { mango: 25.0, sevenOh: 45.0 },
        history: [], // Array of entry objects
        presets: [
            { label: '7.5', sub: 'Mango (1/2)', val: 7.5, type: 'mango' },
            { label: '15', sub: 'Mango (Whole)', val: 15, type: 'mango' },
            { label: '20', sub: '7-OH (1/4)', val: 20, type: 'sevenOh' },
            { label: '40', sub: '7-OH (1/2)', val: 40, type: 'sevenOh' },
            { label: '80', sub: '7-OH (Whole)', val: 80, type: 'sevenOh' }
        ]
    };

    // --- DOM ELEMENTS ---
    const els = {
        navItems: document.querySelectorAll('.nav-item'),
        views: document.querySelectorAll('.view-section'),
        headerTitle: document.getElementById('header-title'),
        safetyBadge: document.getElementById('safety-badge'),
        
        // Dashboard
        dashTotal: document.getElementById('dash-total'),
        dashTimer: document.getElementById('dash-timer'),
        presetGrid: document.getElementById('preset-grid'),
        stashMangoVal: document.getElementById('stash-mango-val'),
        stash7ohVal: document.getElementById('stash-7oh-val'),

        // Save Modal
        saveModal: document.getElementById('save-flow-modal'),
        saveMgInput: document.getElementById('save-mg-input'),
        saveStashRadios: document.getElementsByName('save_stash_type'),
        saveMoodInput: document.getElementById('save-mood-input'),
        saveTimestampDisplay: document.getElementById('save-timestamp-display'),
        btnCancelSave: document.getElementById('btn-cancel-save'),
        btnConfirmSave: document.getElementById('btn-confirm-save'),

        // Timeline
        timelineList: document.getElementById('timeline-list'),

        // Insights
        ins7day: document.getElementById('ins-7day'),
        insAvg: document.getElementById('ins-avg'),
        insGap: document.getElementById('ins-gap'),
        insCommon: document.getElementById('ins-common'),

        // Settings / Edit Stash
        btnOpenEditStash: document.getElementById('open-edit-stash'),
        editStashModal: document.getElementById('edit-stash-modal'),
        editMangoInput: document.getElementById('edit-mango-input'),
        edit7ohInput: document.getElementById('edit-7oh-input'),
        btnCloseStash: document.getElementById('close-stash-modal'),
        btnSaveStash: document.getElementById('save-stash-btn'),

        // Export/Wipe
        btnExport: document.getElementById('btn-export-csv'),
        btnForceUpdate: document.getElementById('btn-force-update'),
        btnWipe: document.getElementById('btn-wipe-data'),
    };

    let timerInterval = null;

    // --- INITIALIZATION ---
    function init() {
        // V2 Wipe Protection: Check if old schema exists and clean it up
        if (localStorage.getItem('7oh_history') || localStorage.getItem('7oh_taper_state')) {
            localStorage.removeItem('7oh_history');
            localStorage.removeItem('7oh_taper_state');
        }

        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try { state = JSON.parse(saved); } catch (e) { console.error("Corrupted save data."); }
        }

        buildPresets();
        updateUI();
        startTimer();
    }

    function saveData() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    // --- NAVIGATION LOGIC ---
    els.navItems.forEach(nav => {
        nav.addEventListener('click', () => {
            // Update active icon
            els.navItems.forEach(n => n.classList.remove('active'));
            nav.classList.add('active');

            // Switch view
            const targetId = nav.dataset.target;
            els.views.forEach(v => v.classList.remove('active-view'));
            document.getElementById(targetId).classList.add('active-view');

            // Update Header
            els.headerTitle.textContent = nav.querySelector('span').textContent;

            // Render specific tab needs
            if (targetId === 'view-timeline') renderTimeline();
            if (targetId === 'view-insights') calcInsights();
        });
    });

    // --- DASHBOARD / QUICK LOGGING ---
    function buildPresets() {
        els.presetGrid.innerHTML = '';
        state.presets.forEach(p => {
            const btn = document.createElement('div');
            btn.className = 'preset-btn';
            btn.innerHTML = `<span class="preset-val">${p.label}</span><span class="preset-lbl">${p.sub}</span>`;
            btn.addEventListener('click', () => openSaveModal(p.val, p.type));
            els.presetGrid.appendChild(btn);
        });

        // Add Custom Button
        const customBtn = document.createElement('div');
        customBtn.className = 'preset-btn custom-btn';
        customBtn.innerHTML = `<span class="preset-val">+</span><span class="preset-lbl">Custom</span>`;
        customBtn.addEventListener('click', () => openSaveModal('', 'other'));
        els.presetGrid.appendChild(customBtn);

        // Add Voice Button
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const voiceBtn = document.createElement('div');
            voiceBtn.className = 'preset-btn voice-btn';
            voiceBtn.innerHTML = `<span class="preset-val">🎤</span><span class="preset-lbl">Voice</span>`;
            voiceBtn.addEventListener('click', startVoiceDictation);
            els.presetGrid.appendChild(voiceBtn);
        }
    }

    // --- VOICE TO LOG PARSER ---
    function startVoiceDictation() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return alert("Voice recognition not supported on this browser.");

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        // Visual feedback
        els.headerTitle.textContent = "🎙️ Listening...";

        recognition.onresult = (event) => {
            const speechResult = event.results[0][0].transcript.toLowerCase();
            els.headerTitle.textContent = "Dashboard";
            
            // Default assumes other
            let productStr = 'other';
            let amountVal = '';
            
            // 1. Identify Product
            if (speechResult.includes('mango')) {
                productStr = 'mango';
            } else if (speechResult.match(/7[-\s]?oh/) || speechResult.match(/seven[-\s]?oh/) || speechResult.includes('tab')) {
                productStr = 'sevenOh';
            }

            // 2. Identify Amount
            // Look for explicit milligrams first e.g. "ten milligrams"
            const mgMatch = speechResult.match(/(\d+(\.\d+)?)\s*(mg|milligram)/);
            if (mgMatch) {
                amountVal = parseFloat(mgMatch[1]);
            } else {
                // Look for fractions relative to the product 
                // Base size logic: Mango=15mg, 7OH=80mg
                let baseSize = 80; // defaults to 7OH tab size if unknown
                if (productStr === 'mango') baseSize = 15;
                if (productStr === 'sevenOh') baseSize = 80;

                let multiplier = 0;
                if (speechResult.match(/quarter|1\/4/)) multiplier = 0.25;
                if (speechResult.match(/half|1\/2/)) multiplier = 0.5;
                if (speechResult.match(/whole|full/)) multiplier = 1.0;

                if (multiplier > 0) {
                    amountVal = baseSize * multiplier;
                }
            }

            // Open the save modal with pre-filled translated data
            openSaveModal(amountVal, productStr);
        };

        recognition.onspeechend = () => {
            recognition.stop();
            els.headerTitle.textContent = "Dashboard";
        };

        recognition.onerror = (event) => {
            console.error(event.error);
            els.headerTitle.textContent = "Dashboard";
            alert("Error recognizing voice: " + event.error);
        };

        try {
            recognition.start();
        } catch(e) { /* already started */ }
    }

    function openSaveModal(amount, stashType) {
        if (navigator.vibrate) navigator.vibrate(50);
        els.saveMgInput.value = amount;
        els.saveMoodInput.value = 3; // Reset default
        
        // Auto select radio
        Array.from(els.saveStashRadios).forEach(radio => {
            radio.checked = (radio.value === stashType);
        });

        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        els.saveTimestampDisplay.textContent = `Today @ ${timeStr}`;

        els.saveModal.classList.remove('hidden');
        if (amount === '') {
            setTimeout(() => els.saveMgInput.focus(), 100);
        }
    }

    els.btnCancelSave.addEventListener('click', () => els.saveModal.classList.add('hidden'));

    els.btnConfirmSave.addEventListener('click', () => {
        const amtStr = els.saveMgInput.value;
        if (!amtStr || isNaN(amtStr) || parseFloat(amtStr) <= 0) {
            alert("Please enter a valid amount.");
            return;
        }

        const amt = parseFloat(amtStr);
        const selectedRadio = Array.from(els.saveStashRadios).find(r => r.checked);
        const stashType = selectedRadio ? selectedRadio.value : 'other';
        const mood = parseInt(els.saveMoodInput.value);

        const now = new Date();

        // Stash Deduction Math
        if (stashType === 'mango') state.stash.mango = Math.max(0, state.stash.mango - (amt / 15.0));
        if (stashType === 'sevenOh') state.stash.sevenOh = Math.max(0, state.stash.sevenOh - (amt / 80.0));

        // Create log entry
        const entry = {
            id: Date.now(),
            timestamp: now.toISOString(),
            amount: amt,
            product: stashType,
            mood: mood
        };

        state.history.push(entry);
        saveData();
        
        els.saveModal.classList.add('hidden');
        updateUI();
        startTimer(); // Reset timer instantly
    });

    // --- TIMELINE ---
    function renderTimeline() {
        els.timelineList.innerHTML = '';
        if (state.history.length === 0) {
            els.timelineList.innerHTML = '<li style="text-align:center; color:var(--text-secondary); margin-top:20px;">No entries logged yet.</li>';
            return;
        }

        // Clone and reverse so newest is on top
        const reversed = [...state.history].reverse();
        
        let lastDateLabel = "";

        reversed.forEach(entry => {
            const d = new Date(entry.timestamp);
            const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            
            // Insert Date Dividers
            if (dateStr !== lastDateLabel) {
                const divider = document.createElement('div');
                divider.style.fontSize = "0.8rem";
                divider.style.color = "var(--text-secondary)";
                divider.style.fontWeight = "600";
                divider.style.marginTop = "10px";
                divider.style.textTransform = "uppercase";
                divider.textContent = dateStr;
                els.timelineList.appendChild(divider);
                lastDateLabel = dateStr;
            }

            const li = document.createElement('li');
            li.className = 'entry-card';

            const prodLabel = entry.product === 'mango' ? 'Mango (15mg)' : entry.product === 'sevenOh' ? '7-OH (80mg)' : 'Other';
            const prodClass = entry.product === 'mango' ? 'prod-mango' : entry.product === 'sevenOh' ? 'prod-7oh' : 'prod-other';

            // Smiley parsing
            const moodEmoji = ['😖','😟','😐','🙂','😁'][entry.mood - 1] || '😐';

            li.innerHTML = `
                <div class="entry-header">
                    <span class="entry-time">${timeStr} &nbsp; <span style="font-size:1.1rem">${moodEmoji}</span></span>
                    <span class="entry-amount">+${formatNum(entry.amount)}<span style="font-size:0.9rem;color:var(--text-secondary)">mg</span></span>
                </div>
                <div class="entry-footer">
                    <span class="entry-product ${prodClass}">${prodLabel}</span>
                    <button class="btn-delete-entry" data-id="${entry.id}">Delete</button>
                </div>
            `;
            els.timelineList.appendChild(li);
        });

        // Bind deletes
        document.querySelectorAll('.btn-delete-entry').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (confirm("Delete this entry entirely?")) {
                    const id = parseInt(e.target.dataset.id);
                    state.history = state.history.filter(h => h.id !== id);
                    saveData();
                    renderTimeline(); // re-render
                    updateUI(); // re-calc dash
                }
            });
        });
    }

    // --- INSIGHTS ENGINE ---
    function calcInsights() {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const last7DaysStr = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        let totalToday = 0;
        let total7Days = 0;
        let countToday = 0;
        let todayTimestamps = [];
        let mgFrequencies = {};

        state.history.forEach(entry => {
            const eDate = entry.timestamp.split('T')[0];
            
            // Mode calc
            mgFrequencies[entry.amount] = (mgFrequencies[entry.amount] || 0) + 1;

            if (eDate === todayStr) {
                totalToday += entry.amount;
                countToday++;
                todayTimestamps.push(new Date(entry.timestamp).getTime());
            }

            if (entry.timestamp >= last7DaysStr) {
                total7Days += entry.amount;
            }
        });

        // 7 Day and Avg
        els.ins7day.textContent = formatNum(total7Days);
        els.insAvg.textContent = formatNum(total7Days / 7.0);

        // Gap calculation
        if (todayTimestamps.length > 1) {
            // Sort ascending
            todayTimestamps.sort((a,b) => a-b);
            let diffSum = 0;
            for(let i=1; i<todayTimestamps.length; i++){
                diffSum += (todayTimestamps[i] - todayTimestamps[i-1]);
            }
            const avgDiff = diffSum / (todayTimestamps.length - 1);
            els.insGap.textContent = formatDuration(avgDiff);
        } else {
            els.insGap.textContent = "N/A";
        }

        // Mode calculation
        let modeMg = 0;
        let maxCount = 0;
        for (const amt in mgFrequencies) {
            if (mgFrequencies[amt] > maxCount) {
                maxCount = mgFrequencies[amt];
                modeMg = amt;
            }
        }
        els.insCommon.textContent = modeMg;

        // Safety Warnings on Header
        if (totalToday > (total7Days / 7.0) && countToday > 1) {
            els.safetyBadge.textContent = "Trending High";
            els.safetyBadge.classList.remove('hidden');
        } else {
            els.safetyBadge.classList.add('hidden');
        }
    }

    // --- UI RENDERING & TIMERS ---
    function updateUI() {
        if (!state.stash) state.stash = {mango:0, sevenOh:0};
        
        els.stashMangoVal.textContent = formatNum(state.stash.mango);
        els.stash7ohVal.textContent = formatNum(state.stash.sevenOh);

        const nowStr = new Date().toISOString().split('T')[0];
        let dashTally = 0;
        state.history.forEach(h => {
             if (h.timestamp.split('T')[0] === nowStr) dashTally += h.amount;
        });
        els.dashTotal.textContent = formatNum(dashTally);
        
        calcInsights(); // silent compute for safety badge
    }

    function startTimer() {
        updateTimerText();
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(updateTimerText, 60000);
    }

    function updateTimerText() {
        if (state.history.length === 0) {
            els.dashTimer.textContent = "No data";
            return;
        }

        // Get very last entry time
        const lastTime = new Date(state.history[state.history.length - 1].timestamp).getTime();
        const diffMs = new Date().getTime() - lastTime;
        
        els.dashTimer.textContent = formatDuration(diffMs);
    }

    // --- SETTINGS / MODALS ---
    els.btnOpenEditStash.addEventListener('click', () => {
        els.editMangoInput.value = formatNum(state.stash.mango);
        els.edit7ohInput.value = formatNum(state.stash.sevenOh);
        els.editStashModal.classList.remove('hidden');
    });

    els.btnCloseStash.addEventListener('click', () => els.editStashModal.classList.add('hidden'));

    els.btnSaveStash.addEventListener('click', () => {
        const nm = parseFloat(els.editMangoInput.value);
        const ns = parseFloat(els.edit7ohInput.value);
        if (!isNaN(nm) && nm >= 0) state.stash.mango = nm;
        if (!isNaN(ns) && ns >= 0) state.stash.sevenOh = ns;
        saveData();
        updateUI();
        els.editStashModal.classList.add('hidden');
    });

    els.btnExport.addEventListener('click', () => {
        if (state.history.length === 0) return alert("Nothing to export yet.");
        let csv = "Date,Time,Amount_mg,Product,Mood_1_to_5\n";
        state.history.forEach(h => {
            const d = new Date(h.timestamp);
            const dStr = d.toLocaleDateString();
            const tStr = d.toLocaleTimeString();
            csv += `"${dStr}","${tStr}",${h.amount},"${h.product}",${h.mood}\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dose_tracker_export_${new Date().getTime()}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    });

    els.btnForceUpdate.addEventListener('click', () => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
                for(let registration of registrations) {
                    registration.unregister();
                }
            });
        }
        alert("Cache cleared. The app will now reload.");
        window.location.reload(true);
    });

    els.btnWipe.addEventListener('click', () => {
        if(confirm("CRITICAL WARNING: This will delete ALL history and stash counts permanently. Are you absolutely sure?")) {
            localStorage.removeItem(STORAGE_KEY);
            alert("App Factory Reset Complete. Refreshing...");
            window.location.reload();
        }
    });

    // --- UTILS ---
    function formatNum(n) {
        return n % 1 === 0 ? n : parseFloat(n).toFixed(2);
    }

    function formatDuration(ms) {
        if (ms < 60000) return "Just now";
        const hrs = Math.floor(ms / (1000 * 60 * 60));
        const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hrs > 24) {
             const days = Math.floor(hrs / 24);
             return `${days}d ${hrs % 24}h`;
        }
        return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    }

    init();

    // Register Service Worker map
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js');
        });
    }
});
