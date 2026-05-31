const statusEl = document.getElementById('status');
const solveBtn = document.getElementById('solveBtn');
const resultArea = document.getElementById('resultArea');
const resultContent = document.getElementById('resultContent');
const gridPreview = document.getElementById('gridPreview');
const gridContainer = document.getElementById('gridContainer');

async function sendMsg(action) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('learn.newtonschool.co/block-games')) return null;
    return await chrome.tabs.sendMessage(tab.id, { action });
  } catch { return null; }
}

function renderGridPreview(grid, player, goal) {
  if (!grid || grid.length === 0) return;
  const rows = grid.length;
  const cols = grid[0].length;
  gridContainer.style.gridTemplateColumns = `repeat(${cols}, 12px)`;
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

async function refreshStatus() {
  const resp = await sendMsg('status');
  if (!resp) {
    statusEl.className = 'status error';
    statusEl.textContent = '❌ Not on a Newton School game page';
    solveBtn.disabled = true;
    return;
  }
  if (resp.ready) {
    statusEl.className = 'status ready';
    statusEl.textContent = '✅ Solver ready';
    solveBtn.disabled = false;
  } else {
    statusEl.className = 'status info';
    statusEl.textContent = '⏳ Solver initializing...';
    solveBtn.disabled = true;
  }
  if (resp.hasResult) {
    const result = await sendMsg('getResult');
    if (result && result.path) {
      resultArea.style.display = 'block';
      let html = `<span class="label">Path:</span> <span class="value">${result.path.length - 1} steps</span><br>`;
      if (result.grid) html += `<span class="label">Grid:</span> <span class="value">${result.grid.cols}x${result.grid.rows}</span><br>`;
      if (result.injectionResult) {
        const inj = result.injectionResult;
        html += `<span class="label">Injection:</span> <span class="value">${inj.success ? 'Success' : 'Failed: ' + (inj.error || '')}</span>`;
      }
      if (result.blocks) {
        const blkType = result.blocks.type;
        const count = result.blocks.blocks ? result.blocks.blocks.length : (result.blocks.parts ? result.blocks.parts.length : '');
        html += `<br><span class="label">Blocks:</span> <span class="value">${blkType}${count ? ' (' + count + ' ops)' : ''}</span>`;
      }
      resultContent.innerHTML = html;
      if (result.grid && result.player) {
        const g = Array.from({ length: result.grid.rows }, () => Array(result.grid.cols).fill('path'));
        // grid data not included in result, skip preview
      }
    }
  }
}

solveBtn.addEventListener('click', async () => {
  const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab || !tab.url || !tab.url.includes('learn.newtonschool.co/block-games')) return;
  solveBtn.disabled = true;
  solveBtn.textContent = 'Solving...';
  await chrome.tabs.sendMessage(tab.id, { action: 'solve' });
  setTimeout(async () => {
    await refreshStatus();
    solveBtn.textContent = '🧠 Auto-Solve This Level';
    solveBtn.disabled = false;
  }, 1500);
});

refreshStatus();
