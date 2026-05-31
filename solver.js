(function () {
  'use strict';

  if (window.__ngs_solver_injected) return;
  window.__ngs_solver_injected = true;

  // ---------------------------------------------------------------------------
  // TERRAIN MAP
  // ---------------------------------------------------------------------------
  const TERRAIN_MAP = {
    'rock.png': 'wall', 'stone_1.png': 'wall', 'wood.png': 'wall',
    'normalglass.png': 'wall', 'brokenglass.png': 'hazard',
    'bush.png': 'path', 'grass_1.png': 'path', 'ground.png': 'path',
    'empty.png': 'path', 'tnt.png': 'hazard',
    'food-png.png': 'goal', 'water.png': 'goal', 'passenger.png': 'goal',
    'ball.png': 'goal', 'burger.png': 'goal', 'laddoo.png': 'goal',
    'boatland_3.png': 'wall', 'boatland_4.png': 'wall',
    'waterBoatToTheShore.png': 'path',
    'floor-1.png': 'path', 'floor.png': 'path',
    'tile 2.png': 'path', 'tile-1.png': 'path',
    'shore.png': 'goal',
  };

  function decodeFilename(name) {
    try { return decodeURIComponent(name); } catch (e) { return name; }
  }

  let gameState = null;

  // ---------------------------------------------------------------------------
  // GRID DIMENSION DETECTION — reads CSS, not square assumption
  // ---------------------------------------------------------------------------
  function detectGridDimensions(container, cellCount) {
    const style = window.getComputedStyle(container);
    const templateCols = style.getPropertyValue('grid-template-columns');
    if (templateCols && templateCols !== 'none' && templateCols.trim() !== '') {
      const cols = templateCols.trim().split(/\s+/).length;
      if (cols > 0 && cols <= cellCount) {
        return { rows: Math.ceil(cellCount / cols), cols };
      }
    }
    const children = Array.from(container.querySelectorAll('img'));
    if (children.length > 0) {
      const tops = new Set(), lefts = new Set();
      children.forEach(el => {
        const r = el.getBoundingClientRect();
        tops.add(Math.round(r.top));
        lefts.add(Math.round(r.left));
      });
      if (lefts.size > 0 && tops.size > 0) return { rows: tops.size, cols: lefts.size };
    }
    const cols = Math.round(Math.sqrt(cellCount));
    return { rows: Math.ceil(cellCount / cols), cols };
  }

  function readGameState() {
    const gridContainer = document.querySelector('[class*="map_element"]');
    if (!gridContainer) return null;
    const cells = gridContainer.querySelectorAll('img');
    const total = cells.length;
    if (total === 0) return null;

    const { rows, cols } = detectGridDimensions(gridContainer, total);
    const grid = [];
    let goalPos = null;

    for (let i = 0; i < rows; i++) {
      const row = [];
      for (let j = 0; j < cols; j++) {
        const idx = i * cols + j;
        if (idx >= total) { row.push('path'); continue; }
        const filename = decodeFilename((cells[idx].src || '').split('/').pop()).toLowerCase();
        const terrain = TERRAIN_MAP[filename] || 'path';
        row.push(terrain);
        if (terrain === 'goal' && !goalPos) goalPos = { x: j, y: i };
      }
      grid.push(row);
    }

    let playerPos = null;
    const spriteIcon = document.querySelector('[class*="sprite_icon"]');
    if (spriteIcon) {
      const gr = gridContainer.getBoundingClientRect();
      const sr = spriteIcon.getBoundingClientRect();
      const cellW = gr.width / cols, cellH = gr.height / rows;
      playerPos = {
        x: Math.max(0, Math.min(cols - 1, Math.round((sr.left - gr.left + sr.width / 2) / cellW - 0.5))),
        y: Math.max(0, Math.min(rows - 1, Math.round((sr.top - gr.top + sr.height / 2) / cellH - 0.5))),
      };
    }

    const destIcon = document.querySelector('[class*="destination_icon"]');
    if (destIcon) {
      const gr = gridContainer.getBoundingClientRect();
      const dr = destIcon.getBoundingClientRect();
      const cellW = gr.width / cols, cellH = gr.height / rows;
      goalPos = {
        x: Math.max(0, Math.min(cols - 1, Math.round((dr.left - gr.left + dr.width / 2) / cellW - 0.5))),
        y: Math.max(0, Math.min(rows - 1, Math.round((dr.top - gr.top + dr.height / 2) / cellH - 0.5))),
      };
    }

    if (!goalPos) {
      outer: for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++)
          if (grid[y][x] === 'goal') { goalPos = { x, y }; break outer; }
    }

    gameState = { grid, rows, cols, player: playerPos, goal: goalPos };
    return gameState;
  }

  function readBlockBudget() {
    const el = document.querySelector('[class*="blockLimitDisplay"]') ||
               document.querySelector('[class*="block_limit"]');
    if (!el) return null;
    const match = el.textContent.trim().match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  // ---------------------------------------------------------------------------
  // BFS — proper visited set, no Dijkstra confusion
  // ---------------------------------------------------------------------------
  function findPath() {
    if (!gameState || !gameState.player || !gameState.goal) return null;
    const { grid, rows, cols, player, goal } = gameState;

    // Resolve effective goal BEFORE BFS (fix: blocked goal adjacency)
    let effectiveGoal = { x: goal.x, y: goal.y };
    const goalTerrain = grid[goal.y] && grid[goal.y][goal.x];
    if (goalTerrain === 'wall' || goalTerrain === 'hazard') {
      const dirs4 = [[0,-1],[1,0],[0,1],[-1,0]];
      let found = false;
      for (const [dx, dy] of dirs4) {
        const nx = goal.x + dx, ny = goal.y + dy;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows &&
            grid[ny][nx] !== 'wall' && grid[ny][nx] !== 'hazard') {
          effectiveGoal = { x: nx, y: ny }; found = true; break;
        }
      }
      if (!found) return null;
    }

    const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const prev = Array.from({ length: rows }, () => Array(cols).fill(null));
    const queue = [{ x: player.x, y: player.y }];
    visited[player.y][player.x] = true;

    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur.x === effectiveGoal.x && cur.y === effectiveGoal.y) {
        const path = [];
        let cx = effectiveGoal.x, cy = effectiveGoal.y;
        while (cx !== player.x || cy !== player.y) {
          path.unshift({ x: cx, y: cy });
          const p = prev[cy][cx];
          if (!p) return null;
          cx = p.x; cy = p.y;
        }
        path.unshift({ x: player.x, y: player.y });
        return path;
      }
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        if (visited[ny][nx]) continue;
        const isGoal = nx === effectiveGoal.x && ny === effectiveGoal.y;
        if ((grid[ny][nx] === 'wall' || grid[ny][nx] === 'hazard') && !isGoal) continue;
        visited[ny][nx] = true;
        prev[ny][nx] = { x: cur.x, y: cur.y };
        queue.push({ x: nx, y: ny });
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // BLOCKLY WORKSPACE FINDER
  // ---------------------------------------------------------------------------
  function findBlocklyWorkspace() {
    const el = document.querySelector('[class*="blockly_workspace"]') ||
               document.querySelector('.injectionDiv');
    if (!el) return null;
    const fiberKeys = Object.keys(el).filter(k => k.startsWith('__reactFiber$'));
    if (fiberKeys.length === 0) return null;

    function deepSearch(obj, d) {
      if (!obj || typeof obj !== 'object' || d > 15) return null;
      if (obj.workspace && typeof obj.workspace.newBlock === 'function') return obj.workspace;
      if (typeof obj.newBlock === 'function' && typeof obj.clear === 'function') return obj;
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) { const r = deepSearch(obj[i], d+1); if (r) return r; }
      } else {
        for (const k of Object.keys(obj)) {
          try { const v = obj[k]; if (v && typeof v === 'object') { const r = deepSearch(v, d+1); if (r) return r; } }
          catch (e) {}
        }
      }
      return null;
    }

    let fiber = el[fiberKeys[0]], depth = 0;
    while (fiber && depth < 50) {
      if (fiber.memoizedState) { const ws = deepSearch(fiber.memoizedState, 0); if (ws) return ws; }
      if (fiber.memoizedProps) { const ws = deepSearch(fiber.memoizedProps, 0); if (ws) return ws; }
      fiber = fiber.return; depth++;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // SAFE BLOCK DETECTION
  // ---------------------------------------------------------------------------
  function detectAvailableBlocks(workspace) {
    const available = [];
    const tree = workspace.options && workspace.options.languageTree;
    if (tree && tree.contents) {
      tree.contents.forEach(item => {
        if (item.type) available.push(item.type);
        if (item.contents) item.contents.forEach(sub => { if (sub.type) available.push(sub.type); });
      });
    }
    if (available.length > 0) return available;

    try {
      const toolbox = workspace.options && workspace.options.toolbox;
      if (toolbox) {
        const types = Array.from(toolbox.querySelectorAll('block[type]')).map(b => b.getAttribute('type'));
        if (types.length > 0) return types;
      }
    } catch (e) {}

    const candidates = ['move_forward','turn_left','turn_right','turn_block',
      'fixed_repeat','repeat_block','controls_repeat','controls_if','path_ahead'];
    const found = [];
    for (const t of candidates) {
      try { const blk = workspace.newBlock(t); found.push(t); blk.dispose(false); } catch (e) {}
    }
    return found;
  }

  function findRepeatType(available) {
    if (available.includes('fixed_repeat')) return 'fixed_repeat';
    if (available.includes('controls_repeat')) return 'controls_repeat';
    return null;
  }

  // ---------------------------------------------------------------------------
  // DIRECTION DETECTION
  // ---------------------------------------------------------------------------
  function detectInitialDirection() {
    const innerDiv = document.querySelector('[class*="sprite_icon"] > div');
    if (innerDiv) {
      for (const cls of innerDiv.classList) {
        if (cls.includes('rotateimg0') || cls.includes('rotate0')) return 0;
        if (cls.includes('rotateimg90') || cls.includes('rotate90')) return 1;
        if (cls.includes('rotateimg180') || cls.includes('rotate180')) return 2;
        if (cls.includes('rotateimg270') || cls.includes('rotate270')) return 3;
      }
      const m = (innerDiv.style.transform || '').match(/rotate\((\d+)deg\)/);
      if (m) {
        const d = parseInt(m[1]);
        return d === 0 ? 0 : d === 90 ? 1 : d === 180 ? 2 : d === 270 ? 3 : 1;
      }
    }
    return 1; // default: right
  }

  function computeDirectionChanges(path) {
    const dirs = [];
    for (let i = 1; i < path.length; i++) {
      const dx = path[i].x - path[i-1].x, dy = path[i].y - path[i-1].y;
      if (dx === 1) dirs.push(1);
      else if (dx === -1) dirs.push(3);
      else if (dy === -1) dirs.push(0);
      else if (dy === 1) dirs.push(2);
    }
    return dirs;
  }

  // ---------------------------------------------------------------------------
  // BUILD OPS — flat array of 'forward'|'left'|'right' from direction sequence
  // ---------------------------------------------------------------------------
  function buildOps(dirs, hasTurnLeft, hasTurnRight) {
    let facing = detectInitialDirection();
    const ops = [];
    for (const targetDir of dirs) {
      if (targetDir !== facing) {
        const leftTurns = (facing - targetDir + 4) % 4;
        const rightTurns = (targetDir - facing + 4) % 4;
        if (hasTurnRight && (rightTurns <= leftTurns || !hasTurnLeft)) {
          for (let t = 0; t < rightTurns; t++) ops.push('right');
        } else if (hasTurnLeft) {
          for (let t = 0; t < leftTurns; t++) ops.push('left');
        }
        facing = targetDir;
      }
      ops.push('forward');
    }
    return ops;
  }

  // ---------------------------------------------------------------------------
  // BLOCK COUNT — matches how Newton School games actually count
  // ---------------------------------------------------------------------------
  function countBlocks(blocks) {
    if (blocks.type === 'repeat_n') {
      // 1 for the repeat + distinct body block types
      return 1 + new Set((blocks.body || []).map(b => b.type)).size;
    }
    if (blocks.type === 'sequence') return blocks.blocks.length;
    if (blocks.type === 'mixed') {
      return blocks.parts.reduce((c, p) => {
        if (typeof p === 'object' && p.type === 'repeat_n')
          return c + 1 + new Set((p.body || []).map(b => b.type)).size;
        return c + 1;
      }, 0);
    }
    return 0;
  }

  // ---------------------------------------------------------------------------
  // PATTERN DETECTION — find a repeating sub-sequence in ops
  // e.g. [fwd, fwd, right, fwd, fwd, right] → repeat 2x [fwd, fwd, right]
  // This is the key fix for budget-constrained levels with turns inside loops.
  // ---------------------------------------------------------------------------
  function findRepeatingPattern(ops) {
    const n = ops.length;
    // Try pattern lengths from 2 up to half the sequence
    for (let len = 2; len <= Math.floor(n / 2); len++) {
      const pattern = ops.slice(0, len);
      let reps = 0;
      let i = 0;
      let matches = true;
      while (i + len <= n) {
        const chunk = ops.slice(i, i + len);
        if (chunk.join(',') === pattern.join(',')) { reps++; i += len; }
        else { matches = false; break; }
      }
      // Full repetition with optional trailing single ops
      if (reps >= 2) {
        const tail = ops.slice(i); // leftover after full repeats
        return { pattern, reps, tail };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // BUILD BLOCK SEQUENCE — aggressive compression when budget is tight
  // ---------------------------------------------------------------------------
  function buildBlockSequence(dirs, available, budget) {
    const hasTurnLeft  = available.includes('turn_left')  || available.includes('turn_block');
    const hasTurnRight = available.includes('turn_right') || available.includes('turn_block');
    const repeatType   = findRepeatType(available);
    const hasRepeat    = !!repeatType;

    const ops = buildOps(dirs, hasTurnLeft, hasTurnRight);

    // No repeat block available — raw sequence only
    if (!hasRepeat) return { type: 'sequence', blocks: ops };

    // Pure straight line
    if (ops.every(o => o === 'forward')) {
      return { type: 'repeat_n', count: ops.length, body: [{ type: 'move_forward' }] };
    }

    // --- STRATEGY 1: Find a fully repeating pattern (covers turns inside body) ---
    // This is the main fix for budget=5 type levels
    const pattern = findRepeatingPattern(ops);
    if (pattern && pattern.reps >= 2) {
      const bodyOps = pattern.pattern;
      const bodyBlocks = bodyOps.map(op => {
        if (op === 'forward') return { type: 'move_forward' };
        if (op === 'left')    return { type: 'turn_left' };
        if (op === 'right')   return { type: 'turn_right' };
        return null;
      }).filter(Boolean);

      const repeatBlock = { type: 'repeat_n', count: pattern.reps, body: bodyBlocks };

      if (pattern.tail.length === 0) {
        // Perfect — entire path is one repeat
        const cost = 1 + new Set(bodyBlocks.map(b => b.type)).size;
        if (budget === null || cost <= budget) return repeatBlock;
      } else {
        // Repeat + some trailing ops
        const tailParts = pattern.tail.map(op =>
          op === 'forward' ? 'forward' : op === 'left' ? 'left' : 'right'
        );
        const mixedCost = 1 + new Set(bodyBlocks.map(b => b.type)).size + tailParts.length;
        if (budget === null || mixedCost <= budget) {
          return { type: 'mixed', parts: [repeatBlock, ...tailParts] };
        }
      }
    }

    // --- STRATEGY 2: Compress every run of >=2 consecutive forwards ---
    {
      const parts = [];
      let i = 0, compressed = false;
      while (i < ops.length) {
        if (ops[i] === 'forward') {
          let run = 0;
          while (i + run < ops.length && ops[i + run] === 'forward') run++;
          if (run >= 2) {
            parts.push({ type: 'repeat_n', count: run, body: [{ type: 'move_forward' }] });
            compressed = true;
          } else {
            for (let k = 0; k < run; k++) parts.push(ops[i + k]);
          }
          i += run;
        } else {
          parts.push(ops[i]);
          i++;
        }
      }
      if (compressed) {
        const candidate = { type: 'mixed', parts };
        const cost = countBlocks(candidate);
        if (budget === null || cost <= budget) return candidate;
      }
    }

    // --- STRATEGY 3: Compress only the single longest forward run ---
    {
      let best = null, curStart = -1, curLen = 0;
      for (let i = 0; i <= ops.length; i++) {
        if (i < ops.length && ops[i] === 'forward') {
          if (curStart === -1) curStart = i;
          curLen++;
        } else {
          if (curLen >= 3 && (!best || curLen > best.len)) best = { start: curStart, len: curLen };
          curStart = -1; curLen = 0;
        }
      }
      if (best) {
        const parts = [];
        for (let i = 0; i < ops.length;) {
          if (i === best.start) {
            parts.push({ type: 'repeat_n', count: best.len, body: [{ type: 'move_forward' }] });
            i += best.len;
          } else { parts.push(ops[i]); i++; }
        }
        const candidate = { type: 'mixed', parts };
        const cost = countBlocks(candidate);
        if (budget === null || cost <= budget) return candidate;
      }
    }

    // --- FALLBACK: raw sequence (inject anyway, let game decide) ---
    return { type: 'sequence', blocks: ops };
  }

  // ---------------------------------------------------------------------------
  // BLOCK CREATION & INJECTION
  // ---------------------------------------------------------------------------
  function createOpBlock(op, available, workspace) {
    if (op === 'forward' && available.includes('move_forward')) {
      const blk = workspace.newBlock('move_forward'); blk.initSvg(); blk.render(); return blk;
    }
    if (op === 'left') {
      if (available.includes('turn_left')) {
        const blk = workspace.newBlock('turn_left'); blk.initSvg(); blk.render(); return blk;
      }
      if (available.includes('turn_block')) return createTurnBlock('left', workspace);
    }
    if (op === 'right') {
      if (available.includes('turn_right')) {
        const blk = workspace.newBlock('turn_right'); blk.initSvg(); blk.render(); return blk;
      }
      if (available.includes('turn_block')) return createTurnBlock('right', workspace);
    }
    return null;
  }

  function createTurnBlock(dir, workspace) {
    const blk = workspace.newBlock('turn_block');
    const dirField = blk.getField('direction');
    if (dirField) {
      const valFull = dir === 'left' ? 'turnLeft()' : 'turnRight()';
      const valShort = dir === 'left' ? 'turnLeft' : 'turnRight';
      dirField.setValue(valFull);
      if (dirField.getValue() !== valFull) dirField.setValue(valShort);
    }
    const angleField = blk.getField('angle');
    if (angleField) angleField.setValue('90');
    blk.initSvg(); blk.render();
    return blk;
  }

  function injectRepeatBlock(repeatSpec, workspace, repeatType) {
    const blk = workspace.newBlock(repeatType);
    // Set count — try all known field names for each repeat block type
    for (const name of ['num_input', 'TIMES', 'times', 'NUM']) {
      const f = blk.getField(name);
      if (f) { f.setValue(String(repeatSpec.count)); break; }
    }
    blk.initSvg(); blk.render();

    // Find body input
    let bodyInput = null;
    for (const name of ['for_statement', 'inside_repeat', 'DO', 'body']) {
      bodyInput = blk.getInput(name);
      if (bodyInput) break;
    }

    if (bodyInput && repeatSpec.body && repeatSpec.body.length > 0) {
      let prevBody = null;
      for (const b of repeatSpec.body) {
        // b.type can be 'move_forward', 'turn_left', 'turn_right', or 'turn_block'
        let bodyBlk;
        if (b.type === 'turn_left' && !workspace.options) {
          bodyBlk = createOpBlock('left', ['turn_left'], workspace);
        } else if (b.type === 'turn_right' && !workspace.options) {
          bodyBlk = createOpBlock('right', ['turn_right'], workspace);
        } else {
          try {
            bodyBlk = workspace.newBlock(b.type);
            if (b.dir && bodyBlk.getField('direction')) {
              bodyBlk.getField('direction').setValue(b.dir);
            }
            bodyBlk.initSvg(); bodyBlk.render();
          } catch (e) {
            console.warn('[NGS] Could not create body block:', b.type, e);
            continue;
          }
        }
        if (!bodyBlk) continue;
        if (prevBody) {
          prevBody.nextConnection && bodyBlk.previousConnection &&
            prevBody.nextConnection.connect(bodyBlk.previousConnection);
        } else {
          bodyInput.connection && bodyBlk.previousConnection &&
            bodyInput.connection.connect(bodyBlk.previousConnection);
        }
        prevBody = bodyBlk;
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
          let blk = null;
          if (typeof part === 'object' && part.type === 'repeat_n' && repeatType) {
            blk = injectRepeatBlock(part, workspace, repeatType);
          } else {
            blk = createOpBlock(part, available, workspace);
          }
          if (blk && prevBlock) {
            prevBlock.nextConnection && blk.previousConnection &&
              prevBlock.nextConnection.connect(blk.previousConnection);
          }
          if (blk) prevBlock = blk;
        }
      }

      workspace.render();
      return { success: true };
    } catch (e) {
      console.error('[NGS] Injection error:', e);
      return { success: false, error: e.message };
    }
  }

  // ---------------------------------------------------------------------------
  // MAIN SOLVE
  // ---------------------------------------------------------------------------
  function solve() {
    readGameState();
    if (!gameState)         return { error: 'Could not read game state' };
    if (!gameState.player)  return { error: 'Could not detect player position' };
    if (!gameState.goal)    return { error: 'Could not detect goal position' };

    const budget = readBlockBudget();
    const path = findPath();
    if (!path) return { error: 'No path found — map may be unsolvable', grid: gameState };

    const workspace = findBlocklyWorkspace();
    if (!workspace) return { path, error: 'Blockly workspace not found', budget };

    const available = detectAvailableBlocks(workspace);
    if (!available.includes('move_forward'))
      return { path, error: 'move_forward block not available', available, budget };

    const dirs   = computeDirectionChanges(path);
    const blocks = buildBlockSequence(dirs, available, budget);
    const blockCount = countBlocks(blocks);

    // KEY FIX: ALWAYS inject, even if budget exceeded.
    // The game will show the budget warning itself; stopping here meant nothing got injected.
    const injectionResult = injectBlocks(blocks, available);

    return {
      path: path.map(p => ({ x: p.x, y: p.y })),
      blocks,
      injectionResult,
      availableBlocks: available,
      budget,
      blockCount,
      budgetExceeded: budget !== null && blockCount > budget,
      grid: { rows: gameState.rows, cols: gameState.cols, data: gameState.grid },
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
    if (e.data && e.data.type === '__ngs_auto_solve') autoSolve();
  });

  window.postMessage({ type: '__ngs_solver_ready' }, '*');

  window.__ngs_auto_solve  = autoSolve;
  window.__ngs_solve       = solve;
  window.__ngs_getState    = () => gameState;
  window.__ngs_readState   = readGameState;
})();
