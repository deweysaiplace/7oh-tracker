document.addEventListener('DOMContentLoaded', () => {
    // Application State
    let state = {
        strength: 20, // mg total per whole tablet
        dailyTally: 0,
        mode: 'split', // 'split' or 'consume'
        currentDate: new Date().toISOString().split('T')[0],
        tabletPieces: [] // Items inside: 'whole', 'half-left', 'half-right', 'fourth-top-left', 'fourth-bottom-left', 'fourth-top-right', 'fourth-bottom-right'
    };

    // DOM Elements
    const elements = {
        totalEl: document.getElementById('daily-total'),
        strengthBtns: document.querySelectorAll('.strength-btn'),
        modeSplitBtn: document.getElementById('mode-split'),
        modeConsumeBtn: document.getElementById('mode-consume'),
        tabletContainer: document.getElementById('tablet-container'),
        addTabletBtn: document.getElementById('add-tablet-btn'),
        historyList: document.getElementById('history-list'),
        clearHistoryBtn: document.getElementById('clear-history-btn')
    };

    // Initialization
    loadData();
    updateUI();

    // Event Listeners
    elements.strengthBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            elements.strengthBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.strength = parseInt(e.target.dataset.val);
            saveData();
        });
    });

    elements.modeSplitBtn.addEventListener('click', () => setMode('split'));
    elements.modeConsumeBtn.addEventListener('click', () => setMode('consume'));

    elements.addTabletBtn.addEventListener('click', () => {
        if (state.tabletPieces.length === 0) {
            state.tabletPieces = ['whole'];
            renderTablet();
            saveData();
        }
    });

    elements.clearHistoryBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all history?')) {
            localStorage.removeItem('7oh_history');
            localStorage.removeItem('7oh_state');
            state.dailyTally = 0;
            state.tabletPieces = [];
            state.mode = 'split';
            saveData();
            updateUI();
        }
    });

    // Core Application Logic
    function setMode(mode) {
        state.mode = mode;
        if (mode === 'split') {
            elements.modeSplitBtn.classList.add('active');
            elements.modeConsumeBtn.classList.remove('active');
        } else {
            elements.modeSplitBtn.classList.remove('active');
            elements.modeConsumeBtn.classList.add('active');
        }
        saveData();
    }

    function renderTablet() {
        elements.tabletContainer.innerHTML = '';
        elements.addTabletBtn.disabled = state.tabletPieces.length > 0;

        state.tabletPieces.forEach(piece => {
            const div = document.createElement('div');
            div.className = `tablet-piece tablet-${piece}`;
            div.dataset.piece = piece;

            div.addEventListener('click', () => handlePieceClick(piece, div));

            elements.tabletContainer.appendChild(div);
        });
    }

    function handlePieceClick(piece, element) {
        if (state.mode === 'split') {
            splitPiece(piece, element);
        } else if (state.mode === 'consume') {
            consumePiece(piece, element);
        }
    }

    function splitPiece(piece, element) {
        if (piece.startsWith('fourth')) {
            // Cannot split a fourth any further. Automatically trigger consume logic instead to be helpful?
            // Or just do nothing.
            return;
        }

        element.classList.add('splitting');

        setTimeout(() => {
            state.tabletPieces = state.tabletPieces.filter(p => p !== piece);

            if (piece === 'whole') {
                state.tabletPieces.push('half-left', 'half-right');
            } else if (piece === 'half-left') {
                state.tabletPieces.push('fourth-top-left', 'fourth-bottom-left');
            } else if (piece === 'half-right') {
                state.tabletPieces.push('fourth-top-right', 'fourth-bottom-right');
            }

            saveData();
            renderTablet();
        }, 150); // Small delay to show the quick splitting animation
    }

    function consumePiece(piece, element) {
        // Calculate mg to add based on current global strength setting.
        // It's assumed the user sets total strength they purchased, and slices divide that.
        let amount = 0;
        if (piece === 'whole') amount = state.strength;
        else if (piece.startsWith('half')) amount = state.strength / 2;
        else if (piece.startsWith('fourth')) amount = state.strength / 4;

        // Visual animation
        element.classList.add('consuming');

        setTimeout(() => {
            state.tabletPieces = state.tabletPieces.filter(p => p !== piece);
            state.dailyTally += amount;

            // Add to history log
            const history = getHistory();
            history.push({
                timestamp: new Date().toISOString(),
                amount: amount
            });
            localStorage.setItem('7oh_history', JSON.stringify(history));

            // Revert mode back to split if nothing is left to save steps
            if (state.tabletPieces.length === 0 && state.mode === 'consume') {
                setMode('split');
            }

            saveData();
            updateUI();
        }, 300); // Wait for consume animation
    }

    function checkDayWrap() {
        const today = new Date().toISOString().split('T')[0];
        if (state.currentDate !== today) {
            // New day detected. Reset tally.
            state.currentDate = today;
            state.dailyTally = 0;
            saveData();
        }
    }

    function loadData() {
        const saved = localStorage.getItem('7oh_state');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                state = { ...state, ...parsed };
            } catch (e) {
                console.error("Failed to parse state", e);
            }
        }
        checkDayWrap();
    }

    function saveData() {
        localStorage.setItem('7oh_state', JSON.stringify(state));
    }

    function getHistory() {
        const h = localStorage.getItem('7oh_history');
        return h ? JSON.parse(h) : [];
    }

    function updateUI() {
        // Format daily tally
        elements.totalEl.textContent = state.dailyTally % 1 === 0 ? state.dailyTally : state.dailyTally.toFixed(1);

        // Sync strength buttons
        elements.strengthBtns.forEach(btn => {
            if (parseInt(btn.dataset.val) === state.strength) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Sync mode
        setMode(state.mode);

        // Render tablet pieces
        renderTablet();

        // Render history
        const history = getHistory();
        elements.historyList.innerHTML = '';
        if (history.length === 0) {
            elements.historyList.innerHTML = '<li class="history-item history-empty">No history logs yet</li>';
        } else {
            [...history].reverse().forEach(entry => {
                const li = document.createElement('li');
                li.className = 'history-item';

                const entryDate = new Date(entry.timestamp);
                const isToday = entryDate.toDateString() === new Date().toDateString();

                const timeOptions = { hour: 'numeric', minute: '2-digit' };
                const dateOptions = { month: 'short', day: 'numeric' };

                const timeString = entryDate.toLocaleTimeString(undefined, timeOptions);
                const dateString = isToday ? 'Today' : entryDate.toLocaleDateString(undefined, dateOptions);

                const dateSpan = document.createElement('span');
                dateSpan.className = 'history-date';
                dateSpan.textContent = `${dateString} at ${timeString}`;

                const amtSpan = document.createElement('span');
                amtSpan.className = 'history-amount';
                amtSpan.textContent = `+${entry.amount % 1 === 0 ? entry.amount : entry.amount.toFixed(1)} mg`;

                li.appendChild(dateSpan);
                li.appendChild(amtSpan);
                elements.historyList.appendChild(li);
            });
        }
    }

    // Register Service Worker for offline PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(err => {
                console.log('SW Registration failed: ', err);
            });
        });
    }
});
