import React from 'react'

interface IconProps {
  size?: number
  className?: string
  color?: string
}

// ============================================================================
// Tool Icons
// ============================================================================

export const SelectIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    <path d="M13 13l6 6" />
  </svg>
)

export const RoomIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
)

export const CorridorIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M4 12h16" />
    <path d="M12 4v16" />
    <circle cx="4" cy="12" r="2" fill={color} />
    <circle cx="20" cy="12" r="2" fill={color} />
    <circle cx="12" cy="4" r="2" fill={color} />
    <circle cx="12" cy="20" r="2" fill={color} />
  </svg>
)

export const DoorIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M5 2h14a1 1 0 011 1v18a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" />
    <path d="M15 12h.01" />
    <path d="M9 2v20" />
  </svg>
)

export const EraserIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14.8 1.4c.8-.8 2-.8 2.8 0l5 5c.8.8.8 2 0 2.8L11 20.8" />
    <path d="M7 20h13" />
  </svg>
)

export const PanIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M18 11V6a2 2 0 00-2-2 2 2 0 00-2 2v0" />
    <path d="M14 10V4a2 2 0 00-2-2 2 2 0 00-2 2v6" />
    <path d="M10 10.5V6a2 2 0 00-2-2 2 2 0 00-2 2v8" />
    <path d="M18 8a2 2 0 012 2v7.4a4 4 0 01-.68 2.24L17.46 22H8l-3.16-4.74A4 4 0 014 15V9a2 2 0 012-2 2 2 0 012 2" />
  </svg>
)

export const ObjectIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    <path d="M3.3 7l8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </svg>
)

export const AnnotateIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
)

// ============================================================================
// Action Icons
// ============================================================================

