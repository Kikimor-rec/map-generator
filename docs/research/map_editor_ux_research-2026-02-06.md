# Research: Modern Map Editor UI/UX Best Practices

**Date:** 2026-02-06
**Status:** Complete
**Scope:** UI/UX analysis of existing TTRPG map editors and modern web editor patterns
**Application:** React + PixiJS sci-fi map generator/editor

---

## 1. EXISTING MAP EDITORS -- UI/UX ANALYSIS

### Dungeondraft
- **Why popular:** Smart tiling engine auto-blends terrain; huge community asset ecosystem; "draw and it looks good" workflow
- **Toolbar:** Left vertical bar with tool icons (select, draw wall, paint terrain, place object, measure)
- **Property panel:** Right side context-sensitive inspector
- **Canvas:** Middle click to pan, scroll to zoom, grid snap on by default
- **Generation:** Built-in cave/dungeon generator with sliders, then manual refinement
- **Key lesson:** Users want to generate THEN edit -- not one or the other

### Dungeon Scrawl
- **Approach:** Minimalist, old-school aesthetic; manual drawing with smart snapping
- **Toolbar:** Top horizontal with minimal icons; most interaction is drawing
- **Key strength:** Extremely fast workflow for simple maps; Roll20 integration
- **Key lesson:** Simple tools with smart defaults beat complex tools with many options

### Wonderdraft (World Maps)
- **Toolbar:** Left sidebar with tool groups (landmass, terrain, symbols, labels, paths)
- **Property panel:** Right panel with brush settings, style options
- **Key lesson:** Theming system (Parchment, Atlas, Satellite) lets one map serve multiple purposes

### Inkarnate
- **Web-based:** Full browser editor with layers, stamps, text
- **Toolbar:** Left side vertical with categories (shapes, stamps, textures, text)
- **Layer panel:** Right side with Photoshop-style layer list
- **Key lesson:** Web-based editors CAN feel professional; don't need desktop app

### Foundry VTT
- **Approach:** VTT-first with built-in scene editor
- **Tools:** Walls, lighting, tokens, tiles, drawings in scene editing mode
- **Module ecosystem:** Dungeon Draw module adds freehand drawing tools
- **Key lesson:** Separate "build mode" from "play mode" -- different tools for different tasks

### Owlbear Rodeo
- **Approach:** Ultra-minimal; "virtual tabletop, not virtual world"
- **Tools:** Pointer, draw, fog, measure, note -- that's it
- **Key lesson:** Constraints breed creativity; not every feature needs implementation

### Arkenforge (Sci-Fi)
- **One of few sci-fi focused tools**
- **Module-based:** Click to place pre-made tiles and modules
- **Key lesson:** Modular placement (snap pre-made sections together) is intuitive for sci-fi structures

### NEWT Blueprint Builder
- **Sci-fi blueprint aesthetic**
- **Tile-based grid drawing with preset rooms**
- **Key lesson:** Blueprint visual style resonates strongly with sci-fi audience

### Cosmographer 3 (ProFantasy)
- **Vector-based precise drawing tools**
- **CAD-like interface with snap/grid/dimension tools**
- **Key lesson:** Precision matters for sci-fi; "looks engineered" beats "looks organic"

---

## 2. CANVAS-BASED EDITOR UI PATTERNS

### Zoom & Pan
- **Zoom to cursor:** Zoom should center on mouse position, not canvas center
- **Scroll = zoom:** Universal convention; Ctrl+scroll for horizontal pan
- **Space+drag = pan:** Figma/Photoshop convention; temporary pan mode
- **Pinch-to-zoom on trackpad:** Required for laptop users
- **Min/Max zoom limits:** Prevent losing the map; show minimap at extreme zoom-out
- **Zoom level indicator:** Show percentage in status bar; click to reset to 100%

### Selection Patterns
- **Click = select single:** Standard
- **Shift+Click = toggle selection:** Add/remove from multi-select
- **Marquee (drag) = select area:** Drag from empty space creates selection rectangle
- **Double-click = edit:** Enter edit mode for the selected object (rename room, edit corridor)
- **Edge auto-pan:** When dragging near canvas edge, auto-pan in that direction

