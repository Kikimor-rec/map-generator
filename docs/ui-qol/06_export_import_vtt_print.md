# 06 — Экспорт/импорт, VTT-совместимость, печать
Дата: 2025-12-17
## 6.1 Экспорт изображений
Форматы:
- PNG
- WebP
- SVG (схемный режим)
Опции:
- pixels-per-cell
- include grid
- include background
- crop to bounds / full canvas
- naming template: `{mapName}_{grid}_{pxPerCell}_{seed}`
## 6.2 Печать: Multi-page PDF
Один PDF с тайлингом на N страниц.
Параметры:
- paper size (A4/A3/Letter…)
- margins (мм/см/дюймы)
- print DPI
- real-world cell size (например 1 inch)
- overlap (для склейки)
## 6.3 VTT-данные
Экспортировать структуру:
- walls
- doors (type + state)
- windows (отдельный тип)
- lights
- grid size + scale
- notes (опционально)
Рекомендация:
- поддержать Universal VTT семейство (dd2vtt/df2vtt/uvtt) и “пакет экспорта”.
## 6.4 Пакетирование для Foundry (опционально)
Кнопка “Export as Foundry Module (zip)”:
- module.json
- packs/ (compendium сцены/ноты)
- assets/
## 6.5 Импорт
- Импорт собственного проекта JSON.
- Импорт dd2vtt/uvtt как reference layer или как проект (если возможно).
