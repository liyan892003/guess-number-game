const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin/records', (req, res) => {
  const records = {
    usedStudentIds: Array.from(usedStudentIds),
    totalParticipants: usedStudentIds.size,
    gameHistory: gameHistory
  };
  res.json(records);
});

const USED_STUDENTS_FILE = path.join(__dirname, 'used-students.json');
const GAME_HISTORY_FILE = path.join(__dirname, 'game-history.json');

function loadUsedStudents() {
  try {
    if (fs.existsSync(USED_STUDENTS_FILE)) {
      const data = fs.readFileSync(USED_STUDENTS_FILE, 'utf8');
      return new Set(JSON.parse(data));
    }
  } catch (e) {
    console.log('加载已用学号失败:', e);
  }
  return new Set();
}

function saveUsedStudents(studentIds) {
  try {
    fs.writeFileSync(USED_STUDENTS_FILE, JSON.stringify(Array.from(studentIds)));
  } catch (e) {
    console.log('保存已用学号失败:', e);
  }
}

function loadGameHistory() {
  try {
    if (fs.existsSync(GAME_HISTORY_FILE)) {
      const data = fs.readFileSync(GAME_HISTORY_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.log('加载游戏历史失败:', e);
  }
  return [];
}

function saveGameHistory(history) {
  try {
    fs.writeFileSync(GAME_HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (e) {
    console.log('保存游戏历史失败:', e);
  }
}

let usedStudentIds = loadUsedStudents();
let gameHistory = loadGameHistory();
let currentRoundPlayers = []; // 当前轮的玩家顺序
let currentRoundRecords = []; // 当前轮的记录

let gameState = {
  targetNumber: null,
  minRange: 1,
  maxRange: 100,
  isGameActive: false,
  currentPlayerIndex: 0,
  players: new Map(),
  studentIds: new Set(),
  roundNumber: 1
};

function generateTargetNumber() {
  return Math.floor(Math.random() * 100) + 1;
}

function resetGame() {
  gameState.targetNumber = generateTargetNumber();
  gameState.minRange = 1;
  gameState.maxRange = 100;
  gameState.isGameActive = true;
  gameState.currentPlayerIndex = 0;
  gameState.roundNumber += 1;
  
  currentRoundPlayers = Array.from(gameState.players.values());
  currentRoundRecords = [];
  
  gameState.players.forEach(player => {
    player.hasGuessed = false;
  });
}

function getCurrentPlayers() {
  return Array.from(gameState.players.values()).map((p, index) => ({
    id: p.id,
    name: p.name,
    studentId: p.studentId,
    index: index,
    hasGuessed: p.hasGuessed
  }));
}

function getCurrentPlayer() {
  if (currentRoundPlayers.length === 0) return null;
  const index = gameState.currentPlayerIndex % currentRoundPlayers.length;
  return currentRoundPlayers[index];
}

function saveRoundRecord(winner) {
  const roundRecord = {
    id: Date.now(),
    date: new Date().toISOString(),
    roundNumber: gameState.roundNumber - 1,
    targetNumber: gameState.targetNumber,
    winner: winner ? {
      studentId: winner.studentId,
      name: winner.name
    } : null,
    guesses: currentRoundRecords.slice()
  };
  gameHistory.push(roundRecord);
  saveGameHistory(gameHistory);
}

io.on('connection', (socket) => {
  console.log('新用户连接:', socket.id);

  socket.on('join', (data) => {
    const { studentId, playerName } = data;
    
    if (!studentId || !studentId.trim()) {
      socket.emit('joinError', '请输入学号！');
      return;
    }
    
    if (usedStudentIds.has(studentId.trim())) {
      socket.emit('joinError', '该学号已参加过游戏了！');
      return;
    }
    
    const player = {
      id: socket.id,
      studentId: studentId.trim(),
      name: playerName || '匿名玩家',
      index: currentRoundPlayers.length,
      hasGuessed: false
    };
    
    usedStudentIds.add(studentId.trim());
    saveUsedStudents(usedStudentIds);
    gameState.studentIds.add(studentId.trim());
    gameState.players.set(socket.id, player);
    currentRoundPlayers.push(player);
    
    socket.emit('joined', {
      playerId: socket.id,
      players: getCurrentPlayers(),
      gameState: {
        isGameActive: gameState.isGameActive,
        minRange: gameState.minRange,
        maxRange: gameState.maxRange,
        currentPlayerIndex: gameState.currentPlayerIndex,
        currentPlayer: getCurrentPlayer(),
        roundNumber: gameState.roundNumber
      }
    });
    
    io.emit('playerListUpdated', getCurrentPlayers());
    io.emit('currentPlayerUpdated', {
      currentPlayerIndex: gameState.currentPlayerIndex,
      currentPlayer: getCurrentPlayer()
    });
  });

  socket.on('startGame', () => {
    if (!gameState.isGameActive && gameState.players.size > 0) {
      resetGame();
      io.emit('gameStarted', {
        minRange: gameState.minRange,
        maxRange: gameState.maxRange,
        currentPlayerIndex: gameState.currentPlayerIndex,
        currentPlayer: getCurrentPlayer(),
        roundNumber: gameState.roundNumber,
        players: getCurrentPlayers()
      });
    }
  });

  socket.on('makeGuess', (guess) => {
    if (!gameState.isGameActive) return;
    
    const player = gameState.players.get(socket.id);
    if (!player) return;
    
    if (player.hasGuessed) {
      socket.emit('alreadyGuessed');
      return;
    }
    
    const currentPlayer = getCurrentPlayer();
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit('notYourTurn');
      return;
    }
    
    const guessNum = parseInt(guess);
    if (isNaN(guessNum) || guessNum < gameState.minRange || guessNum > gameState.maxRange) {
      socket.emit('invalidGuess');
      return;
    }
    
    const guessRecord = {
      playerId: socket.id,
      playerName: player.name,
      studentId: player.studentId,
      guess: guessNum,
      timestamp: Date.now()
    };
    
    player.hasGuessed = true;
    currentRoundRecords.push(guessRecord);
    
    if (guessNum === gameState.targetNumber) {
      guessRecord.result = 'correct';
      
      saveRoundRecord(player);
      
      io.emit('roundWon', {
        winner: player,
        targetNumber: gameState.targetNumber,
        roundNumber: gameState.roundNumber,
        guessRecord: guessRecord
      });
      
      setTimeout(() => {
        resetGame();
        io.emit('newRoundStarted', {
          minRange: gameState.minRange,
          maxRange: gameState.maxRange,
          currentPlayerIndex: gameState.currentPlayerIndex,
          currentPlayer: getCurrentPlayer(),
          roundNumber: gameState.roundNumber,
          players: getCurrentPlayers()
        });
      }, 3000);
      
    } else {
      if (guessNum < gameState.targetNumber) {
        guessRecord.result = 'tooSmall';
        gameState.minRange = guessNum + 1;
      } else {
        guessRecord.result = 'tooBig';
        gameState.maxRange = guessNum - 1;
      }
      
      gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % currentRoundPlayers.length;
      
      io.emit('guessMade', {
        guess: guessRecord,
        result: guessRecord.result,
        minRange: gameState.minRange,
        maxRange: gameState.maxRange,
        currentPlayerIndex: gameState.currentPlayerIndex,
        currentPlayer: getCurrentPlayer()
      });
    }
    
    io.emit('playerListUpdated', getCurrentPlayers());
  });

  socket.on('disconnect', () => {
    console.log('用户断开连接:', socket.id);
    const player = gameState.players.get(socket.id);
    if (player && player.studentId) {
      gameState.studentIds.delete(player.studentId);
    }
    gameState.players.delete(socket.id);
    
    const index = currentRoundPlayers.findIndex(p => p.id === socket.id);
    if (index !== -1) {
      currentRoundPlayers.splice(index, 1);
    }
    
    io.emit('playerListUpdated', getCurrentPlayers());
    io.emit('currentPlayerUpdated', {
      currentPlayerIndex: gameState.currentPlayerIndex,
      currentPlayer: getCurrentPlayer()
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
