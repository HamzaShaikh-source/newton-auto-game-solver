(function () {
  'use strict';

  if (window.__ngs_solver_injected) return;
  window.__ngs_solver_injected = true;

  const isMouseLaddoo = window.location.href.includes('mouse-laddoo');
  const isTurtleTracer = window.location.href.includes('turtle-tracer');

  const TERRAIN_MAP = {
    'rock.png': 'wall', 'stone_1.png': 'wall', 'wood.png': 'wall',
    'normalglass.png': 'wall', 'brokenglass.png': 'hazard',
    'bush.png': 'path', 'grass_1.png': 'path', 'ground.png': 'path',
    'empty.png': 'path', 'tnt.png': 'hazard',
    'food-png.png': 'goal', 'water.png': 'goal', 'passenger.png': 'goal',
    'ball.png': 'goal', 'burger.png': 'goal', 'laddoo.png': 'goal',
    'boatland_3.png': 'wall', 'boatland_4.png': 'wall',
    'waterBoatToTheShore.png': 'path',
    'shore.png': 'goal',
  };

  // Game-specific terrain mapping overrides
  if (isMouseLaddoo) {
    // In mouse-laddoo, floor tiles represent walls, tile variants represent paths
    TERRAIN_MAP['floor.png'] = 'wall';
    TERRAIN_MAP['floor-1.png'] = 'wall';
    TERRAIN_MAP['tile 2.png'] = 'path';
    TERRAIN_MAP['tile-1.png'] = 'path';
  } else if (isTurtleTracer) {
    // Turtle tracer uses different terrain
    TERRAIN_MAP['floor.png'] = 'path';
    TERRAIN_MAP['floor-1.png'] = 'path';
  } else {
    // Default (duck-ball etc.)
    TERRAIN_MAP['floor-1.png'] = 'path';
    TERRAIN_MAP['floor.png'] = 'path';
    TERRAIN_MAP['tile 2.png'] = 'path';
    TERRAIN_MAP['tile-1.png'] = 'path';
  }

  function decodeFilename(name) {
    try { return decodeURIComponent(name); } catch (e) { return name; }
  }

  let gameState = null;
  const DIRS = [[0,-1],[1,0],[0,1],[-1,0]];

  // ---------------------------------------------------------------------------
  // GRID DIMENSION DETECTION
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
  // PATH CONDITION CHECKS
  // ---------------------------------------------------------------------------
  function isTraversable(x, y) {
    if (!gameState) return false;
    const { grid, rows, cols } = gameState;
    if (x < 0 || x >= cols || y < 0 || y >= rows) return false;
    const t = grid[y][x];
    return t !== 'wall' && t !== 'hazard';
  }

  function isGoalCell(x, y) {
    if (!gameState || !gameState.goal) return false;
    return x === gameState.goal.x && y === gameState.goal.y;
  }

  function cellAt(x, y) {
    if (!gameState) return 'wall';
    const { grid, rows, cols } = gameState;
    if (x < 0 || x >= cols || y < 0 || y >= rows) return 'wall';
    return grid[y][x];
  }

  function isPathAhead(x, y, facing) {
    const [dx, dy] = DIRS[facing];
    return isTraversable(x + dx, y + dy);
  }

  function isPathRight(x, y, facing) {
    return isPathAhead(x, y, (facing + 1) % 4);
  }

  function isPathLeft(x, y, facing) {
    return isPathAhead(x, y, (facing + 3) % 4);
  }

  // ---------------------------------------------------------------------------
  // BFS
  // ---------------------------------------------------------------------------
  function findPath() {
    if (!gameState || !gameState.player || !gameState.goal) return null;
    const { grid, rows, cols, player, goal } = gameState;

    let effectiveGoal = { x: goal.x, y: goal.y };
    const goalTerrain = grid[goal.y] && grid[goal.y][goal.x];
    if (goalTerrain === 'wall' || goalTerrain === 'hazard') {
      let found = false;
      for (const [dx, dy] of DIRS) {
        const nx = goal.x + dx, ny = goal.y + dy;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows &&
            grid[ny][nx] !== 'wall' && grid[ny][nx] !== 'hazard') {
          effectiveGoal = { x: nx, y: ny }; found = true; break;
        }
      }
      if (!found) return null;
    }

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
      for (const [dx, dy] of DIRS) {
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
  // BLOCK DETECTION
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
      'fixed_repeat','repeat_block','controls_repeat','controls_if','path_ahead',
      'ifdo_block','ifdo_block_v1','ifdo_block_lr','ifelse_block','ifelse_block_lr',
      'repeat_until','ifvariable_block','reset_block'];
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

  function hasRepeatUntil(available) {
    return available.includes('repeat_block') || available.includes('repeat_until');
  }

  function hasConditional(available) {
    return available.some(t => ['ifdo_block','ifdo_block_v1','ifdo_block_lr','ifelse_block','ifelse_block_lr'].includes(t));
  }

  // ---------------------------------------------------------------------------
  // DIRECTION DETECTION
  // ---------------------------------------------------------------------------
  function extractRotationDeg(transform) {
    if (!transform) return null;
    const m = transform.match(/rotate\((-?\d+)deg\)/);
    if (m) return parseInt(m[1]);
    const mm = transform.match(/matrix\(([-\d.]+), ([-\d.]+), ([-\d.]+), ([-\d.]+)/);
    if (mm) {
      const a = parseFloat(mm[1]), b = parseFloat(mm[2]);
      const angle = Math.round(Math.atan2(b, a) * 180 / Math.PI);
      return ((angle % 360) + 360) % 360;
    }
    return null;
  }

  function detectInitialDirection() {
    const url = window.location.href;
    const isMouseLaddoo = url.includes('mouse-laddoo');
    const isTurtleTracer = url.includes('turtle-tracer');
    const spriteIcon = document.querySelector('[class*="sprite_icon"]');
    if (spriteIcon) {
      const innerDiv = spriteIcon.querySelector(':scope > div');
      if (innerDiv) {
        const rot = extractRotationDeg(innerDiv.style.transform);
        if (rot !== null) {
          const d = rot === 0 ? 0 : rot === 90 ? 3 : rot === 180 ? 2 : rot === 270 ? 1 : 1;
          return d;
        }
        for (const cls of innerDiv.classList) {
          if (cls.includes('rotateimg0') || cls.includes('rotate0')) return 0;
          if (cls.includes('rotateimg90') || cls.includes('rotate90')) return 3;
          if (cls.includes('rotateimg180') || cls.includes('rotate180')) return 2;
          if (cls.includes('rotateimg270') || cls.includes('rotate270')) return 1;
        }
      }
      const img = spriteIcon.querySelector('img');
      if (img && (img.src || '').includes('mouse')) return 2;
      if (img && (img.src || '').includes('turtle')) return 0;
    }
    if (isMouseLaddoo) return 2;
    if (isTurtleTracer) return 0;
    return 1;
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
  // BUILD OPS
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
  // BLOCK COUNT
  // ---------------------------------------------------------------------------
  function countBlocks(blocks) {
    if (blocks.type === 'repeat_n') {
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
    if (blocks.type === 'program') {
      return countProgramBlocks(blocks.root);
    }
    return 0;
  }

  function countProgramBlocks(node) {
    if (!node) return 0;
    switch (node.type) {
      case 'op': return 1;
      case 'repeat':
      case 'fixed_repeat':
        return 1 + node.body.reduce((s, n) => s + countProgramBlocks(n), 0);
      case 'ifdo':
        return 1 + node.doBody.reduce((s, n) => s + countProgramBlocks(n), 0);
      case 'ifelse':
        return 1 + node.doBody.reduce((s, n) => s + countProgramBlocks(n), 0)
             + node.elseBody.reduce((s, n) => s + countProgramBlocks(n), 0);
      case 'sequence':
        return node.blocks.reduce((s, n) => s + countProgramBlocks(n), 0);
      default:
        return 0;
    }
  }

  // ---------------------------------------------------------------------------
  // PATTERN DETECTION
  // ---------------------------------------------------------------------------
  function findRepeatingPattern(ops) {
    const n = ops.length;
    for (let len = 2; len <= Math.floor(n / 2); len++) {
      const pattern = ops.slice(0, len);
      let reps = 0, i = 0, matches = true;
      while (i + len <= n) {
        const chunk = ops.slice(i, i + len);
        if (chunk.join(',') === pattern.join(',')) { reps++; i += len; }
        else { matches = false; break; }
      }
      if (reps >= 2) {
        const tail = ops.slice(i);
        return { pattern, reps, tail };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // SEQUENCE-BASED BLOCK BUILDING (existing approach for basic levels)
  // ---------------------------------------------------------------------------
  function buildBlockSequence(dirs, available, budget) {
    const hasTurnLeft  = available.includes('turn_left')  || available.includes('turn_block');
    const hasTurnRight = available.includes('turn_right') || available.includes('turn_block');
    const repeatType   = findRepeatType(available);
    const hasRepeat    = !!repeatType;
    const ops = buildOps(dirs, hasTurnLeft, hasTurnRight);

    if (!hasRepeat) return { type: 'sequence', blocks: ops };

    if (ops.every(o => o === 'forward')) {
      return { type: 'repeat_n', count: ops.length, body: [{ type: 'move_forward' }] };
    }

    // Strategy 1: Repeating pattern
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
        const cost = 1 + new Set(bodyBlocks.map(b => b.type)).size;
        if (budget === null || cost <= budget) return repeatBlock;
      } else {
        const tailParts = pattern.tail.map(op =>
          op === 'forward' ? 'forward' : op === 'left' ? 'left' : 'right'
        );
        const mixedCost = 1 + new Set(bodyBlocks.map(b => b.type)).size + tailParts.length;
        if (budget === null || mixedCost <= budget) {
          return { type: 'mixed', parts: [repeatBlock, ...tailParts] };
        }
      }
    }

    // Strategy 2: Compress every run of >=2 forwards
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

    // Strategy 3: Longest forward run
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

    return { type: 'sequence', blocks: ops };
  }

  // ---------------------------------------------------------------------------
  // CONDITIONAL MAZE SOLVER
  // Simulates the right-hand rule wall-follower and generates a conditional program.
  // ---------------------------------------------------------------------------
  function simulateWallFollower() {
    if (!gameState || !gameState.player || !gameState.goal) return null;
    const { player, goal, rows, cols } = gameState;
    let x = player.x, y = player.y;
    let facing = detectInitialDirection();
    const visited = new Set();
    const maxSteps = rows * cols * 4;
    const steps = [];

    for (let s = 0; s < maxSteps; s++) {
      if (x === goal.x && y === goal.y) break;

      const key = `${x},${y},${facing}`;
      if (visited.has(key)) {
        // Loop detected — stop to avoid infinite generation
        break;
      }
      visited.add(key);

      // Right-hand rule:
      // 1. Try right
      const rightFacing = (facing + 1) % 4;
      const [rdx, rdy] = DIRS[rightFacing];
      if (isTraversable(x + rdx, y + rdy)) {
        steps.push({ action: 'right', x: x + rdx, y: y + rdy, facing: rightFacing });
        facing = rightFacing;
        x += rdx; y += rdy;
        continue;
      }

      // 2. Try forward
      const [fdx, fdy] = DIRS[facing];
      if (isTraversable(x + fdx, y + fdy)) {
        steps.push({ action: 'forward', x: x + fdx, y: y + fdy, facing: facing });
        x += fdx; y += fdy;
        continue;
      }

      // 3. Try left
      const leftFacing = (facing + 3) % 4;
      const [ldx, ldy] = DIRS[leftFacing];
      if (isTraversable(x + ldx, y + ldy)) {
        steps.push({ action: 'left', x: x + ldx, y: y + ldy, facing: leftFacing });
        facing = leftFacing;
        x += ldx; y += ldy;
        continue;
      }

      // 4. Dead end — turn around
      steps.push({ action: 'left', x, y, facing: (facing + 1) % 4 }); // turn left (which is like turning around in 2 steps)
      steps.push({ action: 'left', x, y, facing: (facing + 2) % 4 });
      facing = (facing + 2) % 4;
    }

    return steps;
  }

  function simulateWallFollower(turnOnBlocked, maxSteps) {
    if (!gameState || !gameState.player || !gameState.goal) return { reached: false, steps: 0 };
    const { grid, rows, cols, player, goal } = gameState;
    let x = player.x, y = player.y;
    let facing = detectInitialDirection();
    const visited = new Set();
    for (let step = 0; step < maxSteps; step++) {
      const key = `${x},${y},${facing}`;
      if (visited.has(key)) return { reached: false, steps: step, cycle: true };
      visited.add(key);
      const [dx, dy] = DIRS[facing];
      const nx = x + dx, ny = y + dy;
      const aheadBlocked = nx < 0 || nx >= cols || ny < 0 || ny >= rows || grid[ny][nx] === 'wall' || grid[ny][nx] === 'hazard';
      if (aheadBlocked) {
        facing = (facing + (turnOnBlocked === 'right' ? 1 : 3)) % 4;
      } else {
        x = nx; y = ny;
      }
      if (x === goal.x && y === goal.y) return { reached: true, steps: step + 1, facing };
    }
    return { reached: false, steps: maxSteps };
  }

  function buildMazeProgram(available, budget) {
    const hasRepeatUntilBlock = hasRepeatUntil(available);
    const hasIfdo = available.includes('ifdo_block');
    const hasIfdoV1 = available.includes('ifdo_block_v1');
    const hasIfdoLr = available.includes('ifdo_block_lr');
    const hasIfelse = available.includes('ifelse_block');
    const hasIfelseLr = available.includes('ifelse_block_lr');

    // Build the wall-follower body using available conditionals
    const body = [];

    // Determine correct turn direction for simple wall-followers
    let wallFollowTurn = 'right';
    let wallFollowSteps = 0;
    const isSimpleIfdo = !hasIfelse && !hasIfelseLr && !hasIfdoLr && (hasIfdo || hasIfdoV1);
    if (isSimpleIfdo) {
      const maxSimSteps = (gameState ? gameState.rows * gameState.cols : 64) * 3;
      const rightResult = simulateWallFollower('right', maxSimSteps);
      const leftResult = simulateWallFollower('left', maxSimSteps);
      if (leftResult.reached && !rightResult.reached) {
        wallFollowTurn = 'left';
        wallFollowSteps = leftResult.steps;
      } else if (rightResult.reached && !leftResult.reached) {
        wallFollowTurn = 'right';
        wallFollowSteps = rightResult.steps;
      } else if (leftResult.reached && rightResult.reached) {
        if (leftResult.steps <= rightResult.steps) {
          wallFollowTurn = 'left';
          wallFollowSteps = leftResult.steps;
        } else {
          wallFollowTurn = 'right';
          wallFollowSteps = rightResult.steps;
        }
      }
    }

    // C1: right path check
    if (hasIfelseLr) {
      const rightBlock = {
        type: 'ifelse',
        blkType: 'ifelse_block_lr',
        fieldName: 'check_direction',
        fieldValue: 'checkRightPath()',
        doBody: [
          { type: 'op', op: 'right' },
          { type: 'op', op: 'forward' },
        ],
        elseBody: [],
      };

      if (hasIfelse) {
        // C2: ahead path check (inside else of C1)
        const aheadBlock = {
          type: 'ifelse',
          blkType: 'ifelse_block',
          fieldName: 'check_direction',
          fieldValue: 'checkPathAhead()',
          doBody: [{ type: 'op', op: 'forward' }],
          elseBody: [],
        };

        if (hasIfelseLr) {
          // C3: left path check (inside else of C2)
          const leftBlock = {
            type: 'ifelse',
            blkType: 'ifelse_block_lr',
            fieldName: 'check_direction',
            fieldValue: 'checkLeftPath()',
            doBody: [
              { type: 'op', op: 'left' },
              { type: 'op', op: 'forward' },
            ],
            elseBody: [
              { type: 'op', op: 'left' },
              { type: 'op', op: 'left' },
              { type: 'op', op: 'forward' },
            ],
          };
          aheadBlock.elseBody = [leftBlock];
        } else if (hasIfdoLr) {
          const leftBlock = {
            type: 'ifdo',
            blkType: 'ifdo_block_lr',
            fieldName: 'direction_path',
            fieldValue: 'checkLeftPath()',
            doBody: [
              { type: 'op', op: 'left' },
              { type: 'op', op: 'forward' },
            ],
          };
          aheadBlock.elseBody = [leftBlock,
            { type: 'op', op: 'left' },
            { type: 'op', op: 'left' },
            { type: 'op', op: 'forward' },
          ];
        } else {
          aheadBlock.elseBody = [
            { type: 'op', op: 'left' },
            { type: 'op', op: 'forward' },
          ];
        }

        rightBlock.elseBody = [aheadBlock];
      } else if (hasIfdo) {
        const aheadBlock = {
          type: 'ifdo',
          blkType: 'ifdo_block',
          fieldName: 'direction_path',
          fieldValue: 'checkPathAhead()',
          doBody: [{ type: 'op', op: 'forward' }],
        };
        rightBlock.elseBody = [aheadBlock,
          { type: 'op', op: 'left' },
          { type: 'op', op: 'forward' },
        ];
      } else {
        rightBlock.elseBody = [
          { type: 'op', op: 'forward' },
        ];
      }

      body.push(rightBlock);
    } else if (hasIfelse) {
      // Only ahead path check available
      const aheadBlock = {
        type: 'ifelse',
        blkType: 'ifelse_block',
        fieldName: 'check_direction',
        fieldValue: 'checkPathAhead()',
        doBody: [{ type: 'op', op: 'forward' }],
        elseBody: [
          { type: 'op', op: 'left' },
          { type: 'op', op: 'forward' },
        ],
      };
      body.push(aheadBlock);
    } else if (hasIfdo || hasIfdoV1) {
      // ifdo_block only (no else) — use simple wall-follower:
      //   if !checkPathAhead(): turn (left or right depending on maze)
      //   then always move forward
      const notAheadBlock = {
        type: 'ifdo',
        blkType: hasIfdo ? 'ifdo_block' : 'ifdo_block_v1',
        fieldName: 'direction_path',
        fieldValue: '!checkPathAhead()',
        doBody: [{ type: 'op', op: wallFollowTurn }],
      };
      body.push(notAheadBlock);
      body.push({ type: 'op', op: 'forward' });
    } else {
      // No conditionals — fall back
      return null;
    }

    const hasFixedRepeat = !!findRepeatType(available);
    const fixedRepeatFieldMax = 10;
    let root;
    if (hasRepeatUntilBlock) {
      root = { type: 'repeat', body };
    } else if (hasFixedRepeat) {
      let count;
      if (wallFollowSteps > 0) {
        count = Math.min(wallFollowSteps, fixedRepeatFieldMax);
      } else {
        const maxSteps = (gameState ? gameState.rows * gameState.cols : 50) * 2;
        count = Math.min(maxSteps, fixedRepeatFieldMax);
      }
      root = { type: 'fixed_repeat', count, body };
    } else {
      root = { type: 'sequence', blocks: body };
    }

    const program = { type: 'program', root };
    const progBlocks = countBlocks(program);
    if (budget !== null && progBlocks > budget) return null;

    return program;
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
    for (const name of ['num_input', 'TIMES', 'times', 'NUM']) {
      const f = blk.getField(name);
      if (f) { f.setValue(String(repeatSpec.count)); break; }
    }
    // For repeat_block (repeat until), set the variable field if present
    const varField = blk.getField('variable');
    if (varField) {
      // Set to a high iteration count so the loop runs until goal is reached
      varField.setValue('_');
    }
    blk.initSvg(); blk.render();

    let bodyInput = null;
    for (const name of ['for_statement', 'inside_repeat', 'DO', 'body']) {
      bodyInput = blk.getInput(name);
      if (bodyInput) break;
    }

    if (bodyInput && repeatSpec.body && repeatSpec.body.length > 0) {
      let prevBody = null;
      for (const b of repeatSpec.body) {
        let bodyBlk;
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

  // ---------------------------------------------------------------------------
  // CONDITIONAL BLOCK INJECTION
  // ---------------------------------------------------------------------------
  function createConditionalBlock(node, available, workspace) {
    const { blkType, fieldName, fieldValue } = node;
    let blk;
    try {
      blk = workspace.newBlock(blkType);
    } catch (e) {
      console.warn('[NGS] Could not create conditional block:', blkType, e);
      return null;
    }

    // Set the condition field
    const condField = blk.getField(fieldName);
    if (condField) {
      condField.setValue(fieldValue);
      if (condField.getValue() !== fieldValue) {
        // Try alternative values based on context
        const alts = {
          'checkPathAhead()': ['!checkPathAhead()', 'checkLeftPath()', 'checkRightPath()'],
          '!checkPathAhead()': ['checkPathAhead()', 'checkLeftPath()', 'checkRightPath()'],
          'checkLeftPath()': ['checkRightPath()', 'checkPathAhead()', '!checkPathAhead()'],
          'checkRightPath()': ['checkLeftPath()', 'checkPathAhead()', '!checkPathAhead()'],
        };
        const alternatives = alts[fieldValue] || [];
        for (const alt of alternatives) {
          condField.setValue(alt);
          if (condField.getValue() === alt) break;
        }
      }
    }

    blk.initSvg(); blk.render();

    // Inject body blocks
    if (node.type === 'ifdo' || node.type === 'ifelse') {
      const doInput = blk.getInput('true_condition');
      if (doInput && node.doBody.length > 0) {
        let firstBlock = null, prevBlock = null;
        for (const child of node.doBody) {
          const childBlk = createProgramNodeBlock(child, available, workspace);
          if (!childBlk) continue;
          if (prevBlock) {
            prevBlock.nextConnection && childBlk.previousConnection &&
              prevBlock.nextConnection.connect(childBlk.previousConnection);
          } else {
            firstBlock = childBlk;
          }
          prevBlock = childBlk;
        }
        if (firstBlock) {
          doInput.connection && firstBlock.previousConnection &&
            doInput.connection.connect(firstBlock.previousConnection);
        }
      }
    }

    if (node.type === 'ifelse') {
      const elseInput = blk.getInput('false_condition');
      if (elseInput && node.elseBody.length > 0) {
        let firstBlock = null, prevBlock = null;
        for (const child of node.elseBody) {
          const childBlk = createProgramNodeBlock(child, available, workspace);
          if (!childBlk) continue;
          if (prevBlock) {
            prevBlock.nextConnection && childBlk.previousConnection &&
              prevBlock.nextConnection.connect(childBlk.previousConnection);
          } else {
            firstBlock = childBlk;
          }
          prevBlock = childBlk;
        }
        if (firstBlock) {
          elseInput.connection && firstBlock.previousConnection &&
            elseInput.connection.connect(firstBlock.previousConnection);
        }
      }
    }

    return blk;
  }

  function createRepeatUntilBlock(node, available, workspace) {
    const blkType = available.includes('repeat_block') ? 'repeat_block' : 'repeat_until';
    let blk;
    try {
      blk = workspace.newBlock(blkType);
    } catch (e) { return null; }

    // Set variable field if present (for iteration count)
    const varField = blk.getField('variable');
    if (varField) varField.setValue('_');

    blk.initSvg(); blk.render();

    // Find body input
    let bodyInput = null;
    for (const name of ['inside_repeat', 'for_statement', 'DO', 'body']) {
      bodyInput = blk.getInput(name);
      if (bodyInput) break;
    }

    if (bodyInput && node.body.length > 0) {
      let firstBlock = null, prevBlock = null;
      for (const child of node.body) {
        const childBlk = createProgramNodeBlock(child, available, workspace);
        if (!childBlk) continue;
        if (prevBlock) {
          prevBlock.nextConnection && childBlk.previousConnection &&
            prevBlock.nextConnection.connect(childBlk.previousConnection);
        } else {
          firstBlock = childBlk;
        }
        prevBlock = childBlk;
      }
      if (firstBlock) {
        bodyInput.connection && firstBlock.previousConnection &&
          bodyInput.connection.connect(firstBlock.previousConnection);
      }
    }

    return blk;
  }

  function createFixedRepeatBlock(node, available, workspace) {
    const repeatType = findRepeatType(available);
    if (!repeatType) return null;
    let blk;
    try {
      blk = workspace.newBlock(repeatType);
    } catch (e) { return null; }

    // Set the iteration count
    for (const name of ['num_input', 'TIMES', 'times', 'NUM']) {
      const f = blk.getField(name);
      if (f) { f.setValue(String(node.count)); break; }
    }

    blk.initSvg(); blk.render();

    let bodyInput = null;
    for (const name of ['for_statement', 'inside_repeat', 'DO', 'body']) {
      bodyInput = blk.getInput(name);
      if (bodyInput) break;
    }

    if (bodyInput && node.body.length > 0) {
      let firstBlock = null, prevBlock = null;
      for (const child of node.body) {
        const childBlk = createProgramNodeBlock(child, available, workspace);
        if (!childBlk) continue;
        if (prevBlock) {
          prevBlock.nextConnection && childBlk.previousConnection &&
            prevBlock.nextConnection.connect(childBlk.previousConnection);
        } else {
          firstBlock = childBlk;
        }
        prevBlock = childBlk;
      }
      if (firstBlock) {
        bodyInput.connection && firstBlock.previousConnection &&
          bodyInput.connection.connect(firstBlock.previousConnection);
      }
    }

    return blk;
  }

  function createProgramNodeBlock(node, available, workspace) {
    if (!node) return null;
    switch (node.type) {
      case 'op':
        return createOpBlock(node.op, available, workspace);
      case 'repeat':
        return createRepeatUntilBlock(node, available, workspace);
      case 'fixed_repeat':
        return createFixedRepeatBlock(node, available, workspace);
      case 'ifdo':
      case 'ifelse':
        return createConditionalBlock(node, available, workspace);
      default:
        return null;
    }
  }

  function injectProgram(program, available, workspace) {
    try {
      workspace.clear();
      const root = program.root;
      const topBlock = createProgramNodeBlock(root, available, workspace);
      workspace.render();
      return { success: true };
    } catch (e) {
      console.error('[NGS] Program injection error:', e);
      return { success: false, error: e.message };
    }
  }

  // ---------------------------------------------------------------------------
  // BLOCK INJECTION DISPATCH
  // ---------------------------------------------------------------------------
  function injectBlocks(blocks, available) {
    const workspace = findBlocklyWorkspace();
    if (!workspace) return { success: false, error: 'Blockly workspace not found' };

    if (blocks.type === 'program') {
      return injectProgram(blocks, available, workspace);
    }

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
  // STRATEGY DETECTION
  // ---------------------------------------------------------------------------
  function detectStrategy(available, budget) {
    const hasRepeat = hasRepeatUntil(available);
    const hasCond = hasConditional(available);
    const hasFixedRepeat = !!findRepeatType(available);

    if (hasCond) {
      // Conditionals available — always try maze solver first
      return 'conditional_maze';
    }

    if (hasRepeat) return 'basic_with_repeat_until';
    if (hasFixedRepeat) return 'basic';
    return 'basic';
  }

  // ---------------------------------------------------------------------------
  // SIMPLIFIED CONDITIONAL SEQUENCE
  // Handles levels with conditionals but no repeat_until (e.g., duck-ball L8-L9)
  // ---------------------------------------------------------------------------
  function buildSimpleConditionalSequence(path, available, budget) {
    const dirs = computeDirectionChanges(path);
    const hasTurnLeft  = available.includes('turn_left')  || available.includes('turn_block');
    const hasTurnRight = available.includes('turn_right') || available.includes('turn_block');
    const ops = buildOps(dirs, hasTurnLeft, hasTurnRight);

    // Can we use repeat_block for straight runs?
    if (hasRepeatUntil(available)) {
      // Check if ops are mostly forward with some turns
      // Use repeat_until wrapping a sequence
      const repeatType = available.includes('repeat_block') ? 'repeat_block' : 'repeat_until';
      const bodyBlocks = ops.map(op => {
        if (op === 'forward') return { type: 'move_forward' };
        if (op === 'left') return { type: 'turn_left' };
        if (op === 'right') return { type: 'turn_right' };
        return null;
      }).filter(Boolean);

      if (bodyBlocks.length > 0) {
        // Use repeat_until as the wrapper
        const program = {
          type: 'program',
          root: {
            type: 'repeat',
            body: bodyBlocks.map(b => ({ type: 'op', op: b.type === 'move_forward' ? 'forward' : b.type === 'turn_left' ? 'left' : 'right' })),
          },
        };
        const cost = countBlocks(program);
        if (budget === null || cost <= budget) return program;
      }
    }

    return null;
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
    if (!path) return { error: 'No path found', grid: gameState };

    const workspace = findBlocklyWorkspace();
    if (!workspace) return { path, error: 'Blockly workspace not found', budget };

    const available = detectAvailableBlocks(workspace);
    if (!available.includes('move_forward'))
      return { path, error: 'move_forward block not available', available, budget };

    const strategy = detectStrategy(available, budget);
    let blocks = null;
    let strategyUsed = strategy;

    if (strategy === 'conditional_maze') {
      // Try maze solver first
      blocks = buildMazeProgram(available, budget);
      if (!blocks) {
        // Fall back to simple conditional
        const simple = buildSimpleConditionalSequence(path, available, budget);
        if (simple) {
          blocks = simple;
          strategyUsed = 'conditional_simple';
        }
      } else {
        strategyUsed = 'maze_solver';
      }
    } else if (strategy === 'basic_with_repeat_until') {
      // Try using repeat_until for straight runs, fall back to basic
      const simple = buildSimpleConditionalSequence(path, available, budget);
      if (simple) {
        blocks = simple;
        strategyUsed = 'repeat_until_sequence';
      }
    }

    if (!blocks) {
      // Fall back to basic sequence-based approach
      const dirs = computeDirectionChanges(path);
      const hasTurnLeft  = available.includes('turn_left')  || available.includes('turn_block');
      const hasTurnRight = available.includes('turn_right') || available.includes('turn_block');
      const ops = buildOps(dirs, hasTurnLeft, hasTurnRight);
      blocks = buildBlockSequence(dirs, available, budget);
      strategyUsed = 'basic_sequence';
    }

    const blockCount = countBlocks(blocks);
    const injectionResult = injectBlocks(blocks, available);

    return {
      path: path.map(p => ({ x: p.x, y: p.y })),
      blocks,
      injectionResult,
      availableBlocks: available,
      budget,
      blockCount,
      strategy: strategyUsed,
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
