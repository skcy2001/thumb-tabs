import { useEffect, useRef } from 'react'
import { INNER_RESIZE_HANDLE_WIDTH, type Side } from '../../shared/types'

interface Props {
  side: Side
  collapsed: boolean
}

/**
 * Outer-edge drag. Where the host can draw a resize guide, the guide follows
 * the pointer and the pane resizes once on release; resizing a native window
 * with a live page every frame is visibly jagged. Hosts without a guide fall
 * back to live resizing. Either way, at most one send per animation frame.
 */
export function PaneResizeHandle({ side, collapsed }: Props) {
  const dragging = useRef(false)
  const startScreenX = useRef(0)
  const startWidth = useRef(0)
  const pendingWidth = useRef(0)
  const raf = useRef(0)

  useEffect(() => {
    const tabs = window.sidebarApi?.tabs
    const flush = () => {
      raf.current = 0
      if (tabs?.setResizeGuide) tabs.setResizeGuide(pendingWidth.current)
      else tabs?.setPaneWidth(pendingWidth.current)
    }

    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const dx = e.screenX - startScreenX.current
      // Outer edge away from ribbon: right dock → left edge of pane widens left.
      const newWidth =
        side === 'right' ? startWidth.current - dx : startWidth.current + dx
      pendingWidth.current = newWidth
      if (!raf.current) raf.current = requestAnimationFrame(flush)
    }

    const endDrag = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (raf.current) cancelAnimationFrame(raf.current)
      raf.current = 0
      // A width change hides the guide itself once the edge has moved there.
      if (pendingWidth.current !== startWidth.current) tabs?.setPaneWidth(pendingWidth.current)
      else tabs?.setResizeGuide?.(null)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', endDrag)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', endDrag)
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [side])

  if (collapsed) return null

  const onDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startScreenX.current = e.screenX
    // The pane's width setting excludes the edge handle this sits in.
    startWidth.current = window.innerWidth - INNER_RESIZE_HANDLE_WIDTH
    pendingWidth.current = startWidth.current
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }

  const edgeStyle =
    side === 'right' ? ({ left: 0 } as const) : ({ right: 0 } as const)

  return (
    <div
      className="pane-outer-resize-handle"
      style={edgeStyle}
      onMouseDown={onDown}
      aria-hidden="true"
    />
  )
}
