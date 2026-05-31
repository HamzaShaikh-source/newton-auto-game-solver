(function () {
  'use strict';

  if (window.__ngs_solver_injected) return;
  window.__ngs_solver_injected = true;

  const TERRAIN_MAP = {
    'rock.png': 'wall', 'stone_1.png': 'wall', 'wood.png': 'wall',
    'normalglass.png': 'wall', 'brokenglass.png': 'hazard',
    'bush.png': 'path', 'grass_1.png': 'path', 'ground.png': 'path',
    'empty.png': 'path', 'tnt.png': 'hazard',
    'food-png.png': 'goal',
    'water.png': 'goal', 'passenger.png': 'goal',
    'ball.png': 'goal', 'burger.png': 'goal', 'laddoo.png': 'goal',
    'boatland_3.png': 'wall', 'boatland_4.png': 'wall',
    'waterBoatToTheShore.png': 'path',
    'floor-1.png': 'path', 'floor.png': 'path',
    'tile 2.png': 'path', 'tile-1.png': 'path',
    'shore.png': 'goal',
  };

  function decodeFilename(name) {
    try { return decodeURIComponent(name); } catch(e) { return name; }
  }

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
        const filename = decodeFilename((cells[idx].src || '').split('/').pop()).toLowerCase();
        const terrain = TERRAIN_MAP[filename] || 'path';
        row.push(terrain);
        if (terrain === 'goal') goalPos = { x: j, y: i };
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

    if (!goalPos) {
      for (let y = 0; y < rows && !goalPos; y++) {
        for (let x = 0; x < cols && !goalPos; x++) {
          if (grid[y][x] === 'goal') goalPos = { x, y };
        }
      }
    }

    gameState = { grid, rows, cols, player: playerPos, goal: goalPos };
    return gameState;
  }

  function readBlockBudget() {
    const el = document.querySelector('[class*="blockLimitDisplay"]');
    if (!el) return null;
    const match = el.textContent.trim().match(/BLOCKS\s*LEFT\s*:\s*(\d+)/i);
    return match ? parseInt(match[1]) : null;
  }

  function countBlocks(blocks) {
    if (blocks.type === 'repeat_n') {
      return 1 + (blocks.body ? blocks.body.length : 0);
    }
    if (blocks.type === 'sequence') {
      return blocks.blocks.length;
    }
    if (blocks.type === 'mixed') {
      return blocks.parts.reduce((c, p) => {
        return c + (typeof p === 'object' && p.type === 'repeat_n' ? 1 + (p.body ? p.body.length : 0) : 1);
      }, 0);
    }
    return 0;
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

    let effectiveGoal = { x: goal.x, y: goal.y };
    const goalIsBlocked = grid[goal.y][goal.x] === 'wall' || grid[goal.y][goal.x] === 'hazard';

    while (open.length > 0) {
      open.sort((a, b) => cost[a.y][a.x] - cost[b.y][b.x]);
      const cur = open.shift();
      if (cost[cur.y][cur.x] === Infinity) break;
      if (cur.x === effectiveGoal.x && cur.y === effectiveGoal.y) {
        const path = [];
        let cx = effectiveGoal.x, cy = effectiveGoal.y;
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
        const isGoal = nx === goal.x && ny === goal.y;
        if ((grid[ny][nx] === 'wall' || grid[ny][nx] === 'hazard') && !isGoal) continue;
        const turnCost = (cur.dir !== -1 && cur.dir !== di) ? TURN_PENALTY : 0;
        const nc = cost[cur.y][cur.x] + 1 + turnCost;
        if (nc < cost[ny][nx]) {
          cost[ny][nx] = nc;
          prev[ny][nx] = { x: cur.x, y: cur.y };
          open.push({ x: nx, y: ny, dir: di });
        }
      }
    }

    if (goalIsBlocked) {
      let bestAdj = null, bestDist = Infinity;
      for (let di = 0; di < dirs.length; di++) {
        const [dx, dy] = dirs[di];
        const nx = goal.x + dx, ny = goal.y + dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        if (cost[ny][nx] < bestDist && grid[ny][nx] !== 'wall' && grid[ny][nx] !== 'hazard') {
          bestDist = cost[ny][nx];
          bestAdj = { x: nx, y: ny };
        }
      }
      if (bestAdj) {
        effectiveGoal = bestAdj;
        const path = [];
        let cx = bestAdj.x, cy = bestAdj.y;
        while (cx !== player.x || cy !== player.y) {
          path.unshift({ x: cx, y: cy });
          const p = prev[cy][cx];
          cx = p.x; cy = p.y;
        }
        path.unshift({ x: player.x, y: player.y });
        return path;
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
    const available = [];
    const tree = workspace.options && workspace.options.languageTree;
    if (tree && tree.contents) {
      tree.contents.forEach(item => {
        if (item.type) available.push(item.type);
      });
    }
    if (available.length === 0) {
      const candidates = ['move_forward', 'turn_left', 'turn_right', 'turn_block',
        'fixed_repeat', 'repeat_block', 'controls_repeat'];
      for (const t of candidates) {
        try { workspace.newBlock(t); available.push(t); } catch (e) {}
      }
      workspace.clear();
    }
    return available;
  }

  function findRepeatType(available) {
    if (available.includes('fixed_repeat')) return 'fixed_repeat';
    if (available.includes('repeat_block')) return 'repeat_block';
    if (available.includes('controls_repeat')) return 'controls_repeat';
    return null;
  }

  function createOpBlock(op, available, workspace) {
    if (op === 'forward' && available.includes('move_forward')) {
      const blk = workspace.newBlock('move_forward');
      blk.initSvg(); blk.render();
      return blk;
    }
    const hasTurnBlock = available.includes('turn_block');
    const hasTurnLeft = available.includes('turn_left');
    const hasTurnRight = available.includes('turn_right');

    if (op === 'left' && hasTurnLeft) {
      const blk = workspace.newBlock('turn_left');
      blk.initSvg(); blk.render();
      return blk;
    }
    if (op === 'right' && hasTurnRight) {
      const blk = workspace.newBlock('turn_right');
      blk.initSvg(); blk.render();
      return blk;
    }
    if ((op === 'left' || op === 'right') && hasTurnBlock) {
      const blk = workspace.newBlock('turn_block');
      const dirField = blk.getField('direction');
      if (dirField) dirField.setValue(op === 'left' ? 'turnLeft()' : 'turnRight()');
      blk.initSvg(); blk.render();
      return blk;
    }
    return null;
  }

  function injectRepeatBlock(repeatSpec, workspace, repeatType) {
    const blk = workspace.newBlock(repeatType);
    if (repeatType === 'fixed_repeat') {
      const timesField = blk.getField('num_input');
      if (timesField) timesField.setValue(String(repeatSpec.count));
    } else if (repeatType === 'controls_repeat') {
      const timesField = blk.getField('TIMES');
      if (timesField) timesField.setValue(String(repeatSpec.count));
    }
    blk.initSvg();
    blk.render();

    const bodyInputName = repeatType === 'fixed_repeat' ? 'for_statement' :
                          repeatType === 'repeat_block' ? 'inside_repeat' : 'DO';

    if (repeatSpec.body && repeatSpec.body.length > 0) {
      let prevBody = null;
      for (const b of repeatSpec.body) {
        const bodyBlk = workspace.newBlock(b.type);
        bodyBlk.initSvg(); bodyBlk.render();
        if (prevBody) {
          prevBody.nextConnection && bodyBlk.previousConnection &&
            prevBody.nextConnection.connect(bodyBlk.previousConnection);
        }
        prevBody = bodyBlk;
      }
      if (prevBody) {
        const input = blk.getInput(bodyInputName);
        input && input.connection && prevBody.previousConnection &&
          input.connection.connect(prevBody.previousConnection);
      }
    }
    return blk;
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

      const repeatType = findRepeatType(available);

      if (blocks.type === 'repeat_n' && repeatType) {
        injectRepeatBlock(blocks, workspace, repeatType);
      } else if (blocks.type === 'sequence') {
        injectOpSequence(blocks.blocks, available, workspace);
      } else if (blocks.type === 'mixed') {
        let prevBlock = null;
        for (const part of blocks.parts) {
          if (typeof part === 'object' && part.type === 'repeat_n' && repeatType) {
            const repeat = injectRepeatBlock(part, workspace, repeatType);
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

  function buildBlockSequence(dirs, available, budget) {
    const hasTurnLeft = available.includes('turn_left') || available.includes('turn_block');
    const hasTurnRight = available.includes('turn_right') || available.includes('turn_block');
    const repeatType = findRepeatType(available);
    const hasRepeat = !!repeatType;

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
      if (ops.every(o => o === 'forward')) {
        return { type: 'repeat_n', count: ops.length, body: [{ type: 'move_forward' }] };
      }

      if (budget !== null) {
        const runs = [];
        let ri = 0;
        while (ri < ops.length) {
          let run = 0;
          while (ri + run < ops.length && ops[ri + run] === 'forward') run++;
          if (run >= 2) runs.push({ start: ri, len: run });
          ri += Math.max(run, 1);
        }
        if (runs.length > 0) {
          const parts = [];
          let i = 0;
          for (const run of runs) {
            while (i < run.start) { parts.push(ops[i]); i++; }
            parts.push({ type: 'repeat_n', count: run.len, body: [{ type: 'move_forward' }] });
            i += run.len;
          }
          while (i < ops.length) { parts.push(ops[i]); i++; }
          return { type: 'mixed', parts };
        }
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

    const budget = readBlockBudget();
    const path = findPath();
    if (!path) return null;

    const workspace = findBlocklyWorkspace();
    if (!workspace) return { path, error: 'workspace not found', budget };

    const available = detectAvailableBlocks(workspace);
    const hasMove = available.includes('move_forward');
    if (!hasMove) return { path, error: 'no move_forward block available', budget };

    const dirs = computeDirectionChanges(path);
    const blocks = buildBlockSequence(dirs, available, budget);
    const blockCount = countBlocks(blocks);

    if (budget !== null && blockCount > budget) {
      return {
        path: path.map(p => ({ x: p.x, y: p.y })),
        blocks,
        budget,
        blockCount,
        budgetExceeded: true,
        error: `Solution needs ${blockCount} blocks, but budget is ${budget}`,
        availableBlocks: available,
        grid: { rows: gameState.rows, cols: gameState.cols },
        player: gameState.player,
        goal: gameState.goal,
      };
    }

    const result = injectBlocks(blocks, available);

    return {
      path: path.map(p => ({ x: p.x, y: p.y })),
      blocks,
      injectionResult: result,
      availableBlocks: available,
      budget,
      blockCount,
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
