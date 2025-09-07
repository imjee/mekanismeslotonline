document.addEventListener('DOMContentLoaded', () => {
    // ==================================
    // KONFIGURASI GAME & SUARA
    // ==================================
    const CONFIG = {
        GRID_SIZE: 6 * 5, MIN_WIN_COUNT: 8, SCATTER_TRIGGER_COUNT: 4,
        FREE_SPINS_AWARDED: 15, BUY_FS_COST_MULTIPLIER: 100,
        BET_LEVELS: [100, 200, 500, 1000, 2500, 5000],
        ANIMATION_DELAY: { WIN_DISPLAY: 800, DISAPPEAR: 300, FALL: 500 }
    };

    /*
    // SUARA DINONAKTIFKAN UNTUK MENGHINDARI ERROR 'STUCK'
    // Untuk mengaktifkan, hapus komentar ini dan sediakan file MP3.
    const SOUNDS = {
        spin: new Audio('spin.mp3'),
        win: new Audio('win.mp3'),
        tumble: new Audio('tumble.mp3'),
        freespin_intro: new Audio('freespin_intro.mp3'),
        big_win: new Audio('big_win.mp3')
    };
    */

    const SIMBOL = {
        '🐵': { value: 0.25 }, '🦓': { value: 0.4 }, '🦒': { value: 0.5 },
        '🐘': { value: 0.8 }, '🦁': { value: 1 }, '🦜': { value: 2 },
        'SCATTER': { value: 0, isSpecial: true },
        'MULTIPLIER': { value: 0, isSpecial: true }
    };
    const REGULAR_SYMBOLS = Object.keys(SIMBOL).filter(k => !SIMBOL[k].isSpecial);
    const MULTIPLIER_VALUES = [2, 3, 4, 5, 8, 10, 12, 15, 20, 25, 50, 100];

    // ==================================
    // ELEMEN DOM
    // ==================================
    const gameContainer = document.querySelector('.game-container');
    const monkeyMascot = document.getElementById('monkey-mascot');
    const grid = document.getElementById('slot-grid');
    const balanceDisplay = document.getElementById('balance');
    const betAmountInput = document.getElementById('bet-amount');
    const spinButton = document.getElementById('spin-button');
    const increaseBetBtn = document.getElementById('increase-bet');
    const decreaseBetBtn = document.getElementById('decrease-bet');
    const buyFsBtn = document.getElementById('buy-fs-button');
    const buyFsCostDisplay = document.getElementById('buy-fs-cost');
    const freeSpinsDisplay = document.getElementById('free-spins-display');
    const freeSpinsCount = document.getElementById('free-spins-count');
    const totalWinSplash = document.getElementById('total-win-splash');
    const totalWinAmount = document.getElementById('total-win-amount');

    // ==================================
    // STATUS GAME
    // ==================================
    let state = {
        balance: 10000, currentBetIndex: 0, isSpinning: false,
        isInFreeSpins: false, freeSpinsRemaining: 0,
        currentTumbleWin: 0, gridState: []
    };
    
    // ==================================
    // FUNGSI UTAMA
    // ==================================

    async function handleSpin() {
        if (state.isSpinning) return;
        const currentBet = CONFIG.BET_LEVELS[state.currentBetIndex];
        if (!state.isInFreeSpins && state.balance < currentBet) {
            alert("Saldo tidak cukup!"); return;
        }
        
        startSpin();
        
        if (!state.isInFreeSpins) {
            state.balance -= currentBet;
            updateBalanceDisplay();
        } else {
            state.freeSpinsRemaining--;
            updateFreeSpinsDisplay();
        }

        const newGrid = [];
        for (let i = 0; i < CONFIG.GRID_SIZE; i++) {
            newGrid.push(generateRandomSymbol());
        }
        state.gridState = newGrid;

        await renderGrid(true);
        await processTumbles();
        endSpin();
    }

    async function processTumbles() {
        const { wins, totalMultiplier, multiplierSymbols } = calculateWins(state.gridState);
        if (wins.length === 0) return;

        // playSound('win');
        const winAmount = wins.reduce((total, win) => total + (SIMBOL[win.symbol].value * win.count), 0);
        const finalWin = winAmount * totalMultiplier * CONFIG.BET_LEVELS[state.currentBetIndex];
        state.currentTumbleWin += finalWin;
        state.balance += finalWin;
        
        updateBalanceDisplay();
        
        if (wins.length > 0 && multiplierSymbols.length > 0) {
            await animateMultipliers(multiplierSymbols);
        }
        
        showWinOnGrid(wins.map(w => w.indices).flat(), multiplierSymbols.map(m => m.index));
        await delay(CONFIG.ANIMATION_DELAY.WIN_DISPLAY);
        await disappearAndTumble(wins.map(w => w.indices).flat());
        await processTumbles();
    }
    
    function handleBuyFreeSpins() {
        if (state.isSpinning) return;
        const cost = CONFIG.BET_LEVELS[state.currentBetIndex] * CONFIG.BUY_FS_COST_MULTIPLIER;
        if (state.balance < cost) {
            alert("Saldo tidak cukup untuk membeli Free Spins!");
            return;
        }
        state.balance -= cost;
        updateBalanceDisplay();
        enterFreeSpins(true);
    }

    function checkFreeSpinsTrigger() {
        const scatters = state.gridState.filter(s => s.type === 'SCATTER').length;
        if (scatters >= CONFIG.SCATTER_TRIGGER_COUNT) {
            if(!state.isInFreeSpins) triggerScreenShake();
            enterFreeSpins();
        }
    }
    
    function calculateWins(currentGrid) {
        const symbolCounts = {};
        let totalMultiplier = 1;
        const multipliersOnScreen = [];
        const scatters = [];

        currentGrid.forEach((symbol, index) => {
            if (symbol.type === 'MULTIPLIER') {
                multipliersOnScreen.push({ ...symbol, index });
            } else if (symbol.type === 'SCATTER') {
                scatters.push(index);
            } else {
                if (!symbolCounts[symbol.type]) {
                    symbolCounts[symbol.type] = { count: 0, indices: [] };
                }
                symbolCounts[symbol.type].count++;
                symbolCounts[symbol.type].indices.push(index);
            }
        });

        const wins = Object.entries(symbolCounts)
            .filter(([_, data]) => data.count >= CONFIG.MIN_WIN_COUNT)
            .map(([symbol, data]) => ({ symbol, ...data }));
            
        if (wins.length > 0) {
            const multiplierSum = multipliersOnScreen.reduce((total, m) => total + m.value, 0);
            totalMultiplier = multiplierSum > 1 ? multiplierSum : 1;
        }

        return { wins, totalMultiplier, scatters, multiplierSymbols: multipliersOnScreen };
    }

    async function disappearAndTumble(winningIndices) {
        // playSound('tumble');
        const gridElements = Array.from(grid.children);
        winningIndices.forEach(i => gridElements[i].classList.add('disappearing'));
        await delay(CONFIG.ANIMATION_DELAY.DISAPPEAR);
        const newGridState = [...state.gridState];
        winningIndices.forEach(i => newGridState[i] = null);
        for (let col = 0; col < 6; col++) {
            let emptySpaces = 0;
            for (let row = 4; row >= 0; row--) {
                const index = row * 6 + col;
                if (newGridState[index] === null) {
                    emptySpaces++;
                } else if (emptySpaces > 0) {
                    newGridState[index + emptySpaces * 6] = newGridState[index];
                    newGridState[index] = null;
                }
            }
        }
        for (let i = 0; i < newGridState.length; i++) {
            if (newGridState[i] === null) {
                newGridState[i] = generateRandomSymbol();
            }
        }
        state.gridState = newGridState;
        await renderGrid(false);
    }
    
    /*
    // FUNGSI SUARA DINONAKTIFKAN
    function playSound(soundName) {
        const audio = SOUNDS[soundName];
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.log(`Audio error for ${soundName}:`, e));
        }
    }
    */

    function triggerScreenShake() {
        gameContainer.classList.add('shake');
        setTimeout(() => gameContainer.classList.remove('shake'), 400);
    }

    async function animateMultipliers(multiplierSymbols) {
        const targetRect = totalWinSplash.getBoundingClientRect();
        const targetX = targetRect.left + targetRect.width / 2;
        const targetY = targetRect.top + targetRect.height / 2;

        multiplierSymbols.forEach(symbolData => {
            const el = grid.children[symbolData.index];
            const startRect = el.getBoundingClientRect();
            
            const flyEl = document.createElement('div');
            flyEl.className = 'multiplier-fly';
            flyEl.textContent = symbolData.content;
            flyEl.style.left = `${startRect.left}px`;
            flyEl.style.top = `${startRect.top}px`;

            document.body.appendChild(flyEl);
            
            flyEl.style.setProperty('--target-x', `${targetX - startRect.left}px`);
            flyEl.style.setProperty('--target-y', `${targetY - startRect.top}px`);
            
            setTimeout(() => flyEl.remove(), 1000);
        });
        
        await delay(1000);
    }
    
    function endSpin() {
        if (state.currentTumbleWin > 0) {
            // playSound('big_win');
            totalWinAmount.textContent = state.currentTumbleWin.toLocaleString();
            totalWinSplash.classList.remove('hidden');
            totalWinSplash.classList.add('visible');
        }

        checkFreeSpinsTrigger();

        // ===============================================
        // INI ADALAH FUNGSI DENGAN LOGIKA YANG DIPERBAIKI
        // ===============================================
        if (state.isInFreeSpins && state.freeSpinsRemaining > 0) {
            setTimeout(handleSpin, state.currentTumbleWin > 0 ? 2000 : 1000);
        } else {
            if (state.isInFreeSpins) exitFreeSpins();
            
            state.isSpinning = false;
            spinButton.disabled = false;
            buyFsBtn.disabled = false;
        }
    }

    function enterFreeSpins(isBought = false) {
        if (state.isInFreeSpins) {
            state.freeSpinsRemaining += 5;
            updateFreeSpinsDisplay();
            return;
        }
        // playSound('freespin_intro');
        state.isInFreeSpins = true;
        state.freeSpinsRemaining = CONFIG.FREE_SPINS_AWARDED;
        freeSpinsDisplay.style.display = 'block';
        document.body.classList.add('free-spins-active');
        monkeyMascot.classList.add('excited');
        updateFreeSpinsDisplay();
        
        if (isBought) {
            // Saat membeli, kita reset dulu status isSpinning
            // lalu panggil handleSpin
            state.isSpinning = false;
            setTimeout(handleSpin, 500);
        }
    }

    function exitFreeSpins() {
        state.isInFreeSpins = false;
        freeSpinsDisplay.style.display = 'none';
        document.body.classList.remove('free-spins-active');
        monkeyMascot.classList.remove('excited');
    }

    const delay = ms => new Promise(res => setTimeout(res, ms));
    
    function init() {
        updateBetDisplay(); updateBalanceDisplay(); createInitialGrid();
        spinButton.addEventListener('click', handleSpin);
        buyFsBtn.addEventListener('click', handleBuyFreeSpins);
        increaseBetBtn.addEventListener('click', () => changeBet(1));
        decreaseBetBtn.addEventListener('click', () => changeBet(-1));
    }

    function createInitialGrid() { grid.innerHTML = ''; for (let i = 0; i < CONFIG.GRID_SIZE; i++) { const el = document.createElement('div'); el.classList.add('symbol'); grid.appendChild(el); } }
    
    async function renderGrid(withFallAnimation) { 
        grid.innerHTML = ''; 
        state.gridState.forEach(symbol => { 
            const el = document.createElement('div'); 
            el.classList.add('symbol'); 
            el.textContent = symbol.content; 
            if (symbol.type === 'MULTIPLIER') el.classList.add('multiplier'); 
            if (!withFallAnimation) el.style.animation = 'none'; 
            grid.appendChild(el); 
        }); 
        if (withFallAnimation) { await delay(CONFIG.ANIMATION_DELAY.FALL); } 
    }

    function showWinOnGrid(winIndices, multiplierIndices) { 
        const gridElements = Array.from(grid.children); 
        winIndices.forEach(i => gridElements[i].classList.add('winning')); 
        multiplierIndices.forEach(i => gridElements[i].classList.add('winning')); 
    }

    function updateBalanceDisplay() { balanceDisplay.textContent = state.balance.toFixed(2); }
    
    function updateBetDisplay() { 
        const bet = CONFIG.BET_LEVELS[state.currentBetIndex]; 
        betAmountInput.value = bet; 
        buyFsCostDisplay.textContent = (bet * CONFIG.BUY_FS_COST_MULTIPLIER).toLocaleString(); 
    }

    function updateFreeSpinsDisplay() { freeSpinsCount.textContent = state.freeSpinsRemaining; }
    
    function changeBet(direction) { 
        if (state.isSpinning) return; 
        const newIndex = state.currentBetIndex + direction; 
        if (newIndex >= 0 && newIndex < CONFIG.BET_LEVELS.length) { 
            state.currentBetIndex = newIndex; 
            updateBetDisplay(); 
        } 
    }
    
    function startSpin() { 
        state.isSpinning = true; 
        state.currentTumbleWin = 0; 
        spinButton.disabled = true; 
        buyFsBtn.disabled = true; 
        totalWinSplash.classList.add('hidden'); 
        totalWinSplash.classList.remove('visible'); 
    }
    
    function generateRandomSymbol() { 
        const rand = Math.random(); 
        if (rand < 0.04) { return { id: Date.now() + Math.random(), type: 'SCATTER', content: '👑' }; } 
        if (rand < 0.09) { 
            const value = MULTIPLIER_VALUES[Math.floor(Math.random() * MULTIPLIER_VALUES.length)]; 
            return { id: Date.now() + Math.random(), type: 'MULTIPLIER', content: `x${value}`, value: value }; 
        } 
        const symbol = REGULAR_SYMBOLS[Math.floor(Math.random() * REGULAR_SYMBOLS.length)]; 
        return { id: Date.now() + Math.random(), type: symbol, content: symbol }; 
    }

    init();
});
