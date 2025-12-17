# 90 — Settings Schema (черновой контракт предпочтений UI)
Дата: 2025-12-17
```json
{
  "ui": {
    "theme": "dark",
    "uiScale": 1.0,
    "language": "ru",
    "reducedMotion": false
  },
  "canvas": {
    "grid": {
      "type": "square",
      "size": 50,
      "snap": true,
      "show": true
    },
    "isometricView": false,
    "minimap": {
      "enabled": true
    },
    "guides": {
      "rulers": false,
      "snapObjects": true,
      "magnetStrength": 0.7
    }
  },
  "shortcuts": {
    "profile": "default",
    "bindings": {
      "tool.select": "V",
      "tool.room": "R",
      "tool.corridor": "C",
      "tool.icon": "I",
      "tool.text": "T",
      "commandPalette": "Ctrl+K"
    }
  },
  "export": {
    "image": {
      "format": "webp",
      "pxPerCell": 128,
      "includeGrid": true
    },
    "pdf": {
      "paper": "A4",
      "marginsMm": 10,
      "cellSizeMm": 25.4,
      "dpi": 300
    },
    "vtt": {
      "format": "dd2vtt",
      "includeLights": true,
      "includeWalls": true
    }
  },
  "generator": {
    "profile": "realism",
    "seed": null,
    "gallerySize": 8,
    "locks": {
      "rooms": false,
      "edges": false,
      "style": false
    }
  }
}
```
