import type { ClientSurface } from 'claude-code'

type PointerState = { down: { x: number; y: number } | null; dragged: boolean }

/** A transparent hit region behind the picture and its frame. */
export default function thumbnailPointer(_props: unknown, surface: ClientSurface<PointerState>) {
  const { Box } = surface.elements
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < surface.columns && y < surface.rows
  surface.onPointer(event => {
    if (event.type === 'down') {
      const accepts = event.button === 'left' && !event.ctrl && !event.alt && !event.shift && inside(event.x, event.y)
      surface.setState({ down: accepts ? { x: event.x, y: event.y } : null, dragged: false })
      return
    }
    const down = surface.state?.down
    if (!down) return
    const moved = Math.abs(event.x - down.x) > 1 || Math.abs(event.y - down.y) > 1
    if (event.type === 'move') {
      if (moved) surface.setState({ down, dragged: true })
      return
    }
    if (event.type === 'up') {
      const opens = !surface.state?.dragged && !moved && !event.ctrl && !event.alt && !event.shift &&
        (event.button === undefined || event.button === 'left') && inside(event.x, event.y)
      surface.setState({ down: null, dragged: false })
      if (opens) surface.post('open-preview')
    }
  })
  return <Box width="100%" height="100%" />
}