### Drag-to-Create vs Click-to-Place
- **Rooms:** Drag-to-create (define rectangle by dragging) is most intuitive
- **Corridors:** Click start point, click end point (or drag for preview)
- **Doors:** Click on wall/corridor edge to place
- **Objects:** Click to place at cursor; drag for size/rotation

### Grid Snapping
- **On by default:** Most users expect grid snap
- **Alt to temporarily disable:** Universal modifier for free placement
- **Subdivision snapping:** Allow half-grid snapping for finer control
- **Smart guides:** Show alignment lines when near other objects (Figma-style)
- **Visual feedback:** Highlight grid cells on hover when placing

### Undo/Redo
- **Command pattern:** Each action is a reversible command
- **Coalesce drag operations:** Many small moves during one drag = one undo step
- **Skip camera state:** Don't include pan/zoom in undo history
- **History panel (optional):** Visual list of recent actions; click to jump to state
- **Ctrl+Z / Ctrl+Shift+Z:** Universal shortcuts

### Layer Management
- **Eye icon = visibility toggle**
- **Lock icon = prevent editing**
- **Opacity slider per layer**
- **Drag to reorder layers**
- **Solo mode: Alt+click eye = show only this layer**
- **For this project:** Layers = Rooms, Corridors, Doors, Objects, Annotations, Grid

### Context Menus vs Toolbars vs Panels
- **Top toolbar:** File operations, mode switching, global actions
- **Left toolbar:** Active tools (select, draw room, draw corridor, place door, etc.)
- **Right panel:** Context-sensitive inspector (properties of selected object)
- **Bottom status bar:** Coordinates, zoom level, selection info
- **Context menu (right-click):** Common actions for selected objects
- **Floating panels:** Avoid -- they obscure canvas and are hard to manage

---

## 3. PROCEDURAL GENERATION UI

### Tiered Parameter Disclosure
- **Level 1 (always visible):** Archetype, subtype, size -- the 3 most impactful choices
- **Level 2 (expandable):** Loopiness, danger, seed -- secondary parameters
- **Level 3 (advanced):** All detailed parameters in a collapsible "Advanced" section
- **Key principle:** Don't show 20 sliders at once; overwhelms users

### Preview Before Commit
- **Generate into temporary overlay**, not directly into editor
- **"Apply" / "Discard" buttons** to commit or reject
- **Visual diff:** Show what will change vs current map state
- **Quick preview (low-detail):** Fast generation with simplified rendering for rapid iteration

### Seed-Based Regeneration UX
- **Visible seed field:** Show current seed; allow copy/paste
- **"Reroll" button:** Generate with random new seed (keep all other params)
- **Seed history:** Remember last 5-10 seeds for easy comparison
- **"Share seed" feature:** Copy seed + params as shareable string
- **Lock seed + vary params:** Keep same seed, adjust other sliders to see effect

### Partial Regeneration
- **"Regenerate section":** Select a region and regenerate only that area
- **"Swap room type":** Change a room's purpose without regenerating everything
- **"Add room":** Procedurally add one room to existing map
- **"Pin rooms":** Mark rooms that should not be moved/changed during regeneration

### Iterative Refinement Workflow
1. Generate base map
2. Review and pin good rooms/corridors
3. Regenerate undesirable sections
4. Switch to manual editing for fine-tuning
5. Add objects/furniture/annotations
6. Export

---

## 4. MODERN WEB EDITOR UX PATTERNS

### Figma-Style Property Inspector
- **Contextual:** Shows different properties based on what's selected
- **Inline editing:** Click values to edit directly (no modal dialogs)
- **Multi-select properties:** When multiple objects selected, show shared properties with mixed-value indicators
- **Organized sections:** Group by category (Position, Appearance, Metadata) with collapsible headers

### Keyboard Shortcuts
**Essential shortcuts for a map editor:**
| Action | Shortcut | Notes |
|--------|----------|-------|
| Select tool | V | Figma convention |
| Room tool | R | |
| Corridor tool | C | |
| Door tool | D | |
| Pan (temp) | Space+drag | |
| Zoom in/out | Ctrl+/- or scroll | |
| Undo/Redo | Ctrl+Z / Ctrl+Shift+Z | |
| Delete | Delete/Backspace | |
| Duplicate | Ctrl+D | |
| Group | Ctrl+G | |
| Deselect | Escape | |
| Toggle grid | G | |
| Toggle snap | Ctrl+Shift+' | |
| Command palette | Ctrl+K | |
| Generate | Ctrl+Shift+G | |
| Export | Ctrl+E | |
| Save | Ctrl+S | |
| Fit to view | Ctrl+1 | |
| Zoom to 100% | Ctrl+0 | |

