(function () {
  'use strict';

  if (window.__ngs_solver_injected) return;
  window.__ngs_solver_injected = true;

  const TERRAIN_MAP = {
    'rock.png': 'wall', 'stone_1.png': 'wall', 'wood.png': 'wall',
    'normalglass.png': 'wall', 'brokenglass.png': 'hazard',
    'bush.png': 'path', 'grass_1.png': 'path', 'ground.png': 'path',
    'empty.png': 'path', 'tnt.png': 'hazard', 'food-png.png': 'goal',
    'water.png': 'goal', 'passenger.png': 'goal',
    'ball.png': 'goal', 'burger.png': 'goal', 'laddoo.png': 'goal',
  };

  let gameState = null;

  function readGameState() {
    const gridContainer = document.querySelector('[class*="map_element"]');
    if (!gridContainer) return null;

    const cells = gridContainer.querySelectorAll('img');
    const total = cells.length;
    const cols = Math.round(Math.sqrt(total));
    const rows = Math.ceil(total / cols);

    const grid = [];
    let playerPos = null;
    let goalPos = null;

    for (let i = 0; i < rows; i++) {
      const row = [];
      for (let j = 0; j < cols; j++) {
        const idx = i * cols + j;
        if (idx >= total) { row.push('path'); continue; }
        const filename = (cells[idx].src || '').split('/').pop();
        row.push(TERRAIN_MAP[filename] || 'path');
      }
      grid.push(row);
    }

    const spriteIcon = document.querySelector('.BlockGames_sprite_icon__bSyB5');
    const destIcon = document.querySelector('.BlockGames_destination_icon__X1Q8i');

    if (spriteIcon && gridContainer) {
      const gr = gridContainer.getBoundingClientRect();
      const sr = spriteIcon.getBoundingClientRect();
      const cellW = gr.width / cols;
      const cellH = gr.height / rows;
      playerPos = {
        x: Math.floor((sr.left - gr.left + sr.width / 2) / cellW),
        y: Math.floor((sr.top - gr.top + sr.height / 2) / cellH),
      };
    }

    if (destIcon && gridContainer) {
      const gr = gridContainer.getBoundingClientRect();
      const dr = destIcon.getBoundingClientRect();
      const cellW = gr.width / cols;
      const cellH = gr.height / rows;
      goalPos = {
        x: Math.floor((dr.left - gr.left + dr.width / 2) / cellW),
        y: Math.floor((dr.top - gr.top + dr.height / 2) / cellH),
      };
    }

    if (!playerPos || !goalPos) {
      for (let y = 0; y < rows && (!playerPos || !goalPos); y++) {
        for (let x = 0; x < cols && (!playerPos || !goalPos); x++) {
          const idx = y * cols + x;
          if (idx >= total) continue;
          const filename = (cells[idx].src || '').split('/').pop();
          if (!goalPos && (filename === 'water.png' || filename === 'passenger.png' ||
              filename === 'ball.png' || filename === 'burger.png' ||
              filename === 'laddoo.png' || filename === 'car.png' ||
              filename === 'food-png.png')) {
            goalPos = { x, y };
          }
        }
      }
    }

    gameState = { grid, rows, cols, player: playerPos, goal: goalPos };
    return gameState;
  }

  function findPath() {
    if (!gameState || !gameState.player || !gameState.goal) return null;
    const { grid, rows, cols, player, goal } = gameState;
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const cost = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
    const prev = Array.from({ length: rows }, () => Array(cols).fill(null));
    const open = [{ x: player.x, y: player.y, dir: -1 }];
    cost[player.y][player.x] = 0;

    const TURN_PENALTY = 0.5;

    while (open.length > 0) {
      open.sort((a, b) => cost[a.y][a.x] - cost[b.y][b.x]);
      const cur = open.shift();
      if (cost[cur.y][cur.x] === Infinity) break;
      if (cur.x === goal.x && cur.y === goal.y) {
        const path = [];
        let cx = goal.x, cy = goal.y;
        while (cx !== player.x || cy !== player.y) {
          path.unshift({ x: cx, y: cy });
          const p = prev[cy][cx];
          cx = p.x; cy = p.y;
        }
        path.unshift({ x: player.x, y: player.y });
        return path;
      }
      for (let di = 0; di < dirs.length; di++) {
        const [dx, dy] = dirs[di];
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        if (grid[ny][nx] === 'wall') continue;
        const turnCost = (cur.dir !== -1 && cur.dir !== di) ? TURN_PENALTY : 0;
        const nc = cost[cur.y][cur.x] + 1 + turnCost;
        if (nc < cost[ny][nx]) {
          cost[ny][nx] = nc;
          prev[ny][nx] = { x: cur.x, y: cur.y };
          open.push({ x: nx, y: ny, dir: di });
        }
      }
    }
    return null;
  }

  function findBlocklyWorkspace() {
    const el = document.querySelector('.BlockGames_blockly_workspace__wa5OY') ||
               document.querySelector('[class*="blockly_workspace"]');
    if (!el) return null;

    const fiberKeys = Object.keys(el).filter(k => k.startsWith('__reactFiber$'));
    if (fiberKeys.length === 0) return null;

    function deepSearch(obj, d) {
      if (!obj || typeof obj !== 'object' || d > 12) return null;
      if (obj.workspace && typeof obj.workspace.newBlock === 'function') return obj.workspace;
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          const r = deepSearch(obj[i], d + 1);
          if (r) return r;
        }
      } else {
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (v && typeof v === 'object') {
            const r = deepSearch(v, d + 1);
            if (r) return r;
          }
        }
      }
      return null;
    }

    let fiber = el[fiberKeys[0]];
    let depth = 0;
    while (fiber && depth < 40) {
      if (fiber.memoizedState) {
        const ws = deepSearch(fiber.memoizedState, 0);
        if (ws) return ws;
      }
      fiber = fiber.return;
      depth++;
    }
    return null;
  }

  function detectAvailableBlocks(workspace) {
    const candidates = [
      'move_forward', 'turn_left', 'turn_right', 'turn_block',
      'controls_repeat', 'repeat_until', 'repeat_n',
      'if_path_ahead', 'if_else',
    ];
    const available = [];
    for (const t of candidates) {
      try { workspace.newBlock(t); available.push(t); }
      catch (e) { /* not available */ }
    }
    return available;
  }

  function connectBlocks(parentBlock, childBlock, inputName) {
    const input = parentBlock.getInput(inputName || 'DO');
    if (input && input.connection) {
      return input.connection.connect(childBlock.previousConnection);
    }
    return null;
  }

  function createOpBlock(op, available, workspace) {
    if (op === 'forward' && available.includes('move_forward')) {
      const blk = workspace.newBlock('move_forward');
      blk.initSvg(); blk.render();
      return blk;
    }
    if (op === 'left' && available.includes('turn_left')) {
      const blk = workspace.newBlock('turn_left');
      blk.initSvg(); blk.render();
      return blk;
    }
    if (op === 'right' && available.includes('turn_right')) {
      const blk = workspace.newBlock('turn_right');
      blk.initSvg(); blk.render();
      return blk;
    }
    if ((op === 'left' || op === 'right') && available.includes('turn_block')) {
      const blk = workspace.newBlock('turn_block');
      const dirField = blk.getField('direction');
      if (dirField) dirField.setValue(op === 'left' ? 'turnLeft' : 'turnRight');
      blk.initSvg(); blk.render();
      return blk;
    }
    return null;
  }

  function injectRepeatBlock(repeatSpec, workspace) {
    const repeat = workspace.newBlock('controls_repeat');
    const timesField = repeat.getField('TIMES');
    if (timesField) timesField.setValue(String(repeatSpec.count));
    repeat.initSvg();
    repeat.render();
    if (repeatSpec.body && repeatSpec.body.length > 0) {
      let prevBody = null;
      for (const b of repeatSpec.body) {
        const blk = workspace.newBlock(b.type);
        blk.initSvg(); blk.render();
        if (prevBody) {
          prevBody.nextConnection && blk.previousConnection &&
            prevBody.nextConnection.connect(blk.previousConnection);
        }
        prevBody = blk;
      }
      if (prevBody) {
        const doInput = repeat.getInput('DO');
        doInput && doInput.connection && prevBody.previousConnection &&
          doInput.connection.connect(prevBody.previousConnection);
      }
    }
    return repeat;
  }

  function injectOpSequence(ops, available, workspace) {
    let prevBlock = null;
    for (const op of ops) {
      const blk = createOpBlock(op, available, workspace);
      if (blk && prevBlock) {
        prevBlock.nextConnection && blk.previousConnection &&
          prevBlock.nextConnection.connect(blk.previousConnection);
      }
      if (blk) prevBlock = blk;
    }
  }

  function injectBlocks(blocks, available) {
    const workspace = findBlocklyWorkspace();
    if (!workspace) return { success: false, error: 'Blockly workspace not found' };

    try {
      workspace.clear();

      if (blocks.type === 'repeat_n' && available.includes('controls_repeat')) {
        injectRepeatBlock(blocks, workspace);
      } else if (blocks.type === 'sequence') {
        injectOpSequence(blocks.blocks, available, workspace);
      } else if (blocks.type === 'mixed') {
        let prevBlock = null;
        for (const part of blocks.parts) {
          if (typeof part === 'object' && part.type === 'repeat_n') {
            const repeat = injectRepeatBlock(part, workspace);
            if (repeat && prevBlock) {
              prevBlock.nextConnection && repeat.previousConnection &&
                prevBlock.nextConnection.connect(repeat.previousConnection);
            }
            if (repeat) prevBlock = repeat;
          } else {
            const blk = createOpBlock(part, available, workspace);
            if (blk && prevBlock) {
              prevBlock.nextConnection && blk.previousConnection &&
                prevBlock.nextConnection.connect(blk.previousConnection);
            }
            if (blk) prevBlock = blk;
          }
        }
      }

      workspace.render();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  function computeDirectionChanges(path) {
    const dirs = [];
    for (let i = 1; i < path.length; i++) {
      const dx = path[i].x - path[i - 1].x;
      const dy = path[i].y - path[i - 1].y;
      if (dx === 1) dirs.push(1);
      else if (dx === -1) dirs.push(3);
      else if (dy === -1) dirs.push(0);
      else if (dy === 1) dirs.push(2);
    }
    return dirs;
  }

  function detectInitialDirection() {
    const innerDiv = document.querySelector('.BlockGames_sprite_icon__bSyB5 > div');
    if (innerDiv) {
      for (const cls of innerDiv.classList) {
        if (cls.includes('rotateimg0')) return 0;
        if (cls.includes('rotateimg90')) return 1;
        if (cls.includes('rotateimg180')) return 2;
        if (cls.includes('rotateimg270')) return 3;
      }
    }
    return 1;
  }

  function buildBlockSequence(dirs, available) {
    const hasTurnLeft = available.includes('turn_left') || available.includes('turn_block');
    const hasTurnRight = available.includes('turn_right') || available.includes('turn_block');
    const hasRepeat = available.includes('controls_repeat');

    let facing = detectInitialDirection();
    const ops = [];

    for (let i = 0; i < dirs.length; i++) {
      const targetDir = dirs[i];
      if (targetDir !== facing) {
        if (hasTurnLeft || hasTurnRight) {
          const leftTurns = (facing - targetDir + 4) % 4;
          const rightTurns = (targetDir - facing + 4) % 4;
          if (hasTurnRight && (rightTurns <= leftTurns || !hasTurnLeft)) {
            for (let t = 0; t < rightTurns; t++) ops.push('right');
          } else if (hasTurnLeft) {
            for (let t = 0; t < leftTurns; t++) ops.push('left');
          }
          facing = targetDir;
        }
      }
      ops.push('forward');
    }

    if (hasRepeat) {
      if (ops.length >= 2 && ops.every(o => o === 'forward')) {
        return { type: 'repeat_n', count: ops.length, body: [{ type: 'move_forward' }] };
      }
      let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
      for (let i = 0; i < ops.length; i++) {
        if (ops[i] === 'forward') {
          if (curStart === -1) curStart = i;
          curLen++;
        } else {
          if (curLen > bestLen && curLen > 2) { bestStart = curStart; bestLen = curLen; }
          curStart = -1; curLen = 0;
        }
      }
      if (curLen > bestLen && curLen > 2) { bestStart = curStart; bestLen = curLen; }

      if (bestStart !== -1) {
        const parts = [];
        let i = 0;
        while (i < ops.length) {
          if (i === bestStart) {
            parts.push({ type: 'repeat_n', count: bestLen, body: [{ type: 'move_forward' }] });
            i += bestLen;
          } else {
            parts.push(ops[i]);
            i++;
          }
        }
        return { type: 'mixed', parts };
      }
    }

    return { type: 'sequence', blocks: ops };
  }

  function solve() {
    readGameState();
    if (!gameState || !gameState.player || !gameState.goal) return null;

    const path = findPath();
    if (!path) return null;

    const workspace = findBlocklyWorkspace();
    if (!workspace) return { path, error: 'workspace not found' };

    const available = detectAvailableBlocks(workspace);
    const hasMove = available.includes('move_forward');
    if (!hasMove) return { path, error: 'no move_forward block available' };

    const dirs = computeDirectionChanges(path);
    const blocks = buildBlockSequence(dirs, available);
    const result = injectBlocks(blocks, available);

    return {
      path: path.map(p => ({ x: p.x, y: p.y })),
      blocks,
      injectionResult: result,
      availableBlocks: available,
      grid: { rows: gameState.rows, cols: gameState.cols },
      player: gameState.player,
      goal: gameState.goal,
    };
  }

  function autoSolve() {
    const result = solve();
    window.postMessage({
      type: '__ngs_solver_result',
      payload: result || { error: 'No solution found' }
    }, '*');
  }

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === '__ngs_auto_solve') {
      autoSolve();
    }
  });

  window.postMessage({ type: '__ngs_solver_ready' }, '*');

  window.__ngs_auto_solve = autoSolve;
  window.__ngs_solve = solve;
  window.__ngs_getState = () => gameState;
})();
