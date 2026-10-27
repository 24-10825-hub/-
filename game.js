// ─────────────────────────────────────────────
//  Minesweeper — Normal + Time Attack Modes
//  Chord feature: 숫자 = 깃발 수 → 클릭 → 자동 오픈
// ─────────────────────────────────────────────

// ─── Level config ───
const LEVELS = {
  easy:   { rows: 9,  cols: 9,  mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard:   { rows: 16, cols: 30, mines: 99 },
};

// Time limits (seconds) per difficulty for timed mode
const TIME_LIMITS = {
  easy:   2 * 60,       // 2:00
  medium: 8 * 60,       // 8:00
  hard:   20 * 60,      // 20:00
};

// ─── Global state ───
let state = {
  mode: 'normal',       // 'normal' | 'timed'
  level: 'easy',
  rows: 9, cols: 9, mines: 10,
  board: [],
  gameOver: false,
  gameWon: false,
  started: false,
  flagCount: 0,
  revealedCount: 0,
  timerInterval: null,
  elapsed: 0,           // counts UP always
  timeLimit: 0,         // >0 only in timed mode
};

// ─── Cell factory ───
function makeCell() {
  return { isMine: false, isOpen: false, isFlagged: false, number: 0 };
}

// ─────────────────────────────────────────────
//  Game Lifecycle
// ─────────────────────────────────────────────
function initGame(level, mode) {
  clearInterval(state.timerInterval);
  const cfg = LEVELS[level];
  const timeLimit = (mode === 'timed') ? TIME_LIMITS[level] : 0;

  state = {
    mode,
    level,
    rows: cfg.rows,
    cols: cfg.cols,
    mines: cfg.mines,
    board: Array.from({ length: cfg.rows }, () =>
      Array.from({ length: cfg.cols }, makeCell)
    ),
    gameOver: false,
    gameWon: false,
    started: false,
    flagCount: 0,
    revealedCount: 0,
    timerInterval: null,
    elapsed: 0,
    timeLimit,
  };

  updateMineDisplay();
  resetTimerDisplay();
  setEmoji('😊');
  renderBoard();
  removeOverlay();
  updateCountdownBar(1); // full bar
  updateTimerLabel();
}

// ─── Place mines (first click always safe) ───
function placeMines(safeR, safeC) {
  const { rows, cols, mines, board } = state;
  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (board[r][c].isMine) continue;
    if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
    board[r][c].isMine = true;
    placed++;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!board[r][c].isMine)
        board[r][c].number = neighbors(r, c).filter(([nr, nc]) => board[nr][nc].isMine).length;
    }
  }
}

// ─── Neighbors ───
function neighbors(r, c) {
  const { rows, cols } = state;
  const out = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push([nr, nc]);
    }
  return out;
}

