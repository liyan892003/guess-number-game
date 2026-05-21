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

const USED_STUDENTS_FILE = path.join(__dirname, 'used-students.json');

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

let usedStudentIds = loadUsedStudents();

let gameState = {
  targetNumber: null,
  minRange: 1,
  maxRange: 100,
  isGameActive: false,
  currentGroup: 0,
  groups: [],
  players: new Map(),
  studentIds: new Set(),
  guessHistory: [],
  winner: null
};

const GROUP_SIZE = 5;

function generateTargetNumber() {
  return Math.floor(Math.random() * 100) + 1;
}

function resetGame() {
  gameState.targetNumber = generateTargetNumber();
  gameState.minRange = 1;
  gameState.maxRange = 100;
  gameState.isGameActive = true;
  gameState.currentGroup = 0;
  gameState.guessHistory = [];
  gameState.winner = null;
  
  gameState.players.forEach(player => {
    player.hasGuessed = false;
  });
  
  assignGroups();
}

function assignGroups() {
  const playerArray = Array.from(gameState.players.values());
  gameState.groups = [];
  
  playerArray.forEach((player, index) => {
    player.group = Math.floor(index / GROUP_SIZE);
  });
  
  for (let i = 0; i < playerArray.length; i += GROUP_SIZE) {
    const group = playerArray.slice(i, i + GROUP_SIZE);
    gameState.groups.push(group);
  }
  
  if (gameState.currentGroup >= gameState.groups.length) {
    gameState.currentGroup = 0;
  }
}

function getCurrentPlayers() {
  return Array.from(gameState.players.values()).map(p => ({
    id: p.id,
    name: p.name,
    studentId: p.studentId,
    group: p.group,
    hasGuessed: p.hasGuessed
  }));
}

function getCurrentGroupPlayers() {
  if (gameState.groups.length === 0) return [];
  return gameState.groups[gameState.currentGroup] || [];
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
      group: -1,
      isReady: true,
      hasGuessed: false
    };
    
    usedStudentIds.add(studentId.trim());
    saveUsedStudents(usedStudentIds);
    gameState.studentIds.add(studentId.trim());
    gameState.players.set(socket.id, player);
    assignGroups();
    
    socket.emit('joined', {
      playerId: socket.id,
      players: getCurrentPlayers(),
      gameState: {
        isGameActive: gameState.isGameActive,
        minRange: gameState.minRange,
        maxRange: gameState.maxRange,
        currentGroup: gameState.currentGroup,
        groups: gameState.groups,
        guessHistory: gameState.guessHistory,
        winner: gameState.winner
      }
    });
    
    io.emit('playerListUpdated', getCurrentPlayers());
  });

  socket.on('startGame', () => {
    if (!gameState.isGameActive && gameState.players.size > 0) {
      resetGame();
      io.emit('gameStarted', {
        minRange: gameState.minRange,
        maxRange: gameState.maxRange,
        currentGroup: gameState.currentGroup,
        currentGroupPlayers: getCurrentGroupPlayers()
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
    
    const currentGroupPlayers = getCurrentGroupPlayers();
    const isPlayerTurn = currentGroupPlayers.some(p => p.id === socket.id);
    
    if (!isPlayerTurn) {
      socket.emit('notYourTurn');
      return;
    }
    
    const guessNum = parseInt(guess);
    if (isNaN(guessNum) || guessNum < gameState.minRange || guessNum > gameState.maxRange) {
      socket.emit('invalidGuess');
      return;
    }
    
    const guessEntry = {
      playerId: socket.id,
      playerName: player.name,
      guess: guessNum,
      timestamp: Date.now()
    };
    
    player.hasGuessed = true;
    
    function hasUnguessedPlayers() {
      for (let p of gameState.players.values()) {
        if (!p.hasGuessed) return true;
      }
      return false;
    }
    
    if (guessNum === gameState.targetNumber) {
      guessEntry.result = 'correct';
      gameState.guessHistory.push(guessEntry);
      gameState.isGameActive = false;
      gameState.winner = player;
      io.emit('gameWon', {
        winner: player,
        targetNumber: gameState.targetNumber,
        guessHistory: gameState.guessHistory
      });
    } else {
      if (guessNum < gameState.targetNumber) {
        guessEntry.result = 'tooSmall';
        gameState.minRange = guessNum + 1;
      } else {
        guessEntry.result = 'tooBig';
        gameState.maxRange = guessNum - 1;
      }
      gameState.guessHistory.push(guessEntry);
      
      if (hasUnguessedPlayers()) {
        gameState.currentGroup = (gameState.currentGroup + 1) % gameState.groups.length;
        
        io.emit('guessMade', {
          guess: guessEntry,
          result: guessEntry.result,
          minRange: gameState.minRange,
          maxRange: gameState.maxRange,
          currentGroup: gameState.currentGroup,
          currentGroupPlayers: getCurrentGroupPlayers(),
          guessHistory: gameState.guessHistory
        });
      } else {
        gameState.isGameActive = false;
        io.emit('gameOverNoWinner', {
          targetNumber: gameState.targetNumber,
          guessHistory: gameState.guessHistory
        });
      }
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
    assignGroups();
    io.emit('playerListUpdated', getCurrentPlayers());
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
