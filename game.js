// ==========================================
// 1. 关卡数据 (XSB 格式)
// 为了演示，这里放了经典的 Microban 前几关。
// 如果要100关，请看代码底部的“如何添加更多关卡”
// ==========================================
const levelsRaw = `
; Level 1
####
# .#
#  ###
#*@  #
#  $ #
#  ###
####

; Level 2
#####
#   #
#$  #
###  #
#.@ #
#####

; Level 3
  ####
###  ####
#     $ #
# #  #$ #
# . .#@ #
#########

; Level 4
####
#  #
#  ######
# * $   #
#  @#   #
####   ##
   #####

; Level 5
   ###
   #.#
   # #
#### #
# $  #
# $ @#
# .  #
######
`;

// ==========================================
// 2. 游戏引擎逻辑
// ==========================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TILE_SIZE = 40; // 每个格子的大小
const COLORS = {
    wall: '#7f8c8d',
    floor: '#ecf0f1',
    target: '#e74c3c',
    box: '#f1c40f',
    boxOnTarget: '#2ecc71',
    player: '#3498db'
};

// 游戏状态
let levels = [];
let currentLevelIndex = 0;
let currentMap = []; // 当前地图的二维数组
let playerPos = {x: 0, y: 0};
let history = []; // 撤销栈
let steps = 0;

// 解析 XSB 格式的地图字符串
function parseLevels(rawString) {
    const splitLevels = rawString.trim().split(/; Level \d+/);
    // 过滤空字符串（第一个可能是空的）
    return splitLevels.filter(l => l.trim().length > 0).map(levelStr => {
        const lines = levelStr.trim().split('\n');
        return lines.map(line => line.split(''));
    });
}

// 初始化游戏
function initGame() {
    levels = parseLevels(levelsRaw);
    loadLevel(0);
    window.addEventListener('keydown', handleInput);
}

// 加载指定关卡
function loadLevel(index) {
    if (index < 0 || index >= levels.length) return;
    
    currentLevelIndex = index;
    steps = 0;
    history = [];
    
    // 深拷贝地图，防止修改原始数据
    const levelData = levels[index];
    currentMap = JSON.parse(JSON.stringify(levelData));
    
    // 找到玩家位置
    findPlayer();
    
    // 调整 Canvas 大小
    const rows = currentMap.length;
    const cols = Math.max(...currentMap.map(row => row.length));
    canvas.width = cols * TILE_SIZE;
    canvas.height = rows * TILE_SIZE;
    
    updateUI();
    draw();
}

function findPlayer() {
    for (let y = 0; y < currentMap.length; y++) {
        for (let x = 0; x < currentMap[y].length; x++) {
            // @ 是玩家，+ 是玩家站在目标点上
            if (currentMap[y][x] === '@' || currentMap[y][x] === '+') {
                playerPos = {x, y};
                return;
            }
        }
    }
}

// 绘制画面
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let y = 0; y < currentMap.length; y++) {
        for (let x = 0; x < currentMap[y].length; x++) {
            const char = currentMap[y][x];
            const posX = x * TILE_SIZE;
            const posY = y * TILE_SIZE;
            
            // 绘制地板
            ctx.fillStyle = COLORS.floor;
            ctx.fillRect(posX, posY, TILE_SIZE, TILE_SIZE);

            // 根据字符绘制元素
            switch(char) {
                case '#': // 墙
                    ctx.fillStyle = COLORS.wall;
                    ctx.fillRect(posX, posY, TILE_SIZE, TILE_SIZE);
                    ctx.strokeStyle = '#555';
                    ctx.strokeRect(posX, posY, TILE_SIZE, TILE_SIZE);
                    break;
                case '.': // 目标点
                    drawCircle(posX, posY, COLORS.target, 0.2);
                    break;
                case '$': // 箱子
                    drawRect(posX, posY, COLORS.box, 0.8);
                    break;
                case '*': // 箱子在目标点
                    drawCircle(posX, posY, COLORS.target, 0.2); // 底下有个点
                    drawRect(posX, posY, COLORS.boxOnTarget, 0.8);
                    break;
                case '@': // 玩家
                    drawPlayer(posX, posY);
                    break;
                case '+': // 玩家在目标点
                    drawCircle(posX, posY, COLORS.target, 0.2);
                    drawPlayer(posX, posY);
                    break;
            }
        }
    }
}

// 辅助绘图函数
function drawRect(x, y, color, scale) {
    const offset = (TILE_SIZE * (1 - scale)) / 2;
    const size = TILE_SIZE * scale;
    ctx.fillStyle = color;
    ctx.fillRect(x + offset, y + offset, size, size);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(x + offset, y + offset, size, size);
}

function drawCircle(x, y, color, scale) {
    const centerX = x + TILE_SIZE / 2;
    const centerY = y + TILE_SIZE / 2;
    const radius = (TILE_SIZE * scale);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
}

