document.addEventListener('DOMContentLoaded', () => {
    // ==================================
    // KONFIGURASI GAME
    // ==================================
    const CONFIG = {
        GRID_SIZE: 6 * 5,
        MIN_WIN_COUNT: 8,
        SCATTER_TRIGGER_COUNT: 4,
        FREE_SPINS_AWARDED: 15,
        BUY_FS_COST_MULTIPLIER: 100,
        BET_LEVELS: [100, 200, 500, 1000, 2500, 5000],
        ANIMATION_DELAY: {
            WIN_DISPLAY: 800, // Jeda untuk menunjukkan simbol mana yang menang
            DISAPPEAR: 300,   // Jeda setelah simbol menghilang
            FALL: 500         // Jeda untuk menunggu simbol baru jatuh
        }
    };

    const SIMBOL = {
        // Simbol Bayaran Rendah
        '🐵': { value: 0.25 }, '🦓': { value: 0.4 }, '🦒': { value: 0.5 },
        // Simbol Bayaran Tinggi
        '🐘': { value: 0.8 }, '🦁': { value: 1 }, '🦜': { value: 2 },
        // Simbol Spesial
        'SCATTER': { value: 0, isSpecial: true },
        'MULTIPLIER': { value: 0, isSpecial: true }
    };
    const REGULAR_SYMBOLS = Object.keys(SIMBOL).filter(k => !SIMBOL[k].isSpecial);
    const MULTIPLIER_VALUES = [2, 3, 4, 5, 8, 10, 12, 15, 20, 25, 50, 100];

    // ==================================
    // ELEMEN DOM
    // ==================================
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
        balance: 10000,
        currentBetIndex: 0,
        isSpinning: false,
        isInFreeSpins: false,
        freeSpinsRemaining: 0,
        currentTumbleWin: 0,
        gridState: []
    };

    // ==================================
    // FUNGSI UTAMA
    // ==================================

    /** Menginisialisasi game */
    function init() {
        updateBetDisplay();
        updateBalanceDisplay();
        createInitialGrid();
        spinButton.addEventListener('click', handleSpin);
        buyFsBtn.addEventListener('click', handleBuyFreeSpins);
        increaseBetBtn.addEventListener('click', () => changeBet(1));
        decreaseBetBtn.addEventListener('click', () => changeBet(-1));
    }

    /** Memulai putaran, baik normal maupun free spin */
    async function handleSpin() {
        if (state.isSpinning) return;
        
        const currentBet = CONFIG.BET_LEVELS[state.currentBetIndex];
        if (!state.isInFreeSpins && state.balance < currentBet) {
            alert("Saldo tidak cukup!");
            return;
        }

        startSpin();
        
        if (!state.isInFreeSpins) {
            state.balance -= currentBet;
            updateBalanceDisplay();
        } else {
            state.freeSpinsRemaining--;
            updateFreeSpinsDisplay();
        }

        state.gridState = generateGridSymbols();
        await renderGrid(true); // Render dengan animasi jatuh
        await processTumbles();
        
        endSpin();
    }
    
    /** Proses rekursif untuk Tumble/kemenangan beruntun */
    async function processTumbles() {
        const { wins, totalMultiplier, scatters } = calculateWins(state.gridState);
        
        if (wins.length === 0) {
            // Tidak ada kemenangan, akhir dari putaran ini
            return;
        }

        // Ada kemenangan, proses...
        const winAmount = wins.reduce((total, win) => total + (SIMBOL[win.symbol].value * win.count), 0);
        const finalWin = winAmount * totalMultiplier * CONFIG.BET_LEVELS[state.currentBetIndex];
        state.currentTumbleWin += finalWin;
        state.balance += finalWin;
        
        updateBalanceDisplay();
        showWinOnGrid(wins.map(w => w.indices).flat(), state.gridState.map((s, i) => s.type === 'MULTIPLIER' ? i : -1).filter(i => i !== -1));

        await delay(CONFIG.ANIMATION_DELAY.WIN_DISPLAY);
        
        await disappearAndTumble(wins.map(w => w.indices).flat());
        
        // Cek lagi untuk kemenangan baru setelah tumble
        await processTumbles();
    }

    /** Memeriksa pemicu Free Spins */
    function checkFreeSpinsTrigger() {
        const scatters = state.gridState.filter(s => s.type === 'SCATTER').length;
        if (scatters >= CONFIG.SCATTER_TRIGGER_COUNT) {
            enterFreeSpins();
        }
    }
    
    /** Memulai Free Spins dari pembelian */
    function handleBuyFreeSpins() {
        if (state.isSpinning) return;
        const cost = CONFIG.BET_LEVELS[state.currentBetIndex] * CONFIG.BUY_FS_COST_MULTIPLIER;
        if (state.balance < cost) {
            alert("Saldo tidak cukup untuk membeli Free Spins!");
            return;
        }
        state.balance -= cost;
        updateBalanceDisplay();
        enterFreeSpins(true); // Memulai langsung
    }

    // ==================================
    // FUNGSI LOGIKA BANTU
    // ==================================

    function generateGridSymbols() {
        const grid = [];
        for (let i = 0; i < CONFIG.GRID_SIZE; i++) {
            grid.push(generateRandomSymbol());
        }
        return grid;
    }
    
    function generateRandomSymbol() {
        // Logika untuk probabilitas simbol spesial
        const rand = Math.random();
        if (rand < 0.04) { // 4% chance for Scatter
            return { id: Date.now() + Math.random(), type: 'SCATTER', content: '👑' };
        }
        if (rand < 0.09) { // 5% chance for Multiplier (setelah scatter)
            const value = MULTIPLIER_VALUES[Math.floor(Math.random() * MULTIPLIER_VALUES.length)];
            return { id: Date.now() + Math.random(), type: 'MULTIPLIER', content: `x${value}`, value: value };
        }
        const symbol = REGULAR_SYMBOLS[Math.floor(Math.random() * REGULAR_SYMBOLS.length)];
        return { id: Date.now() + Math.random(), type: symbol, content: symbol };
    }
    
    function calculateWins(currentGrid) {
        const symbolCounts = {};
        let totalMultiplier = 1;
        const multipliersOnScreen = [];
        const scatters = [];

        currentGrid.forEach((symbol, index) => {
            if (symbol.type === 'MULTIPLIER') {
                multipliersOnScreen.push(symbol);
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
            totalMultiplier = multipliersOnScreen.reduce((total, m) => total + m.value, 1);
            if (totalMultiplier === 1 && multipliersOnScreen.length > 0) totalMultiplier = multipliersOnScreen.reduce((total, m) => total + m.value, 0);
        }

        return { wins, totalMultiplier, scatters };
    }
    
    async function disappearAndTumble(winningIndices) {
        const gridElements = Array.from(grid.children);
        winningIndices.forEach(i => gridElements[i].classList.add('disappearing'));
        
        await delay(CONFIG.ANIMATION_DELAY.DISAPPEAR);
        
        // Buat grid baru dengan `null` di posisi menang
        const newGridState = [...state.gridState];
        winningIndices.forEach(i => newGridState[i] = null);

        // Jatuhkan simbol yang ada
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
        
        // Isi ruang kosong di atas dengan simbol baru
        for (let i = 0; i < newGridState.length; i++) {
            if (newGridState[i] === null) {
                newGridState[i] = generateRandomSymbol();
            }
        }
        
        state.gridState = newGridState;
        await renderGrid(false); // Render ulang tanpa animasi jatuh besar
    }

    // ==================================
    // FUNGSI TAMPILAN (UI)
    // ==================================
    
    function createInitialGrid() {
        grid.innerHTML = '';
        for (let i = 0; i < CONFIG.GRID_SIZE; i++) {
            const el = document.createElement('div');
            el.classList.add('symbol');
            grid.appendChild(el);
        }
    }
    
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
        if (withFallAnimation) {
            await delay(CONFIG.ANIMATION_DELAY.FALL);
        }
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
    
    function endSpin() {
        if (state.currentTumbleWin > 0) {
            totalWinAmount.textContent = state.currentTumbleWin.toLocaleString();
            totalWinSplash.classList.remove('hidden');
            totalWinSplash.classList.add('visible');
        }
        
        checkFreeSpinsTrigger();

        if (state.isInFreeSpins && state.freeSpinsRemaining > 0) {
            // Putar otomatis di mode free spin
            setTimeout(handleSpin, 1000);
        } else {
            if (state.isInFreeSpins) exitFreeSpins();
            state.isSpinning = false;
            spinButton.disabled = false;
            buyFsBtn.disabled = false;
        }
    }

    function enterFreeSpins(isBought = false) {
        if (state.isInFreeSpins) { // Jika sudah di FS dan dapat lagi
            state.freeSpinsRemaining += 5;
            updateFreeSpinsDisplay();
            return;
        }
        state.isInFreeSpins = true;
        state.freeSpinsRemaining = CONFIG.FREE_SPINS_AWARDED;
        freeSpinsDisplay.style.display = 'block';
        document.body.classList.add('free-spins-active');
        updateFreeSpinsDisplay();
        if (isBought) {
            setTimeout(handleSpin, 500);
        }
    }

    function exitFreeSpins() {
        state.isInFreeSpins = false;
        freeSpinsDisplay.style.display = 'none';
        document.body.classList.remove('free-spins-active');
    }

    const delay = ms => new Promise(res => setTimeout(res, ms));

    // ==================================
    // MULAI GAME
    // ==================================
    init();
});
