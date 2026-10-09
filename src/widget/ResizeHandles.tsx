/**
 * Resizing for the floating and sidebar layouts.
 *
 * - `useResize`: tracks one mouse-driven resize gesture and applies min/max
 *   constraints. Dragging a left or top edge moves the window so the opposite
 *   edge stays put.
 * - `ResizeHandles`: the 8 handles (4 sides, 4 corners).
 *
 * Resizing is mouse-only; keyboard users can switch to the sidebar or
 * fullscreen layouts from the menu instead.
 */
import { useCallback, useEffect, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from 'react';

export interface ResizeConstraints {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

export interface Dimensions extends ResizeConstraints {
  width: number;
  height: number;
}

export interface Position {
  x: number;
  y: number;
}

export type ResizeDirection =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'top-right'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-left';

interface ResizeGesture {
  direction: ResizeDirection;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  startLeft: number;
  startTop: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** Pure geometry for one pointer position during a resize. Exported for tests. */
export function computeResize(
  gesture: ResizeGesture,
  pointer: { clientX: number; clientY: number },
  limits: ResizeConstraints,
): { width: number; height: number; x: number; y: number } {
  const { direction, startX, startY, startWidth, startHeight, startLeft, startTop } = gesture;
  let width = startWidth;
  let height = startHeight;
  let x = startLeft;
  let y = startTop;

  if (direction.includes('right')) {
    width = clamp(startWidth + (pointer.clientX - startX), limits.minWidth, limits.maxWidth);
  }
  if (direction.includes('bottom')) {
    height = clamp(startHeight + (pointer.clientY - startY), limits.minHeight, limits.maxHeight);
  }
  if (direction.includes('left')) {
    width = clamp(startWidth + (startX - pointer.clientX), limits.minWidth, limits.maxWidth);
    x = startLeft - (width - startWidth);
  }
  if (direction.includes('top')) {
    height = clamp(startHeight + (startY - pointer.clientY), limits.minHeight, limits.maxHeight);
    y = startTop - (height - startHeight);
  }
  return { width, height, x: Math.max(0, x), y: Math.max(0, y) };
}

export function useResize(
  dimensions: Dimensions,
  position: Position,
  setDimensions: Dispatch<SetStateAction<Dimensions>>,
  setPosition: Dispatch<SetStateAction<Position>>,
) {
  const [gesture, setGesture] = useState<ResizeGesture | null>(null);
  const { minWidth, minHeight, maxWidth, maxHeight } = dimensions;

  useEffect(() => {
    if (!gesture) return;
    const limits = { minWidth, minHeight, maxWidth, maxHeight };

    const handleMove = (e: MouseEvent) => {
      const next = computeResize(gesture, e, limits);
      setDimensions((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : { ...prev, width: next.width, height: next.height },
      );
      if (gesture.direction.includes('left') || gesture.direction.includes('top')) {
        setPosition((prev) => (prev.x === next.x && prev.y === next.y ? prev : { x: next.x, y: next.y }));
      }
    };
    const handleUp = () => setGesture(null);

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [gesture, minWidth, minHeight, maxWidth, maxHeight, setDimensions, setPosition]);

  /** Attach to a handle's onMouseDown. */
  const handleResizeMouseDown = useCallback(
    (e: ReactMouseEvent, direction: ResizeDirection) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      setGesture({
        direction,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: dimensions.width,
        startHeight: dimensions.height,
        startLeft: position.x,
        startTop: position.y,
      });
    },
    [dimensions.width, dimensions.height, position.x, position.y],
  );

  return { handleResizeMouseDown, isResizing: gesture !== null };
}

const DIRECTIONS: ResizeDirection[] = [
  'top',
  'right',
  'bottom',
  'left',
  'top-right',
  'bottom-right',
  'bottom-left',
  'top-left',
];

/** The 8 resize handles. Decorative for assistive technology (mouse-only). */
export function ResizeHandles({
  onResizeStart,
}: {
  onResizeStart: (e: ReactMouseEvent, direction: ResizeDirection) => void;
}) {
  return (
    <>
      {DIRECTIONS.map((direction) => (
        <div
          key={direction}
          className={`radchat-resize-handle radchat-resize-handle-${direction}`}
          aria-hidden="true"
          onMouseDown={(e) => onResizeStart(e, direction)}
        />
      ))}
    </>
  );
}
