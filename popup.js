const statusEl = document.getElementById('status');
const solveBtn = document.getElementById('solveBtn');
const resultArea = document.getElementById('resultArea');
const resultContent = document.getElementById('resultContent');
const gridPreview = document.getElementById('gridPreview');
const gridContainer = document.getElementById('gridContainer');
const devNoticeBtn = document.getElementById('devNoticeBtn');

const GITHUB_PAGES_URL = 'https://hamzashaikh-source.github.io/newton-auto-game-solver/';
const NETLIFY_URL = ''; // Set after deployment: 'https://your-site.netlify.app/'

devNoticeBtn.href = NETLIFY_URL || GITHUB_PAGES_URL;

async function sendMsg(action) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return null;
    const ok = tab.url.includes('learn.newtonschool.co/block-games') ||
               tab.url.includes('my.newtonschool.co/playground/game');
    if (!ok) return null;
    return await chrome.tabs.sendMessage(tab.id, { action });
  } catch { return null; }
}

function renderGridPreview(grid, player, goal) {
  if (!grid || grid.length === 0) return;
  const rows = grid.length;
  const cols = grid[0].length;
  gridContainer.style.gridTemplateColumns = `repeat(${cols}, 10px)`;
  gridContainer.innerHTML = '';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (player && x === player.x && y === player.y) cell.classList.add('player-cell');
      else if (goal && x === goal.x && y === goal.y) cell.classList.add('goal-cell');
      else if (grid[y][x] === 'wall') cell.classList.add('wall-cell');
      else if (grid[y][x] === 'hazard') cell.classList.add('hazard-cell');
      else cell.classList.add('path-cell');
      gridContainer.appendChild(cell);
    }
  }
  gridPreview.style.display = 'block';
}

function setStatus(type, text) {
  const icons = {
    ready: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  };
  statusEl.className = `status-bar status-${type}`;
  statusEl.innerHTML = (icons[type] || '') + '<span>' + text + '</span>';
}

function setSolveBtn(disabled, text) {
  solveBtn.disabled = disabled;
  solveBtn.querySelector('span').innerHTML = text;
}

async function refreshStatus() {
  const resp = await sendMsg('status');
  if (!resp) {
    setStatus('error', 'Not on a Newton School game page');
    setSolveBtn(true, 'Auto-Solve This Level');
    return;
  }
  if (resp.ready) {
    setStatus('ready', 'Solver ready &mdash; ' + (resp.gameName || 'game detected'));
    setSolveBtn(false, '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Auto-Solve This Level');
  } else {
    setStatus('info', 'Solver initializing&hellip;');
    setSolveBtn(true, 'Auto-Solve This Level');
  }
  if (resp.hasResult) {
    const result = await sendMsg('getResult');
    if (result) displayResult(result);
  }
}

function displayResult(result) {
  resultArea.style.display = 'block';
  let html = '';

  // Path info
  if (result.path) {
    html += `<span class="lbl">Path:</span> <span class="val">${result.path.length - 1} steps</span>`;
    html += ` <span class="lbl">from</span> <span class="val">(${result.player.x},${result.player.y})</span>`;
    html += ` <span class="lbl">to</span> <span class="val">(${result.goal.x},${result.goal.y})</span><br>`;
  }

  // Grid info
  if (result.grid) {
    html += `<span class="lbl">Grid:</span> <span class="val">${result.grid.cols}x${result.grid.rows}</span>`;
    if (result.availableBlocks) {
      html += ` <span class="lbl">Blocks:</span> <span class="val">${result.availableBlocks.length}</span>`;
    }
    if (result.budget !== null && result.budget !== undefined) {
      html += ` <span class="lbl">Budget:</span> <span class="val">${result.budget}</span>`;
    }
    html += '<br>';
  }

  // Strategy
  if (result.strategy) {
    html += `<span class="lbl">Strategy:</span> <span class="val">${result.strategy}</span>`;
    if (result.blockCount !== undefined) {
      html += ` <span class="lbl">Blocks used:</span> <span class="val">${result.blockCount}</span>`;
    }
    html += '<br>';
  }

  // Injection result
  if (result.injectionResult) {
    const inj = result.injectionResult;
    if (inj.success) {
      html += `<span class="lbl">Injection:</span> <span class="val-ok">Success</span>`;
      if (inj.blocks && inj.blocks.root) {
        const root = inj.blocks.root;
        html += ` <span class="lbl">Type:</span> <span class="val">${root.type || '?'}</span>`;
        if (root.count) html += ` <span class="lbl">Count:</span> <span class="val">${root.count}</span>`;
      }
    } else {
      html += `<span class="lbl">Injection:</span> <span class="val-bad">Failed: ${escapeHtml(inj.error || 'unknown')}</span>`;
    }
    html += '<br>';
  }

  // Budget exceeded
  if (result.budgetExceeded) {
    html += `<span class="lbl">Warning:</span> <span class="val-bad">Budget exceeded (${result.blockCount} > ${result.budget})</span><br>`;
  }

  resultContent.innerHTML = html;

  if (result.grid && result.player) {
    renderGridPreview(result.grid.data, result.player, result.goal);
  }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

solveBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;
  const ok = tab.url.includes('learn.newtonschool.co/block-games') ||
             tab.url.includes('my.newtonschool.co/playground/game');
  if (!ok) return;

  setSolveBtn(true, '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" class="spin" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Solving...');

  // Clear previous result
  resultArea.style.display = 'none';
  gridPreview.style.display = 'none';

  await chrome.tabs.sendMessage(tab.id, { action: 'solve' });

  // Poll for result
  let attempts = 0;
  const poll = async () => {
    attempts++;
    const r = await sendMsg('getResult');
    if (r && (r.path || r.error)) {
      displayResult(r);
      setSolveBtn(false, '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Auto-Solve This Level');
      if (r.error) setStatus('error', 'Solve failed: ' + r.error);
    } else if (attempts < 20) {
      setTimeout(poll, 500);
    } else {
      setSolveBtn(false, '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Auto-Solve This Level');
      setStatus('info', 'Solve timed out &mdash; try again');
    }
  };
  setTimeout(poll, 800);
});

refreshStatus();
