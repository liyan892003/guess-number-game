const socket = io();
let playerId = null;
let isMyTurn = false;
let allGuesses = [];

const loginScreen = document.getElementById('loginScreen');
const gameScreen = document.getElementById('gameScreen');
const winScreen = document.getElementById('winScreen');
const joinBtn = document.getElementById('joinBtn');
const guessBtn = document.getElementById('guessBtn');
const playerNameInput = document.getElementById('playerName');
const studentIdInput = document.getElementById('studentId');
const guessInput = document.getElementById('guessInput');
const statusMessage = document.getElementById('statusMessage');
const guessHistory = document.getElementById('guessHistory');
const playerList = document.getElementById('playerList');
const minRangeEl = document.getElementById('minRange');
const maxRangeEl = document.getElementById('maxRange');
const currentPlayerNameEl = document.getElementById('currentPlayerName');
const currentPlayerHintEl = document.getElementById('currentPlayerHint');
const roundNumberEl = document.getElementById('roundNumber');
const winnerInfo = document.getElementById('winnerInfo');
const targetNumberReveal = document.getElementById('targetNumberReveal');

function showScreen(screen) {
    loginScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    winScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}

function showMessage(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = 'status-message';
    statusMessage.classList.add(type);
}

function updatePlayerList(players) {
    if (!players || players.length === 0) {
        playerList.innerHTML = '<p style="color: #666; text-align: center;">暂无玩家</p>';
        return;
    }
    
    playerList.innerHTML = players.map((player, index) => {
        let playerClass = '';
        let statusText = '';
        
        if (player.hasGuessed) {
            playerClass = 'guessed';
            statusText = '已猜';
        } else {
            statusText = '等待';
        }
        
        if (player.id === playerId) {
            playerClass += ' is-me';
        }
        
        return `
            <div class="player-card ${playerClass}" data-player-id="${player.id}">
                <div class="player-number">#${index + 1}</div>
                <div class="player-info">
                    <div class="player-name">${player.name}</div>
                    <div class="player-student-id">${player.studentId}</div>
                </div>
                <div class="player-status">${statusText}</div>
            </div>
        `;
    }).join('');
}

function updateCurrentPlayer(currentPlayer) {
    if (!currentPlayer) {
        currentPlayerNameEl.textContent = '等待开始...';
        currentPlayerHintEl.textContent = '';
        isMyTurn = false;
        return;
    }
    
    currentPlayerNameEl.textContent = currentPlayer.name;
    
    if (currentPlayer.id === playerId) {
        currentPlayerHintEl.textContent = '👈 轮到你了！';
        isMyTurn = true;
    } else {
        currentPlayerHintEl.textContent = '等待 ' + currentPlayer.name + ' 猜...';
        isMyTurn = false;
    }
    
    updateGuessButtonState();
}

function updateGuessButtonState() {
    if (isMyTurn) {
        guessBtn.disabled = false;
        guessInput.disabled = false;
        guessBtn.classList.remove('disabled');
    } else {
        guessBtn.disabled = true;
        guessInput.disabled = true;
        guessBtn.classList.add('disabled');
    }
}

function updateAllGuessHistory() {
    if (!allGuesses || allGuesses.length === 0) {
        guessHistory.innerHTML = '<p style="color: #666; text-align: center;">暂无猜题记录</p>';
        return;
    }
    
    guessHistory.innerHTML = allGuesses.map(guess => {
        let emoji = '';
        let resultClass = '';
        
        if (guess.result === 'correct') {
            emoji = '🎉';
            resultClass = 'correct';
        } else if (guess.result === 'tooSmall') {
            emoji = '📉';
            resultClass = 'too-small';
        } else if (guess.result === 'tooBig') {
            emoji = '📈';
            resultClass = 'too-big';
        }
        
        return `
            <div class="history-item ${resultClass}">
                <span class="history-player">${guess.playerName}</span>
                <span class="history-number">${guess.guess}</span>
                <span class="history-result">${emoji}</span>
            </div>
        `;
    }).join('');
}

joinBtn.addEventListener('click', () => {
    const studentId = studentIdInput.value.trim();
    const playerName = playerNameInput.value.trim();
    
    if (!studentId) {
        alert('请输入学号！');
        return;
    }
    
    socket.emit('join', { studentId, playerName });
});

studentIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinBtn.click();
    }
});

playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinBtn.click();
    }
});

guessBtn.addEventListener('click', () => {
    const guess = guessInput.value.trim();
    if (guess) {
        socket.emit('makeGuess', guess);
        guessInput.value = '';
    }
});

guessInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        guessBtn.click();
    }
});

socket.on('joinError', (message) => {
    alert(message);
});

socket.on('joined', (data) => {
    playerId = data.playerId;
    showScreen(gameScreen);
    updatePlayerList(data.players);
    
    if (data.allGuesses) {
        allGuesses = data.allGuesses;
        updateAllGuessHistory();
    }
    
    if (data.roundData) {
        minRangeEl.textContent = data.roundData.minRange;
        maxRangeEl.textContent = data.roundData.maxRange;
        roundNumberEl.textContent = data.roundData.roundNumber;
        updateCurrentPlayer(data.roundData.currentPlayer);
    }
});

socket.on('playerListUpdated', (players) => {
    updatePlayerList(players);
});

socket.on('currentPlayerUpdated', (data) => {
    updateCurrentPlayer(data.currentPlayer);
});

socket.on('newRoundStarted', (data) => {
    showScreen(gameScreen);
    minRangeEl.textContent = data.minRange;
    maxRangeEl.textContent = data.maxRange;
    roundNumberEl.textContent = data.roundNumber;
    updateCurrentPlayer(data.currentPlayer);
    updatePlayerList(data.players);
    showMessage('新的一轮开始！');
});

socket.on('guessMade', (data) => {
    minRangeEl.textContent = data.minRange;
    maxRangeEl.textContent = data.maxRange;
    
    if (data.guess) {
        allGuesses.push(data.guess);
        updateAllGuessHistory();
    }
    
    updateCurrentPlayer(data.currentPlayer);
    
    if (data.result === 'tooSmall') {
        showMessage('太小了！', 'too-small');
    } else if (data.result === 'tooBig') {
        showMessage('太大了！', 'too-big');
    }
});

socket.on('roundWon', (data) => {
    showScreen(winScreen);
    winnerInfo.innerHTML = `<p class="winner-name">${data.winner.name}</p><p style="color: #667eea;">(${data.winner.studentId})</p>`;
    targetNumberReveal.textContent = `正确答案是：${data.targetNumber}`;
    
    if (data.guessRecord) {
        allGuesses.push(data.guessRecord);
        updateAllGuessHistory();
    }
});

socket.on('alreadyGuessed', () => {
    showMessage('你已经猜过了！', 'error');
});

socket.on('notYourTurn', () => {
    showMessage('还没轮到你！', 'error');
});

socket.on('invalidGuess', () => {
    showMessage('请输入范围内的数字！', 'error');
});