// ─── Reveal (BFS) ───
function reveal(r, c, chordAnim = false) {
  const { board } = state;
  const cell = board[r][c];
  if (cell.isOpen || cell.isFlagged) return;
  if (cell.isMine) { explode(r, c); return; }

  const queue = [[r, c]];
  const visited = new Set();
  while (queue.length) {
    const [cr, cc] = queue.shift();
    const key = `${cr},${cc}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const cur = board[cr][cc];
    if (cur.isOpen || cur.isFlagged || cur.isMine) continue;
    cur.isOpen = true;
    state.revealedCount++;
    renderCell(cr, cc, chordAnim);
    if (cur.number === 0)
      neighbors(cr, cc).forEach(n => queue.push(n));
  }
  updateChordHighlights();
  checkWin();
}

// ─── CHORD feature ───
function chord(r, c) {
  const { board } = state;
  const cell = board[r][c];
  if (!cell.isOpen || cell.number === 0) return;

  const nbrs = neighbors(r, c);
  const flaggedCount = nbrs.filter(([nr, nc]) => board[nr][nc].isFlagged).length;
  if (flaggedCount !== cell.number) return;

  const toReveal = nbrs.filter(([nr, nc]) => !board[nr][nc].isFlagged && !board[nr][nc].isOpen);
  let hitMine = false;
  toReveal.forEach(([nr, nc]) => { if (board[nr][nc].isMine) hitMine = true; });

  toReveal.forEach(([nr, nc]) => {
    if (board[nr][nc].isMine) explode(nr, nc);
    else reveal(nr, nc, true);
  });

  if (!hitMine && !state.gameOver) showToast('⚡ 코드! 자동 오픈!');
}

// ─── Explode ───
function explode(r, c) {
  if (state.gameOver) return;
  state.gameOver = true;
  clearInterval(state.timerInterval);
  setEmoji('😵');

  setTimeout(() => {
    state.board.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        if (cell.isMine) {
          cell.isOpen = true;
          renderCell(ri, ci);
          if (ri === r && ci === c) getCellEl(ri, ci).classList.add('exploded');
        } else if (cell.isFlagged) {
          getCellEl(ri, ci).classList.add('wrong-flag');
          getCellEl(ri, ci).textContent = '❌';
        }
      });
    });
    showOverlay(false);
  }, 300);
}

// ─── Time Up ───
function timeUp() {
  if (state.gameOver) return;
  state.gameOver = true;
  clearInterval(state.timerInterval);
  setEmoji('😵');
  updateCountdownBar(0);

  // Reveal all mines
  setTimeout(() => {
    state.board.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        if (cell.isMine) { cell.isOpen = true; renderCell(ri, ci); }
      });
    });
    showOverlay(false, true); // true = time-up reason
  }, 300);
}

// ─── Check win ───
function checkWin() {
  const { rows, cols, mines, board, revealedCount } = state;
  if (revealedCount === rows * cols - mines) {
    state.gameWon = true;
    state.gameOver = true;
    clearInterval(state.timerInterval);
    setEmoji('😎');
    updateCountdownBar(state.timeLimit ? (state.timeLimit - state.elapsed) / state.timeLimit : 1);
    board.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell.isMine && !cell.isFlagged) { cell.isFlagged = true; renderCell(r, c); }
      });
    });
    showOverlay(true);
  }
}

// ─────────────────────────────────────────────
//  Timer
// ─────────────────────────────────────────────
function startTimer() {
  state.elapsed = 0;
  state.timerInterval = setInterval(() => {
    state.elapsed++;

    if (state.mode === 'timed') {
      const remaining = state.timeLimit - state.elapsed;
      updateTimerDisplay(remaining);
      updateCountdownBar(Math.max(0, remaining / state.timeLimit));
      updateBarClass(remaining);
      // Warn at 30s
      if (remaining === 30) showDangerToast('⚠️ 30초 남았어요!');
      if (remaining <= 0) { timeUp(); return; }
    } else {
      updateTimerDisplay(state.elapsed);
    }
  }, 1000);
}

function formatTime(sec) {
  const s = Math.abs(Math.floor(sec));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

function resetTimerDisplay() {
  const el = document.getElementById('timer');
  el.classList.remove('urgent');
  if (state.mode === 'timed') {
    el.textContent = formatTime(TIME_LIMITS[state.level]);
  } else {
    el.textContent = '00:00';
  }
}

function updateTimerDisplay(value) {
  const el = document.getElementById('timer');
  el.textContent = formatTime(value);
  // Add urgent class when ≤30s remain in timed mode
  if (state.mode === 'timed') {
    el.classList.toggle('urgent', value <= 30);
  }
}

function updateTimerLabel() {
  const icon  = document.getElementById('timer-icon');
  const label = document.getElementById('timer-label');
  if (state.mode === 'timed') {
    icon.textContent  = '⏰';
    label.textContent = '남은 시간';
  } else {
    icon.textContent  = '⏱️';
    label.textContent = '경과 시간';
  }
}

function updateMineDisplay() {
  document.getElementById('mine-count').textContent =
    Math.max(0, state.mines - state.flagCount);
}

function setEmoji(e) {
  document.getElementById('emoji-btn').textContent = e;
}

// ─── Countdown bar ───
function updateCountdownBar(ratio) {
  const bar = document.getElementById('countdown-bar');
  bar.style.width = `${Math.max(0, ratio * 100)}%`;
}

function updateBarClass(remaining) {
  const bar = document.getElementById('countdown-bar');
  bar.classList.remove('warning', 'danger');
  if (remaining <= 30)  bar.classList.add('danger');
  else if (remaining <= state.timeLimit * 0.3) bar.classList.add('warning');
}

// ─── Chord-ready highlight ───
function updateChordHighlights() {
  const { board, rows, cols } = state;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      const el = getCellEl(r, c);
      if (!el) continue;
      if (cell.isOpen && cell.number > 0) {
        const flags = neighbors(r, c).filter(([nr, nc]) => board[nr][nc].isFlagged).length;
        el.classList.toggle('chord-ready', flags === cell.number);
      }
    }
  }
}

// ─────────────────────────────────────────────
//  Rendering
// ─────────────────────────────────────────────
function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.style.gridTemplateColumns = `repeat(${state.cols}, var(--cell-size))`;
  boardEl.innerHTML = '';
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const el = document.createElement('div');
      el.className = 'cell closed';
      el.id = `cell-${r}-${c}`;
      el.dataset.r = r;
      el.dataset.c = c;
      el.addEventListener('click', onLeftClick);
      el.addEventListener('contextmenu', onRightClick);
      el.addEventListener('mousedown', e => { if (e.button === 1) { e.preventDefault(); chord(r, c); } });
      boardEl.appendChild(el);
    }
  }
}

function renderCell(r, c, useChordAnim = false) {
  const cell = state.board[r][c];
  const el = getCellEl(r, c);
  if (!el) return;

  el.className = 'cell';
  el.textContent = '';
  el.removeAttribute('data-n');

  if (!cell.isOpen) {
    el.classList.add(cell.isFlagged ? 'flagged' : 'closed');
    el.textContent = cell.isFlagged ? '🚩' : '';
  } else {
    if (cell.isMine) {
      el.classList.add('mine-revealed');
      el.textContent = '💣';
    } else {
      el.classList.add('open');
      if (useChordAnim) el.classList.add('chord-open');
      if (cell.number > 0) {
        el.textContent = cell.number;
        el.dataset.n = cell.number;
      }
    }
  }
}

function getCellEl(r, c) {
  return document.getElementById(`cell-${r}-${c}`);
}

// ─────────────────────────────────────────────
//  Event Handlers
// ─────────────────────────────────────────────
function onLeftClick(e) {
  const r = +e.currentTarget.dataset.r;
  const c = +e.currentTarget.dataset.c;
  if (state.gameOver) return;

  const cell = state.board[r][c];

  // Momentary surprised face
  setEmoji('😮');
  setTimeout(() => {
    if (!state.gameOver) setEmoji('😊');
  }, 300);

  if (cell.isFlagged) return;

  if (cell.isOpen) {
    chord(r, c);
    return;
  }

  if (!state.started) {
    state.started = true;
    placeMines(r, c);
    startTimer();
  }
  reveal(r, c);
}

function onRightClick(e) {
  e.preventDefault();
  const r = +e.currentTarget.dataset.r;
  const c = +e.currentTarget.dataset.c;
  if (state.gameOver) return;

  const cell = state.board[r][c];
  if (cell.isOpen) return;

  cell.isFlagged = !cell.isFlagged;
  state.flagCount += cell.isFlagged ? 1 : -1;
  renderCell(r, c);
  updateMineDisplay();
  updateChordHighlights();
}

// ─────────────────────────────────────────────
//  Overlay
// ─────────────────────────────────────────────
function showOverlay(win, timeUp = false) {
  removeOverlay();
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.id = 'overlay';

  const card = document.createElement('div');
  card.className = 'overlay-card';

  // Badge
  const badge = document.createElement('div');
  badge.className = 'overlay-badge' + (state.mode === 'timed' ? ' timed' : '');
  badge.textContent = state.mode === 'timed' ? '⏰ 타임 어택' : '🕹️ 일반 모드';

  const emoji = document.createElement('div');
  emoji.className = 'overlay-emoji';

  const title = document.createElement('div');
  title.className = 'overlay-title';

  const sub = document.createElement('div');
  sub.className = 'overlay-sub';

  if (win) {
    emoji.textContent = '🎉';
    title.style.color = '#a78bfa';
    title.textContent = '승리!';
    if (state.mode === 'timed') {
      const remaining = state.timeLimit - state.elapsed;
      sub.textContent = `${formatTime(state.elapsed)} 만에 클리어! 남은 시간 ${formatTime(remaining)} 🏆`;
    } else {
      sub.textContent = `${formatTime(state.elapsed)} 만에 클리어! 대단해요! 🏆`;
    }
  } else if (timeUp) {
    emoji.textContent = '⌛';
    title.style.color = '#ff7043';
    title.textContent = '시간 초과!';
    sub.textContent = '시간이 다 됐어요. 다시 도전해봐요!';
  } else {
    emoji.textContent = '💥';
    title.style.color = '#f87171';
    title.textContent = '게임 오버!';
    sub.textContent = state.mode === 'timed'
      ? `남은 시간 ${formatTime(Math.max(0, state.timeLimit - state.elapsed))} 남겨두고 폭발!`
      : '다시 도전해봐요!';
  }

  const btn = document.createElement('button');
  btn.className = 'overlay-btn';
  btn.textContent = '🔄 다시 시작';
  btn.onclick = () => initGame(state.level, state.mode);

  card.append(badge, emoji, title, sub, btn);
  ov.appendChild(card);
  document.body.appendChild(ov);
}

function removeOverlay() {
  document.getElementById('overlay')?.remove();
}

// ─────────────────────────────────────────────
//  Toast
// ─────────────────────────────────────────────
let toastTimeout = null;

function showToast(msg) {
  const t = document.getElementById('toast');
  t.classList.remove('danger-toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove('show'), 2000);
}

function showDangerToast(msg) {
  const t = document.getElementById('toast');
  t.classList.add('danger-toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { t.classList.remove('show'); t.classList.remove('danger-toast'); }, 3000);
}

// ─────────────────────────────────────────────
//  UI Bindings
// ─────────────────────────────────────────────
let currentMode = 'normal';
let currentLevel = 'easy';

function applyMode(mode) {
  currentMode = mode;

  // Toggle active on mode buttons
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));

  // Show/hide timed extras
  const isTimed = mode === 'timed';
  document.getElementById('time-limits-info').style.display  = isTimed ? 'flex' : 'none';
  document.getElementById('countdown-bar-wrap').style.display = isTimed ? 'block' : 'none';
  document.body.classList.toggle('timed-mode', isTimed);

  initGame(currentLevel, mode);
}

function applyLevel(level) {
  currentLevel = level;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.level === level));
  initGame(level, currentMode);
}

// Mode buttons
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => applyMode(btn.dataset.mode));
});

// Difficulty tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => applyLevel(tab.dataset.level));
});

// New game / emoji reset
document.getElementById('btn-new').addEventListener('click',   () => initGame(currentLevel, currentMode));
document.getElementById('emoji-btn').addEventListener('click', () => initGame(currentLevel, currentMode));

// Prevent board context menu
document.getElementById('board').addEventListener('contextmenu', e => e.preventDefault());

// ─── Boot ───
initGame('easy', 'normal');
