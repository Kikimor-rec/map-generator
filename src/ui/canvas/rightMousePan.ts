export const RIGHT_MOUSE_PAN_THRESHOLD = 4

export interface RightMousePanGesture {
  isDown: boolean
  moved: boolean
  startX: number
  startY: number
}

export function idleRightMousePan(): RightMousePanGesture {
  return {
    isDown: false,
    moved: false,
    startX: 0,
    startY: 0,
  }
}

export function beginRightMousePan(x: number, y: number): RightMousePanGesture {
  return {
    isDown: true,
    moved: false,
    startX: x,
    startY: y,
  }
}

export function updateRightMousePan(
  gesture: RightMousePanGesture,
  x: number,
  y: number,
  threshold = RIGHT_MOUSE_PAN_THRESHOLD
): RightMousePanGesture {
  if (!gesture.isDown || gesture.moved) return gesture

  return Math.hypot(x - gesture.startX, y - gesture.startY) >= threshold
    ? { ...gesture, moved: true }
    : gesture
}