function drawPlayer(x, y) {
    const offset = TILE_SIZE * 0.1;
    const size = TILE_SIZE * 0.8;
    ctx.fillStyle = COLORS.player;
    // 简单的圆形代表玩家
    ctx.beginPath();
    ctx.arc(x + TILE_SIZE/2, y + TILE_SIZE/2, size/2, 0, Math.PI*2);
    ctx.fill();
    // 眼睛
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(x + TILE_SIZE*0.35, y + TILE_SIZE*0.4, size/10, 0, Math.PI*2);
    ctx.arc(x + TILE_SIZE*0.65, y + TILE_SIZE*0.4, size/10, 0, Math.PI*2);
    ctx.fill();
}

// 处理移动
function move(dx, dy) {
    const newX = playerPos.x + dx;
    const newY = playerPos.y + dy;
    
    // 检查越界
    if (isOutOfBounds(newX, newY)) return;

    const targetChar = currentMap[newY][newX];
    
    // 1. 碰到墙，不动
    if (targetChar === '#') return;
    
    // 2. 碰到空地或目标点，直接移动
    if (targetChar === ' ' || targetChar === '.') {
        pushHistory();
        updatePlayerPos(newX, newY);
        steps++;
        checkWin();
    }
    
    // 3. 碰到箱子 ($ 或 *)
    if (targetChar === '$' || targetChar === '*') {
        const boxNewX = newX + dx;
        const boxNewY = newY + dy;
        
        // 箱子后面如果是墙或另一个箱子，推不动
        if (isOutOfBounds(boxNewX, boxNewY)) return;
        const boxNextChar = currentMap[boxNewY][boxNewX];
        if (boxNextChar === '#' || boxNextChar === '$' || boxNextChar === '*') return;
        
        // 推箱子逻辑
        pushHistory();
        
        // 移动箱子
        // 当前箱子位置变回空地或目标
        currentMap[newY][newX] = (targetChar === '$') ? '@' : '+'; // 箱子被推走，人进来了
        
        // 新箱子位置
        if (currentMap[boxNewY][boxNewX] === '.') {
            currentMap[boxNewY][boxNewX] = '*'; // 箱子到位
        } else {
            currentMap[boxNewY][boxNewX] = '$'; // 箱子在空地
        }
        
        // 恢复人原来的位置
        const oldChar = currentMap[playerPos.y][playerPos.x];
        currentMap[playerPos.y][playerPos.x] = (oldChar === '+') ? '.' : ' ';
        
        playerPos = {x: newX, y: newY};
        steps++;
        checkWin();
    }
    
    draw();
    updateUI();
}

function updatePlayerPos(newX, newY) {
    const oldChar = currentMap[playerPos.y][playerPos.x];
    const targetChar = currentMap[newY][newX];
    
    // 离开旧位置
    currentMap[playerPos.y][playerPos.x] = (oldChar === '+') ? '.' : ' ';
    
    // 进入新位置
    currentMap[newY][newX] = (targetChar === '.') ? '+' : '@';
    
    playerPos = {x: newX, y: newY};
}

function isOutOfBounds(x, y) {
    return y < 0 || y >= currentMap.length || x < 0 || x >= currentMap[y].length;
}

// 记录历史（用于撤销）
function pushHistory() {
    // 简单粗暴：保存整个地图快照和玩家位置
    // 对于100关的小游戏，内存完全够用
    history.push({
        map: JSON.parse(JSON.stringify(currentMap)),
        player: {...playerPos},
        steps: steps
    });
}

function undoMove() {
    if (history.length === 0) return;
    const lastState = history.pop();
    currentMap = lastState.map;
    playerPos = lastState.player;
    steps = lastState.steps;
    draw();
    updateUI();
}

function checkWin() {
    // 检查是否还有 '$' (未在目标点上的箱子)
    let hasUnfinishedBox = false;
    for (let row of currentMap) {
        if (row.includes('$')) {
            hasUnfinishedBox = true;
            break;
        }
    }
    
    if (!hasUnfinishedBox) {
        draw();
        // 延时一点弹出提示，让渲染先完成
        setTimeout(() => {
            alert(`恭喜！第 ${currentLevelIndex + 1} 关完成！步数：${steps}`);
            nextLevel();
        }, 100);
    }
}

// 键盘控制
function handleInput(e) {
    switch(e.key) {
        case 'ArrowUp': case 'w': case 'W': move(0, -1); break;
        case 'ArrowDown': case 's': case 'S': move(0, 1); break;
        case 'ArrowLeft': case 'a': case 'A': move(-1, 0); break;
        case 'ArrowRight': case 'd': case 'D': move(1, 0); break;
        case 'z': case 'Z': undoMove(); break;
        case 'r': case 'R': resetLevel(); break;
    }
}

// UI 按钮功能
function prevLevel() {
    if (currentLevelIndex > 0) loadLevel(currentLevelIndex - 1);
}

function nextLevel() {
    if (currentLevelIndex < levels.length - 1) loadLevel(currentLevelIndex + 1);
}

function resetLevel() {
    loadLevel(currentLevelIndex);
}

function updateUI() {
    document.getElementById('level-display').innerText = `${currentLevelIndex + 1} / ${levels.length}`;
    document.getElementById('step-display').innerText = steps;
}

// 启动
initGame();
