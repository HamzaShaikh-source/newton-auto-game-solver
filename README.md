# Newton Auto Game Solver

A Chrome extension that automatically solves Newton School's block-based coding games using DOM parsing, BFS pathfinding, and Blockly workspace injection.

## How It Works

1. **DOM Parsing** — Reads the game grid from page elements (`Uber_map_element__lgLxt`), identifies terrain types from sprite filenames (`rock.png` → wall, `water.png` → goal, etc.), and locates the player sprite and destination icon by their bounding boxes.

2. **BFS Pathfinding** — Runs a breadth-first search on the parsed grid to find the shortest valid path from the player to the goal, avoiding walls and hazards.

3. **Block Generation** — Converts the path into a sequence of block operations (`move_forward`, `turn_left`, `turn_right`) with optimal turn minimization.

4. **Blockly Injection** — Walks the React fiber tree of the page's Blockly workspace to access the workspace object directly, clears existing blocks, and programmatically injects the computed solution blocks using `workspace.newBlock()`.

5. **Communication** — Uses a dual-world architecture (isolated world content script + main world script injection via script tag) bridged by `postMessage` for extension API access and page JS interop.

## Games Supported

All 6 Newton School block-coding games:

| Game | Goal Type | Block Set |
|------|-----------|-----------|
| Tortoise Water Game | water.png | move forward, repeat N times |
| Boat to the Shore | passenger.png | move forward, turn, repeat until |
| Mouse wants Laddoo | laddoo.png | move forward, turn, repeat until, if/else |
| Duck Duck Go! | ball.png | move forward, turn, repeat until, if/else |
| A Friend In Need | burger.png | move forward, turn, repeat until, if/else |
| Hungry Duck | burger.png | move forward, turn, repeat until, if/else |

## Installation

1. Clone this repo:
   ```
   git clone https://github.com/HamzaShaikh-source/newton-auto-game-solver.git
   ```
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top-right)
4. Click **Load unpacked** → select the `newton-auto-game-solver` folder
5. Navigate to any Newton School block game at `https://my.newtonschool.co/games`

## Usage

1. Open any Newton School block game
2. Click the extension icon in the toolbar to open the popup
3. Click **Auto-Solve This Level**
4. The extension reads the grid, computes the path, and injects blocks into the Blockly workspace
5. Click **Run** in the game UI to execute the solution

## Architecture

```
popup.html/js ──chrome.tabs.sendMessage──▶ content.js (isolated world)
                                                │
                                          injects <script> tag
                                                │
                                                ▼
                                         solver.js (main world)
                                                │
                                    ┌───────────┼───────────┐
                                    ▼           ▼           ▼
                              Read grid    BFS pathfind  Inject blocks
                              via DOM      via BFS       via React fiber
                                                        workspace access
                                                │
                                    postMessage result
                                                │
                                                ▼
                                         content.js stores
                                         result for popup
```

## File Structure

```
newton-auto-game-solver/
├── manifest.json      # Chrome Extension Manifest V3
├── content.js         # Isolated world content script (bridge)
├── solver.js          # Main world solver (pathfinding + injection)
├── popup.html         # Extension popup UI
├── popup.js           # Popup logic (status, trigger, display)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Technical Details

### Grid Detection
- The game map is a grid of `<img>` elements inside a container with class `Uber_map_element__lgLxt`
- Terrain type is inferred from the image filename (e.g., `rock.png` → wall, `water.png` → goal)
- Player and destination positions are determined by absolutely-positioned icons (`BlockGames_sprite_icon__bSyB5`, `BlockGames_destination_icon__X1Q8i`)

### Blockly Workspace Access
Blockly's API is bundled inside Next.js chunks and not globally exposed. The extension accesses the workspace by:
1. Finding the `.injectionDiv` element
2. Walking the React fiber tree (`__reactFiber$` property) to find the workspace object
3. Using `workspace.newBlock()`, `workspace.clear()`, and `workspace.render()` to manipulate blocks

### Turn Optimization
The direction-to-blocks converter minimizes the number of turn blocks by choosing between left and right rotations (always turning the shorter way).

## Limitations

- The class names with hashes (e.g., `Uber_map_element__lgLxt`) may change if Newton School updates their build system — the extension would need selector updates
- Block type names in Blockly (`move_forward`, `turn_left`, etc.) are inferred and may vary per game
- Complex games with `if/else` and `repeat until` blocks use simplified path representations (turn + move sequence) without full control flow optimization yet

## License

MIT