### Dark Theme Best Practices
- **Avoid pure black (#000):** Use #1a1a1a to #2d2d2d for backgrounds
- **Desaturate accent colors:** Bright colors on dark backgrounds cause eye strain
- **Elevation via brightness:** Higher layers = slightly lighter background (Material Design)
- **Contrast ratios:** Minimum 4.5:1 for text; 3:1 for interactive elements
- **Consistent with blueprint theme:** Dark blue/navy backgrounds suit sci-fi aesthetic

### Collapsible/Resizable Panels
- **Fixed layout preferred** over floating panels (Figma moved back to fixed)
- **Collapsible to icon strip:** Panel collapses to thin icon bar; click to expand
- **Draggable dividers:** Resize panel width with drag handle
- **Focus Mode:** Ctrl+\ to hide all panels, showing only canvas
- **Remember layout:** Persist panel states across sessions

### Status Bar Information
- **Cursor coordinates:** X, Y in grid units
- **Selection info:** Count of selected objects; type breakdown
- **Zoom level:** Percentage with click-to-reset
- **Current deck:** Active deck name/number
- **Generation status:** Progress bar during generation
- **Performance indicator:** FPS counter (optional, togglable)

---

## 5. EXPORT AND SHARING

### Export Formats Priority
| Format | Priority | Use Case |
|--------|----------|----------|
| PNG | P0 (done) | Digital use, VTT upload, sharing |
| JSON | P1 | Save/load, version control, sharing between users |
| PDF | P1 | Print for physical table play |
| Universal VTT (.dd2vtt) | P2 | Foundry VTT, Roll20 import |
| SVG | P3 | High-quality scalable output |
| WebP | P3 | Smaller file size alternative to PNG |

### PNG/Image Export Options
- **DPI selection:** 72 (screen), 150 (decent print), 300 (high quality print)
- **Grid overlay toggle:** Include/exclude grid lines
- **Background toggle:** Transparent or themed background
- **Scale factor:** 1x, 2x, 4x for resolution control
- **Crop to content:** Auto-trim empty space

### PDF Export (Critical for TTRPG)
- **Grid-aligned pages:** Map split across standard paper sizes
- **Legend page:** Room labels, room types, notes
- **Printer-friendly mode:** Black and white, thinner lines
- **Cut marks:** For assembling multi-page maps
- **Scale indicator:** "1 square = 5 feet" label on every page

### VTT Export
- **Universal VTT (.dd2vtt):** Contains image + wall data + door data + light data
- **Foundry VTT JSON:** Scene data with walls, lights, tokens
- **Grid-flush export:** Image dimensions exactly match grid (no partial squares at edges)

---

## 6. ACCESSIBILITY

### Color Blind Friendly Design
- **Never use color alone** to convey information -- combine with icons, patterns, or labels
- **Pattern fills** for room zones in addition to colors
- **Safe color palettes:** Avoid red/green distinctions; use blue/orange or blue/yellow
- **Color blind simulation mode:** Let users preview how the map looks with different color vision

### Keyboard Navigation
- **Full tool selection via keyboard:** Number keys or letter shortcuts
- **Tab order for panels:** Tab through inspector fields
- **Focus indicators:** Visible outline on focused elements
- **Arrow key nudging:** Move selected objects by 1 grid unit; Shift+arrow = 10 units

### Screen Reader Considerations
- **ARIA labels on canvas:** Describe what's visible ("Map canvas, 12 rooms, 8 corridors")
- **aria-live announcements:** "Room placed at 5, 3" when actions occur
- **Alternative list view:** Non-visual representation of map as a list of rooms and connections
- **Focus mode for text content:** Accessible room list with labels and properties

---

## 7. PERFORMANCE UX

### Loading State Thresholds
| Duration | Treatment |
|----------|-----------|
| < 300ms | No indicator needed; feels instant |
| 300ms - 2s | Skeleton screen or spinner |
| 2s - 10s | Progress bar with stage labels ("Carving hull...", "Placing rooms...") |
| > 10s | Progress bar + cancel button + estimated time remaining |

### PixiJS-Specific Optimizations
- **Culling:** Set `cullable = true` on containers; skip rendering off-screen objects
- **cacheAsBitmap:** Use for static elements (grid, placed rooms); disable when editing
- **Spritesheets:** Batch similar small objects into sprite atlases
- **Minimize masks:** Masks are expensive; prefer clip rectangles where possible
- **Object pooling:** Reuse graphics objects instead of creating/destroying

### Object Count Thresholds
| Objects | Strategy |
|---------|----------|
| < 500 | No optimization needed |
| 500-1000 | Enable culling, batch rendering |
| 1000-5000 | Level-of-detail rendering; simplify distant objects |
| 5000+ | Tile-based chunking; render only visible chunks |

### Level-of-Detail Rendering
- **Zoomed out:** Show room outlines + labels only; hide objects, furniture, details
- **Zoomed normal:** Full rendering with all objects
- **Zoomed in:** Show extra detail (textures, small objects, wall thickness)

---

## 8. PRIORITY RECOMMENDATIONS FOR THIS PROJECT

### Quick Wins (1-2 hours each)
1. Add zoom-to-cursor (if not already)
2. Show cursor grid coordinates in status bar
3. Add Ctrl+K command palette (if not already)
4. Show generation progress stages in UI
5. Add "Reroll" button with seed history (last 5)
6. Show grid coordinates on hover
7. Add Focus Mode (Ctrl+\ to hide panels)
8. Add keyboard shortcut hints to toolbar tooltips

### Medium Effort (4-8 hours each)
1. Tiered generation parameters (Level 1/2/3 disclosure)
2. Preview-before-commit for generation
3. Pin-rooms-during-regeneration feature
4. PDF export with grid-aligned pages
5. JSON save/load for maps
6. Context-sensitive right-click menu
7. Panel collapse/expand with memory

### Roadmap Items (1-2 weeks each)
1. Universal VTT export (.dd2vtt)
2. Object/furniture placement system
3. Layer management UI
4. Room shape variants (L-shape, T-shape)
5. Iterative generation workflow (generate > pin > regenerate)
6. Accessibility audit and fixes

---

## DECISIONS

### Adopt
1. **Tiered parameter disclosure** -- Move generation panel to 3-level disclosure
2. **Preview-before-commit** -- Generate into overlay, apply/discard
3. **Seed history** -- Remember last 10 seeds with thumbnail preview
4. **Blueprint dark theme** -- Dark navy (#0d1b2a) as primary background; desaturated blue accents
5. **Fixed panel layout** -- No floating panels; collapsible sidebars
6. **Grid coordinate display** -- Always visible in status bar
7. **Keyboard-first design** -- Every tool and action has a keyboard shortcut
8. **Export priority** -- PNG (done) > JSON save/load > PDF > VTT

### Reject
1. **Floating panels** -- Harder to manage; obscure canvas; Figma abandoned them
2. **Complex layer system immediately** -- Start with fixed layers (rooms, corridors, doors, annotations)
3. **3D view** -- Not needed for 2D grid-based TTRPG maps; adds massive complexity
4. **Asset marketplace** -- Too early; focus on procedural generation quality first
5. **Collaborative real-time editing** -- Massive engineering effort for marginal benefit at this stage

### Proposed Code Changes
- `GenerationPanel.tsx` -- Refactor to 3-tier parameter disclosure; add seed history; add preview mode
- `StatusBar.tsx` -- Add grid coordinates, selection details, zoom percentage
- `Toolbar.tsx` -- Add keyboard shortcut hints; ensure all tools have hotkeys
- `MapCanvas.tsx` -- Ensure zoom-to-cursor; add Focus Mode; add culling for performance
- `RightPanel.tsx` -- Make context-sensitive; collapsible sections
- `TopBar.tsx` -- Add mode indicators (Edit/Generate/Review)
- New: `ExportPanel.tsx` -- Unified export dialog with format options
- New: `CommandPalette.tsx` -- Ctrl+K searchable command list (if not exists)
