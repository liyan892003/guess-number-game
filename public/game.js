const socket = io();

let playerId = null;
let currentPlayers = [];

const loginScreen = document.getElementById('loginScreen');
const gameScreen = document.getElementById('gameScreen');
const winScreen = document.getElementById('winScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const studentIdInput = document.getElementById('studentId');
const playerNameInput = document.getElementById('playerName');
const joinBtn = document.getElementById('joinBtn');
const guessInput = document.getElementById('guessInput');
const guessBtn = document.getElementById('guessBtn');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const playAgainBtn = document.getElementById('playAgainBtn');
const gameOverPlayAgainBtn = document.getElementById('gameOverPlayAgainBtn');
const minRangeEl = document.getElementById('minRange');
const maxRangeEl = document.getElementById('maxRange');
const currentGroupEl = document.getElementById('currentGroup');
const currentGroupPlayersEl = document.getElementById('currentGroupPlayers');
const statusMessageEl = document.getElementById('statusMessage');
const guessHistoryEl = document.getElementById('guessHistory');
const playerListEl = document.getElementById('playerList');
const winnerInfoEl = document.getElementById('winnerInfo');
const targetNumberRevealEl = document.getElementById('targetNumberReveal');
const gameOverTargetNumberEl = document.getElementById('gameOverTargetNumber');

function showScreen(screen) {
    loginScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    winScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}

joinBtn.addEventListener('click', () => {
    const studentId = studentIdInput.value.trim();
    const name = playerNameInput.value.trim();
    if (studentId && name) {
        socket.emit('join', { studentId, playerName: name });
    } else {
        alert('请输入学号和姓名！');
    }
});

playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinBtn.click();
    }
});

studentIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        playerNameInput.focus();
    }
});

guessBtn.addEventListener('click', () => {
    const guess = guessInput.value;
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

startBtn.addEventListener('click', () => {
    socket.emit('startGame');
});

resetBtn.addEventListener('click', () => {
    socket.emit('resetGame');
});

playAgainBtn.addEventListener('click', () => {
    socket.emit('resetGame');
    showScreen(gameScreen);
});

gameOverPlayAgainBtn.addEventListener('click', () => {
    socket.emit('resetGame');
    showScreen(gameScreen);
});

socket.on('joined', (data) => {
    playerId = data.playerId;
    currentPlayers = data.players;
    updatePlayerList();
    
    if (data.gameState.isGameActive) {
        minRangeEl.textContent = data.gameState.minRange;
        maxRangeEl.textContent = data.gameState.maxRange;
        currentGroupEl.textContent = `第 ${data.gameState.currentGroup + 1} 组`;
        updateGuessHistory(data.gameState.guessHistory);
    }
    
    showScreen(gameScreen);
});

socket.on('playerListUpdated', (players) => {
    currentPlayers = players;
    updatePlayerList();
});

socket.on('gameStarted', (data) => {
    minRangeEl.textContent = data.minRange;
    maxRangeEl.textContent = data.maxRange;
    currentGroupEl.textContent = `第 ${data.currentGroup + 1} 组`;
    updateCurrentGroupPlayers(data.currentGroupPlayers);
    guessHistoryEl.innerHTML = '';
    statusMessageEl.textContent = '';
    statusMessageEl.className = 'status-message';
    startBtn.classList.add('hidden');
    resetBtn.classList.remove('hidden');
    showScreen(gameScreen);
});

socket.on('guessMade', (data) => {
    minRangeEl.textContent = data.minRange;
    maxRangeEl.textContent = data.maxRange;
    currentGroupEl.textContent = `第 ${data.currentGroup + 1} 组`;
    updateCurrentGroupPlayers(data.currentGroupPlayers);
    updateGuessHistory(data.guessHistory);
    
    if (data.guess.playerId === playerId) {
        statusMessageEl.textContent = data.result === 'tooSmall' ? '太小了！' : '太大了！';
        statusMessageEl.className = `status-message ${data.result === 'tooSmall' ? 'too-small' : 'too-big'}`;
    } else {
        statusMessageEl.textContent = `${data.guess.playerName} 猜了 ${data.guess.guess}，${data.result === 'tooSmall' ? '太小了！' : '太大了！'}`;
        statusMessageEl.className = `status-message ${data.result === 'tooSmall' ? 'too-small' : 'too-big'}`;
    }
});

socket.on('gameWon', (data) => {
    winnerInfoEl.textContent = `${data.winner.name} 猜中了！`;
    targetNumberRevealEl.textContent = `正确答案是：${data.targetNumber}`;
    updateGuessHistory(data.guessHistory);
    showScreen(winScreen);
    startBtn.classList.remove('hidden');
    resetBtn.classList.add('hidden');
});

socket.on('gameOverNoWinner', (data) => {
    gameOverTargetNumberEl.textContent = `正确答案是：${data.targetNumber}`;
    updateGuessHistory(data.guessHistory);
    showScreen(gameOverScreen);
    startBtn.classList.remove('hidden');
    resetBtn.classList.add('hidden');
});

socket.on('notYourTurn', () => {
    statusMessageEl.textContent = '还没轮到你们组哦！';
    statusMessageEl.className = 'status-message';
});

socket.on('invalidGuess', () => {
    statusMessageEl.textContent = '请输入有效范围内的数字！';
    statusMessageEl.className = 'status-message';
});

socket.on('joinError', (message) => {
    alert(message);
});

socket.on('alreadyGuessed', () => {
    statusMessageEl.textContent = '你已经猜过一次了！';
    statusMessageEl.className = 'status-message';
});

function updatePlayerList() {
    playerListEl.innerHTML = currentPlayers.map(player => {
        const playerGroup = player.group !== undefined ? player.group : -1;
        const hasGuessed = player.hasGuessed;
        return `
            <div class="player-item ${hasGuessed ? 'has-guessed' : ''}">
                <div class="name">${player.name}</div>
                <div class="student-id">${player.studentId}</div>
                <div class="group-tag">${playerGroup >= 0 ? `第 ${playerGroup + 1} 组` : '等待分组'}</div>
                ${hasGuessed ? '<div class="guess-status">已猜</div>' : ''}
            </div>
        `;
    }).join('');
}

function updateCurrentGroupPlayers(players) {
    if (players && players.length > 0) {
        currentGroupPlayersEl.textContent = players.map(p => p.name).join('、');
    } else {
        currentGroupPlayersEl.textContent = '等待玩家加入...';
    }
}

function updateGuessHistory(history) {
    guessHistoryEl.innerHTML = history.slice().reverse().map((item) => {
        let resultClass = '';
        let resultText = '';
        
        if (item.result === 'tooSmall') {
            resultClass = 'too-small';
            resultText = '太小了';
        } else if (item.result === 'tooBig') {
            resultClass = 'too-big';
            resultText = '太大了';
        } else if (item.result === 'correct') {
            resultClass = 'correct';
            resultText = '猜对了！';
        }
        
        return `
            <div class="history-item">
                <span class="player-name">${item.playerName}</span>
                <span class="guess">${item.guess}</span>
                <span class="result ${resultClass}">${resultText}</span>
            </div>
        `;
    }).join('');
}
