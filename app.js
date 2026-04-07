document.addEventListener('DOMContentLoaded', () => {
    
    // --- APP STATE ---
    const STORAGE_KEY = 'dose_tracker_v3_data';
    let state = {
        inventory: [
            { id: 'mango', name: 'Mango', sizeMg: 15.0, count: 25.0, color: '#f59e0b' },
            { id: 'sevenOh', name: '7-OH', sizeMg: 80.0, count: 45.0, color: '#8b5cf6' }
        ],
        history: [], // Array of entry objects
        presets: [
            { label: '7.5', sub: 'Mango (1/2)', val: 7.5, type: 'mango' },
            { label: '15', sub: 'Mango (Whole)', val: 15, type: 'mango' },
            { label: '20', sub: '7-OH (1/4)', val: 20, type: 'sevenOh' },
            { label: '40', sub: '7-OH (1/2)', val: 40, type: 'sevenOh' },
            { label: '80', sub: '7-OH (Whole)', val: 80, type: 'sevenOh' }
        ]
    };

    const COLOR_PALETTE = ['#3b82f6', '#10b981', '#ec4899', '#f43f5e', '#8b5cf6', '#eab308'];

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
        dynamicStashGrid: document.getElementById('dynamic-stash-grid'),

        // Save Modal
        saveModal: document.getElementById('save-flow-modal'),
        saveMgInput: document.getElementById('save-mg-input'),
        dynamicSaveRadios: document.getElementById('dynamic-save-radios'),
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
        inventoryListContainer: document.getElementById('inventory-list-container'),
        newProdName: document.getElementById('new-prod-name'),
        newProdMg: document.getElementById('new-prod-mg'),
        newProdCount: document.getElementById('new-prod-count'),
        btnAddProduct: document.getElementById('btn-add-product'),
        btnCloseStash: document.getElementById('close-stash-modal'),
        btnScanLabel: document.getElementById('btn-scan-label'),
        cameraInput: document.getElementById('camera-input'),

        // Export/Wipe
        btnExport: document.getElementById('btn-export-csv'),
        btnForceUpdate: document.getElementById('btn-force-update'),
        btnWipe: document.getElementById('btn-wipe-data'),
    };

    let timerInterval = null;

    // --- INITIALIZATION ---
    function init() {
        // V3 Wipe Protection
        if (localStorage.getItem('dose_tracker_v2_data') || localStorage.getItem('7oh_history')) {
            localStorage.removeItem('dose_tracker_v2_data');
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

        const customBtn = document.createElement('div');
        customBtn.className = 'preset-btn custom-btn';
        customBtn.innerHTML = `<span class="preset-val">+</span><span class="preset-lbl">Custom</span>`;
        customBtn.addEventListener('click', () => openSaveModal('', 'other'));
        els.presetGrid.appendChild(customBtn);

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

        els.headerTitle.textContent = "🎙️ Listening...";

        recognition.onresult = (event) => {
            const speechResult = event.results[0][0].transcript.toLowerCase();
            els.headerTitle.textContent = "Dashboard";
            
            let productStr = 'other';
            let amountVal = '';
            let baseSize = 80;
            
            // 1. Dynamic Product Matching
            let foundMatch = false;
            for (const item of state.inventory) {
                if (speechResult.includes(item.name.toLowerCase())) {
                    productStr = item.id;
                    baseSize = item.sizeMg;
                    foundMatch = true;
                    break;
                }
            }
            
            // Fallbacks
            if (!foundMatch) {
                if (speechResult.includes('mango')) { productStr = 'mango'; baseSize = 15; }
                else if (speechResult.match(/7[-\s]?oh/) || speechResult.match(/seven[-\s]?oh/) || speechResult.includes('tab')) { productStr = 'sevenOh'; baseSize = 80; }
            }

            // 2. Identify Amount
            const mgMatch = speechResult.match(/(\d+(\.\d+)?)\s*(mg|milligram)/);
            if (mgMatch) {
                amountVal = parseFloat(mgMatch[1]);
            } else {
                let multiplier = 0;
                if (speechResult.match(/quarter|1\/4/)) multiplier = 0.25;
                if (speechResult.match(/half|1\/2/)) multiplier = 0.5;
                if (speechResult.match(/whole|full/)) multiplier = 1.0;

                if (multiplier > 0) amountVal = baseSize * multiplier;
            }

            openSaveModal(amountVal, productStr);
        };

        recognition.onspeechend = () => { recognition.stop(); els.headerTitle.textContent = "Dashboard"; };
        recognition.onerror = (event) => { console.error(event); els.headerTitle.textContent = "Dashboard"; alert("Error: " + event.error); };

        try { recognition.start(); } catch(e) {}
    }

    function openSaveModal(amount, stashType) {
        if (navigator.vibrate) navigator.vibrate(50);
        els.saveMgInput.value = amount;
        els.saveMoodInput.value = 3; 
        
        // Auto select radio
        const radios = els.dynamicSaveRadios.querySelectorAll('input[type="radio"]');
        let matched = false;
        radios.forEach(radio => {
            if(radio.value === stashType){
                radio.checked = true;
                matched = true;
            } else {
                radio.checked = false;
            }
        });
        
        // Fallback to 'other'
        if(!matched) {
            const otherRadio = els.dynamicSaveRadios.querySelector('input[value="other"]');
            if(otherRadio) otherRadio.checked = true;
        }

        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        els.saveTimestampDisplay.textContent = `Today @ ${timeStr}`;

        els.saveModal.classList.remove('hidden');
        if (amount === '') setTimeout(() => els.saveMgInput.focus(), 100);
    }

    els.btnCancelSave.addEventListener('click', () => els.saveModal.classList.add('hidden'));

    els.btnConfirmSave.addEventListener('click', () => {
        const amtStr = els.saveMgInput.value;
        if (!amtStr || isNaN(amtStr) || parseFloat(amtStr) <= 0) {
            return alert("Please enter a valid amount.");
        }

        const amt = parseFloat(amtStr);
        const selectedRadio = els.dynamicSaveRadios.querySelector('input[type="radio"]:checked');
        const stashType = selectedRadio ? selectedRadio.value : 'other';
        const mood = parseInt(els.saveMoodInput.value);
        const now = new Date();

        // Dynamic Stash Deduction Math
        if (stashType !== 'other') {
            const invIndex = state.inventory.findIndex(inv => inv.id === stashType);
            if (invIndex >= 0) {
                const pillsTaken = amt / state.inventory[invIndex].sizeMg;
                state.inventory[invIndex].count = Math.max(0, state.inventory[invIndex].count - pillsTaken);
            }
        }

        const entry = { id: Date.now(), timestamp: now.toISOString(), amount: amt, product: stashType, mood: mood };
        state.history.push(entry);
        saveData();
        
        els.saveModal.classList.add('hidden');
        updateUI();
        startTimer(); 
    });

    // --- TIMELINE ---
    function renderTimeline() {
        els.timelineList.innerHTML = '';
        if (state.history.length === 0) {
            els.timelineList.innerHTML = '<li style="text-align:center; color:var(--text-secondary); margin-top:20px;">No entries logged yet.</li>';
            return;
        }

        const reversed = [...state.history].reverse();
        let lastDateLabel = "";

        reversed.forEach(entry => {
            const d = new Date(entry.timestamp);
            const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            
            if (dateStr !== lastDateLabel) {
                const divider = document.createElement('div');
                divider.style.fontSize = "0.8rem"; divider.style.color = "var(--text-secondary)";
                divider.style.fontWeight = "600"; divider.style.marginTop = "10px"; divider.style.textTransform = "uppercase";
                divider.textContent = dateStr;
                els.timelineList.appendChild(divider);
                lastDateLabel = dateStr;
            }

            const li = document.createElement('li');
            li.className = 'entry-card';

            // Find Product Info dynamically
            let prodLabel = 'Other';
            let hexColor = '#ffffff';
            if (entry.product !== 'other') {
                const invItem = state.inventory.find(i => i.id === entry.product);
                if (invItem) {
                    prodLabel = invItem.name;
                    hexColor = invItem.color;
                }
            }

            const moodEmoji = ['😖','😟','😐','🙂','😁'][entry.mood - 1] || '😐';

            li.innerHTML = `
                <div class="entry-header">
                    <span class="entry-time">${timeStr} &nbsp; <span style="font-size:1.1rem">${moodEmoji}</span></span>
                    <span class="entry-amount">+${formatNum(entry.amount)}<span style="font-size:0.9rem;color:var(--text-secondary)">mg</span></span>
                </div>
                <div class="entry-footer">
                    <span class="entry-product" style="background:${hexColor}20; color:${hexColor}">${prodLabel}</span>
                    <button class="btn-delete-entry" data-id="${entry.id}">Delete</button>
                </div>
            `;
            els.timelineList.appendChild(li);
        });

        document.querySelectorAll('.btn-delete-entry').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (confirm("Delete this entry entirely?")) {
                    const id = parseInt(e.target.dataset.id);
                    state.history = state.history.filter(h => h.id !== id);
                    saveData();
                    renderTimeline(); 
                    updateUI(); 
                }
            });
        });
    }

    // --- INSIGHTS ENGINE ---
    function calcInsights() {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const last7DaysStr = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        let totalToday = 0; let total7Days = 0; let countToday = 0;
        let todayTimestamps = []; let mgFrequencies = {};

        state.history.forEach(entry => {
            const eDate = entry.timestamp.split('T')[0];
            mgFrequencies[entry.amount] = (mgFrequencies[entry.amount] || 0) + 1;

            if (eDate === todayStr) {
                totalToday += entry.amount;
                countToday++;
                todayTimestamps.push(new Date(entry.timestamp).getTime());
            }

            if (entry.timestamp >= last7DaysStr) total7Days += entry.amount;
        });

        els.ins7day.textContent = formatNum(total7Days);
        els.insAvg.textContent = formatNum(total7Days / 7.0);

        if (todayTimestamps.length > 1) {
            todayTimestamps.sort((a,b) => a-b);
            let diffSum = 0;
            for(let i=1; i<todayTimestamps.length; i++){
                diffSum += (todayTimestamps[i] - todayTimestamps[i-1]);
            }
            els.insGap.textContent = formatDuration(diffSum / (todayTimestamps.length - 1));
        } else {
            els.insGap.textContent = "N/A";
        }

        let modeMg = 0; let maxCount = 0;
        for (const amt in mgFrequencies) {
            if (mgFrequencies[amt] > maxCount) {
                maxCount = mgFrequencies[amt];
                modeMg = amt;
            }
        }
        els.insCommon.textContent = modeMg;

        if (totalToday > (total7Days / 7.0) && countToday > 1) {
            els.safetyBadge.textContent = "Trending High";
            els.safetyBadge.classList.remove('hidden');
        } else {
            els.safetyBadge.classList.add('hidden');
        }
    }

    // --- UI RENDERING & TIMERS ---
    function updateUI() {
        // Render Dynamic Stash Grid
        els.dynamicStashGrid.innerHTML = '';
        state.inventory.forEach(inv => {
            const box = document.createElement('div');
            box.className = 'stash-box';
            box.style.borderBottom = `3px solid ${inv.color}`;
            box.innerHTML = `
                <span class="stash-name">${inv.name} (${inv.sizeMg}mg)</span>
                <span class="stash-count">${formatNum(inv.count)} <span style="font-size:0.85rem; font-weight:500; color:var(--text-secondary)">pills</span></span>
            `;
            els.dynamicStashGrid.appendChild(box);
        });

        // Render Dynamic Save Radios
        els.dynamicSaveRadios.innerHTML = '';
        state.inventory.forEach(inv => {
            const lbl = document.createElement('label');
            lbl.style.minWidth = '45%';
            lbl.innerHTML = `
                <input type="radio" name="save_stash_type" value="${inv.id}">
                <span class="radio-btn">${inv.name} (${inv.sizeMg}mg)</span>
            `;
            els.dynamicSaveRadios.appendChild(lbl);
        });
        // Add "Other" radio
        const lblOther = document.createElement('label');
        lblOther.style.minWidth = '45%';
        lblOther.innerHTML = `<input type="radio" name="save_stash_type" value="other" checked><span class="radio-btn">Other</span>`;
        els.dynamicSaveRadios.appendChild(lblOther);

        // Daily Tally
        const nowStr = new Date().toISOString().split('T')[0];
        let dashTally = 0;
        state.history.forEach(h => {
             if (h.timestamp.split('T')[0] === nowStr) dashTally += h.amount;
        });
        els.dashTotal.textContent = formatNum(dashTally);
        
        calcInsights();
    }

    function startTimer() {
        updateTimerText();
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(updateTimerText, 60000);
    }

    function updateTimerText() {
        if (state.history.length === 0) { els.dashTimer.textContent = "No data"; return; }
        const lastTime = new Date(state.history[state.history.length - 1].timestamp).getTime();
        els.dashTimer.textContent = formatDuration(new Date().getTime() - lastTime);
    }

    // --- INVENTORY MANAGER (SETTINGS) ---
    els.btnOpenEditStash.addEventListener('click', () => {
        renderInventoryManager();
        els.editStashModal.classList.remove('hidden');
    });

    els.btnCloseStash.addEventListener('click', () => {
        saveData();
        updateUI();
        els.editStashModal.classList.add('hidden');
    });

    function renderInventoryManager() {
        els.inventoryListContainer.innerHTML = '';
        if (state.inventory.length === 0) els.inventoryListContainer.innerHTML = '<p style="color:var(--text-secondary); font-size:0.9rem;">No products configured.</p>';
        
        state.inventory.forEach((inv, index) => {
            const row = document.createElement('div');
            row.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:12px; margin-bottom:8px; border-radius:12px; border:1px solid var(--surface-border); box-sizing:border-box;";
            
            row.innerHTML = `
                <div>
                    <div style="font-weight:600; color:${inv.color}; font-size:0.9rem;">${inv.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">${inv.sizeMg}mg per pill</div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <input type="number" class="live-inv-input" data-index="${index}" value="${formatNum(inv.count)}" style="width:70px; background:var(--bg-color); border:1px solid var(--surface-border); border-radius:8px; padding:8px; color:white; font-family:'Outfit'; text-align:center;">
                    <button class="btn-del-inv" data-index="${index}" style="background:transparent; border:none; color:var(--danger-color); cursor:pointer; font-weight:bold; font-size:1.2rem; padding:4px;">&times;</button>
                </div>
            `;
            els.inventoryListContainer.appendChild(row);
        });

        // Bind live live inputs
        document.querySelectorAll('.live-inv-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index);
                const val = parseFloat(e.target.value);
                if(!isNaN(val) && val >= 0) {
                    state.inventory[idx].count = val;
                }
            });
        });

        // Bind delete buttons
        document.querySelectorAll('.btn-del-inv').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if(confirm("Remove this product type completely?")) {
                    const idx = parseInt(e.target.dataset.index);
                    state.inventory.splice(idx, 1);
                    renderInventoryManager(); // re-render list
                }
            });
        });
    }

    els.btnAddProduct.addEventListener('click', () => {
        const name = els.newProdName.value.trim();
        const mg = parseFloat(els.newProdMg.value);
        const count = parseFloat(els.newProdCount.value);

        if (!name || isNaN(mg) || mg <= 0 || isNaN(count) || count < 0) {
            return alert("Please provide a valid name, size in mg, and starting count.");
        }

        const idStr = name.replace(/\s+/g, '').toLowerCase() + Date.now();
        const randomColor = COLOR_PALETTE[state.inventory.length % COLOR_PALETTE.length];

        state.inventory.push({
            id: idStr,
            name: name,
            sizeMg: mg,
            count: count,
            color: randomColor
        });

        // Reset fields
        els.newProdName.value = '';
        els.newProdMg.value = '';
        els.newProdCount.value = '';
        
        renderInventoryManager(); 
    });

    // --- SYSTEM EXPORT/WIPE ---
    
    // Camera OCR
    els.btnScanLabel.addEventListener('click', () => {
        if (typeof Tesseract === 'undefined') {
            return alert("Scanner engine is still downloading in the background. Check your airplane mode or try again in a few seconds.");
        }
        els.cameraInput.click();
    });

    els.cameraInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        els.btnScanLabel.textContent = "⏳ Scanning...";
        els.btnScanLabel.disabled = true;

        try {
            const { data: { text } } = await Tesseract.recognize(file, 'eng');
            
            // Console log to help user debug their bottle text
            console.log("OCR Result Block: ", text);

            const mgMatch = text.match(/([\d.]+)\s*(mg|milligram)/i);
            if (mgMatch) els.newProdMg.value = mgMatch[1];

            const countMatch = text.match(/([\d]+)\s*(capsules|caps|tablets|tabs|pills|count|ct|gummies|pieces|pcs)/i);
            if (countMatch) els.newProdCount.value = countMatch[1];

            alert("Scan complete! I found some numbers. Please fill in the Product Name manually.");
            els.newProdName.focus();
        } catch (error) {
            console.error(error);
            alert("Scanner error. Please input manually.");
        } finally {
            els.btnScanLabel.textContent = "📷 Scan Label";
            els.btnScanLabel.disabled = false;
            els.cameraInput.value = "";
        }
    });

    els.btnExport.addEventListener('click', () => {
        if (state.history.length === 0) return alert("Nothing to export yet.");
        let csv = "Date,Time,Amount_mg,ProductID,Mood_1_to_5\n";
        state.history.forEach(h => {
            const d = new Date(h.timestamp);
            csv += `"${d.toLocaleDateString()}","${d.toLocaleTimeString()}",${h.amount},"${h.product}",${h.mood}\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `dose_tracker_export_${new Date().getTime()}.csv`;
        document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url);
    });

    els.btnForceUpdate.addEventListener('click', () => {
        if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
        alert("Cache cleared. App will reload.");
        window.location.reload(true);
    });

    els.btnWipe.addEventListener('click', () => {
        if(confirm("CRITICAL WARNING: This completely wipes ALL logs and inventory settings. Are you absolutely sure?")) {
            localStorage.removeItem(STORAGE_KEY);
            alert("App Factory Reset Complete. Refreshing...");
            window.location.reload();
        }
    });

    // --- UTILS ---
    function formatNum(n) { return n % 1 === 0 ? n : parseFloat(n).toFixed(2); }
    function formatDuration(ms) {
        if (ms < 60000) return "Just now";
        const hrs = Math.floor(ms / (1000 * 60 * 60));
        const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        if (hrs > 24) return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
        return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    }

    init();

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
    }
});
