import { describe, expect, it } from 'vitest'
import {
  beginRightMousePan,
  idleRightMousePan,
  updateRightMousePan,
} from '../rightMousePan'

describe('right mouse pan gesture', () => {
  it('keeps a stationary right click available for the context menu', () => {
    const gesture = beginRightMousePan(100, 100)

    expect(updateRightMousePan(gesture, 102, 102).moved).toBe(false)
  })

  it('marks a drag once movement reaches the threshold', () => {
    const gesture = beginRightMousePan(100, 100)

    expect(updateRightMousePan(gesture, 104, 100).moved).toBe(true)
  })

  it('does not arm movement before right mouse down', () => {
    const gesture = idleRightMousePan()

    expect(updateRightMousePan(gesture, 20, 20)).toEqual(gesture)
  })
})
