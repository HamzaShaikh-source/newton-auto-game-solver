const statusEl = document.getElementById('status');
const solveBtn = document.getElementById('solveBtn');
const resultArea = document.getElementById('resultArea');
const resultContent = document.getElementById('resultContent');
const gridPreview = document.getElementById('gridPreview');
const gridContainer = document.getElementById('gridContainer');

async function queryTabs() {
  const tabs = await chrome.tabs.query({
    url: ['https://learn.newtonschool.co/block-games/*']
  });
  return tabs[0] || null;
}

async function sendToTab(tabId, action) {
  try {
    return await chrome.tabs.sendMessage(tabId, { action });
  } catch {
    return null;
  }
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
      if (player && x === player.x && y === player.y) {
        cell.classList.add('player-cell');
      } else if (goal && x === goal.x && y === goal.y) {
        cell.classList.add('goal-cell');
      } else if (grid[y][x] === 'wall') {
        cell.classList.add('wall-cell');
      } else if (grid[y][x] === 'hazard') {
        cell.classList.add('hazard-cell');
      } else {
        cell.classList.add('path-cell');
      }
      gridContainer.appendChild(cell);
    }
  }
  gridPreview.style.display = 'block';
}

async function refreshStatus() {
  const tab = await queryTabs();
  if (!tab) {
    statusEl.className = 'status error';
    statusEl.textContent = 'Not on a Newton School game page';
    solveBtn.disabled = true;
    return;
  }

  const resp = await sendToTab(tab.id, 'status');
  if (!resp) {
    statusEl.className = 'status info';
    statusEl.textContent = 'Content script not loaded yet. Refresh the game page.';
    solveBtn.disabled = true;
    return;
  }

  if (resp.ready) {
    statusEl.className = 'status ready';
    statusEl.textContent = 'Solver ready';
    solveBtn.disabled = false;
  } else {
    statusEl.className = 'status info';
    statusEl.textContent = 'Solver initializing...';
    solveBtn.disabled = true;
  }

  if (resp.hasResult) {
    const result = await sendToTab(tab.id, 'getResult');
    if (result && result.path) {
      resultArea.style.display = 'block';
      let html = '';
      html += `Path: ${result.path.length - 1} steps<br>`;
      if (result.grid) {
        html += `Grid: ${result.grid.cols}x${result.grid.rows}<br>`;
      }
      if (result.injectionResult) {
        const inj = result.injectionResult;
        html += `Injection: ${inj.success ? 'Success' : 'Failed: ' + (inj.error || '')}`;
      }
      if (result.blocks) {
        html += `<br>Blocks: ${result.blocks.type} (${result.blocks.blocks ? result.blocks.blocks.length + ' ops' : ''})`;
      }
      resultContent.innerHTML = html;
    }
  }
}

solveBtn.addEventListener('click', async () => {
  const tab = await queryTabs();
  if (!tab) return;
  solveBtn.disabled = true;
  solveBtn.textContent = 'Solving...';
  await sendToTab(tab.id, 'solve');
  setTimeout(async () => {
    await refreshStatus();
    solveBtn.textContent = 'Auto-Solve This Level';
    solveBtn.disabled = false;
  }, 1500);
});

refreshStatus();