export const DuplicateIcon: React.FC<IconProps> = ({ size = 16, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
)

export const TrashIcon: React.FC<IconProps> = ({ size = 16, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
)

export const BringToFrontIcon: React.FC<IconProps> = ({ size = 16, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M4 16V6a2 2 0 012-2h10" />
    <path d="M12 2v4" />
    <path d="M10 4l2-2 2 2" />
  </svg>
)

export const SendToBackIcon: React.FC<IconProps> = ({ size = 16, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <rect x="4" y="4" width="12" height="12" rx="2" />
    <path d="M8 20h10a2 2 0 002-2V8" />
    <path d="M12 22v-4" />
    <path d="M10 20l2 2 2-2" />
  </svg>
)

export const SelectAllIcon: React.FC<IconProps> = ({ size = 16, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2" />
    <rect x="7" y="7" width="10" height="10" rx="1" />
  </svg>
)

export const EyeIcon: React.FC<IconProps> = ({ size = 16, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const EyeOffIcon: React.FC<IconProps> = ({ size = 16, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
    <path d="M1 1l22 22" />
  </svg>
)

// ============================================================================
// Door Type Icons (for map display)
// ============================================================================

export const DoorStandardIcon: React.FC<IconProps> = ({ size = 24, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="4" y="2" width="16" height="20" stroke={color} strokeWidth="2" fill="none" />
    <circle cx="16" cy="12" r="1.5" fill={color} />
    <line x1="4" y1="22" x2="20" y2="22" stroke={color} strokeWidth="2" />
  </svg>
)

export const DoorSlidingIcon: React.FC<IconProps> = ({ size = 24, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="3" y="4" width="7" height="16" stroke={color} strokeWidth="2" fill="none" />
    <rect x="14" y="4" width="7" height="16" stroke={color} strokeWidth="2" fill="none" />
    <path d="M10 10l2 2-2 2" stroke={color} strokeWidth="1.5" />
    <path d="M14 10l-2 2 2 2" stroke={color} strokeWidth="1.5" />
  </svg>
)

export const DoorAirlockIcon: React.FC<IconProps> = ({ size = 24, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="2" y="4" width="20" height="16" rx="2" stroke={color} strokeWidth="2" fill="none" />
    <line x1="8" y1="4" x2="8" y2="20" stroke={color} strokeWidth="1.5" />
    <line x1="16" y1="4" x2="16" y2="20" stroke={color} strokeWidth="1.5" />
    <circle cx="12" cy="12" r="2" stroke={color} strokeWidth="1.5" fill="none" />
  </svg>
)

export const DoorEmergencyIcon: React.FC<IconProps> = ({ size = 24, className = '', color = '#ff4444' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="4" y="2" width="16" height="20" stroke={color} strokeWidth="2" fill="none" />
    <path d="M12 7v6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="17" r="1" fill={color} />
  </svg>
)

export const DoorMaintenanceIcon: React.FC<IconProps> = ({ size = 24, className = '', color = '#ffaa00' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="4" y="2" width="16" height="20" stroke={color} strokeWidth="2" fill="none" />
    <path d="M9 12l2 2 4-4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const DoorSecurityIcon: React.FC<IconProps> = ({ size = 24, className = '', color = '#ff6600' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="4" y="2" width="16" height="20" stroke={color} strokeWidth="2" fill="none" />
    <path d="M12 8v4l2 2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="9" y="15" width="6" height="4" rx="1" fill={color} />
  </svg>
)

export const DoorBlastIcon: React.FC<IconProps> = ({ size = 24, className = '', color = '#cc0000' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="3" y="3" width="18" height="18" stroke={color} strokeWidth="3" fill="none" />
    <line x1="7" y1="7" x2="17" y2="17" stroke={color} strokeWidth="2" />
    <line x1="17" y1="7" x2="7" y2="17" stroke={color} strokeWidth="2" />
  </svg>
)

// ============================================================================
// Room Type Icons
// ============================================================================

export const BridgeIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
  </svg>
)

export const EngineRoomIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
    <path d="M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
  </svg>
)

export const MedBayIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M12 2v20M2 12h20" strokeLinecap="round" />
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>
)

export const CargoHoldIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    <path d="M3.3 7l8.7 5 8.7-5M12 22V12" />
  </svg>
)

export const CrewQuartersIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M2 4v16" />
    <path d="M2 8h18a2 2 0 012 2v10" />
    <path d="M2 17h20" />
    <path d="M6 8v9" />
  </svg>
)

export const LabIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M9 3h6M12 3v6M6 9h12l-3 12H9L6 9z" />
  </svg>
)

export const ArmoryIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
)

export const StorageIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <rect x="3" y="3" width="18" height="6" rx="1" />
    <rect x="3" y="15" width="18" height="6" rx="1" />
    <path d="M3 9h18v6H3z" />
  </svg>
)

export const LifeSupportIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
    <path d="M12 6v6l4 2" />
  </svg>
)

export const ReactorIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" fill={color} />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
  </svg>
)

export const HangarIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M2 20h20" />
    <path d="M4 20V8l8-6 8 6v12" />
    <rect x="9" y="12" width="6" height="8" />
  </svg>
)

export const MessHallIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M3 11h18M3 11v6a2 2 0 002 2h14a2 2 0 002-2v-6M12 11V4" />
    <circle cx="8" cy="7" r="2" />
    <circle cx="16" cy="7" r="2" />
  </svg>
)

export const GymIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M6 5v14M18 5v14M6 12h12" />
    <path d="M3 8v8M21 8v8" />
  </svg>
)

export const ToolIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  </svg>
)

export const GenericRoomIcon: React.FC<IconProps> = ({ size = 20, className = '', color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke={color} strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 9h6v6H9z" />
  </svg>
)

// ============================================================================
// Export Icon Map
// ============================================================================

export const TOOL_ICONS: Record<string, React.FC<IconProps>> = {
  Select: SelectIcon,
  Room: RoomIcon,
  Corridor: CorridorIcon,
  Door: DoorIcon,
  Eraser: EraserIcon,
  Pan: PanIcon,
  Object: ObjectIcon,
  Annotate: AnnotateIcon,
}

export const DOOR_ICONS: Record<string, React.FC<IconProps>> = {
  standard: DoorStandardIcon,
  sliding: DoorSlidingIcon,
  airlock: DoorAirlockIcon,
  emergency: DoorEmergencyIcon,
  maintenance: DoorMaintenanceIcon,
  security: DoorSecurityIcon,
  blast: DoorBlastIcon,
}

export const ROOM_ICONS: Record<string, React.FC<IconProps>> = {
  Bridge: BridgeIcon,
  EngineRoom: EngineRoomIcon,
  MedBay: MedBayIcon,
  CargoHold: CargoHoldIcon,
  CrewQuarters: CrewQuartersIcon,
  Laboratory: LabIcon,
  Armory: ArmoryIcon,
  Storage: StorageIcon,
  LifeSupport: LifeSupportIcon,
  Reactor: ReactorIcon,
  Hangar: HangarIcon,
  MessHall: MessHallIcon,
  Gym: GymIcon,
  Maintenance: ToolIcon,
  Generic: GenericRoomIcon,
}
