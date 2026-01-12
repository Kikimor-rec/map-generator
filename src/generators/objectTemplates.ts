import { ObjectCategory, Size, LayerType } from '@core/types';

export interface ObjectTemplate {
    id: string;
    name: string;
    width: number;
    height: number;
    category: ObjectCategory;
    color: string;
    layer: LayerType;
    icon?: string;
}

export const OBJECT_TEMPLATES: Record<string, ObjectTemplate> = {
    // Furniture
    'bed': { id: 'bed', name: 'Bed', width: 20, height: 30, category: ObjectCategory.Furniture, color: '#4b5563', layer: LayerType.Furniture },
    'bunk': { id: 'bunk', name: 'Bunk Bed', width: 20, height: 30, category: ObjectCategory.Furniture, color: '#4b5563', layer: LayerType.Furniture },
    'desk': { id: 'desk', name: 'Desk', width: 30, height: 15, category: ObjectCategory.Furniture, color: '#9ca3af', layer: LayerType.Furniture },
    'chair': { id: 'chair', name: 'Chair', width: 12, height: 12, category: ObjectCategory.Furniture, color: '#6b7280', layer: LayerType.Furniture },
    'wardrobe': { id: 'wardrobe', name: 'Wardrobe', width: 25, height: 15, category: ObjectCategory.Furniture, color: '#374151', layer: LayerType.Furniture },
    'sofa': { id: 'sofa', name: 'Sofa', width: 40, height: 20, category: ObjectCategory.Furniture, color: '#7c3aed', layer: LayerType.Furniture },
    'table': { id: 'table', name: 'Table', width: 40, height: 40, category: ObjectCategory.Furniture, color: '#9ca3af', layer: LayerType.Furniture },
    'dining_table': { id: 'dining_table', name: 'Dining Table', width: 60, height: 30, category: ObjectCategory.Furniture, color: '#9ca3af', layer: LayerType.Furniture },

    // Equipment
    'console': { id: 'console', name: 'Console', width: 30, height: 15, category: ObjectCategory.Equipment, color: '#3b82f6', layer: LayerType.Furniture },
    'terminal': { id: 'terminal', name: 'Terminal', width: 15, height: 15, category: ObjectCategory.Equipment, color: '#10b981', layer: LayerType.Furniture },
    'server_rack': { id: 'server_rack', name: 'Server Rack', width: 20, height: 10, category: ObjectCategory.Equipment, color: '#1f2937', layer: LayerType.Furniture },
    'med_bed': { id: 'med_bed', name: 'Medical Bed', width: 25, height: 40, category: ObjectCategory.Equipment, color: '#ef4444', layer: LayerType.Furniture },
    'reactor_core': { id: 'reactor_core', name: 'Reactor Core', width: 60, height: 60, category: ObjectCategory.Equipment, color: '#f59e0b', layer: LayerType.Furniture },
    'warp_core': { id: 'warp_core', name: 'Warp Core', width: 40, height: 80, category: ObjectCategory.Equipment, color: '#3b82f6', layer: LayerType.Furniture },
    'crate': { id: 'crate', name: 'Crate', width: 20, height: 20, category: ObjectCategory.Equipment, color: '#d97706', layer: LayerType.Furniture },
    'weapons_rack': { id: 'weapons_rack', name: 'Weapons Rack', width: 30, height: 10, category: ObjectCategory.Equipment, color: '#dc2626', layer: LayerType.Furniture },

    // Default fallback
    'generic': { id: 'generic', name: 'Object', width: 20, height: 20, category: ObjectCategory.Decoration, color: '#9ca3af', layer: LayerType.Furniture }
};
