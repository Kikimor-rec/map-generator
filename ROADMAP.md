# Roadmap: Sci-Fi Map Generator

> **Goal**: Build the best browser-based editor for sci-fi RPG maps, focusing on usability, procedural generation, and high-quality export.

## 🟢 Phase 1: Core Usability & Export (Current Focus)
**Theme**: "Make it usable for a real game session"

### 1.1 Robust Export (Critical)
- [ ] **Export to PNG/WebP**: High-resolution export with configurable DPI.
- [ ] **Printer-Friendly PDF**: Multi-page PDF generation with grid alignment, margins, and "black & white" mode to save ink.
- [ ] **VTT Support**: Export to Universal VTT (dd2vtt) or standard JSON for FoundryVTT/Roll20.

### 1.2 UX Improvements
- [ ] **Command Palette (Ctrl+K)**: Fast access to all tools and generators.
- [ ] **Smart Selection**: Better multi-select, group move, and easy property editing.
- [ ] **Keyboard Customization**: Allow users to rebind keys.

### 1.3 Persistence
- [x] Auto-save (localStorage).
- [ ] **File System**: Robust Save/Load to `.json` files.
- [ ] **Browser Storage**: Project list management (Rename, Duplicate, Delete).

---

## 🟡 Phase 2: Content & Immersion
**Theme**: "Make the maps look alive"

### 2.1 Object Library (Interiors)
- [ ] **Furniture**: Tables, chairs, beds (Crew quarters).
- [ ] **Tech**: Consoles, servers, reactors (Engineering/Bridge).
- [ ] **Hazards**: Vents, gore, damage markers.
- [ ] **Smart Placement**: "Auto-furnish" button (e.g. Medbay gets 4 beds + scanner).

### 2.2 Layers System
- [ ] **Management**: UI to Hide/Lock/Solo layers.
- [ ] **Structural Layers**: Walls, Floor, Grid.
- [ ] **Detail Layers**: Props, Text, GM Secrets (hidden from players).

### 2.3 Visual Polish
- [ ] **Themes**: More visual themes (Cyberpunk Neon, Retro Cassette, Alien Organic).
- [ ] **Effects**: Optional scanlines, glow, simple lighting.

---

## 🔴 Phase 3: Advanced Architectures
**Theme**: "Complex multi-level structures"

### 3.1 Multi-Deck Support
- [ ] **Vertical Connections**: Elevators and stairs that logically link decks.
- [ ] **Ghost View**: Seeing the "outline" of the deck below.
- [ ] **Deck Manager**: Reorder, duplicate, and merge decks.

### 3.2 Advanced Generators
- [ ] **Station Generator**: Concentric rings and large hubs.
- [ ] **Mega-dungeon**: Infinite scrolling or chunk-based generation.
- [ ] **Geomorph Mode**: Assembling maps from pre-made tiles.

---

## Long-term Vision
- **Community Library**: Share room presets and map files.
- **AI Assistant**: "Make this room look like a messy lab" (LLM integration).
- **Collab**: Real-time multiplayer editing (P2P).
