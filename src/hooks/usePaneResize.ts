import { useCallback, useEffect, useRef, useState } from "react";

export interface PaneResizeOptions {
  /**
   * Distance (px) between the viewport's left edge and the pane's left edge.
   * The dragged width is derived from `e.clientX`, so a pane that does not
   * start at x = 0 (e.g. the floating editor panel, inset by its margin) must
   * declare its offset. Defaults to 0.
   */
  leftOffset?: number;
  /**
   * Upper bound for the width, in px, or a function of the current viewport
   * width (e.g. `(w) => w * 0.6` for a 60 vw cap). Defaults to leaving
   * `minWidth` of space to the right of the pane.
   */
  maxWidth?: number | ((viewportWidth: number) => number);
}

/**
 * Drag-to-resize state for a pane anchored to the left of the viewport. Call
 * `onDragHandleMouseDown` from the drag handle's onMouseDown; document-level
 * mousemove/mouseup listeners (needed since the pointer can leave the handle
 * while dragging) are managed here. The resulting width is always clamped to
 * `minWidth` and to the bound derived from `options.maxWidth`.
 */
export function usePaneResize(
  initialWidth: number,
  minWidth: number,
  options: PaneResizeOptions = {},
) {
  const { leftOffset = 0, maxWidth } = options;
  const [width, setWidth] = useState(initialWidth);
  const isDragging = useRef(false);

  const onDragHandleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current) return;
      const viewportWidth = window.innerWidth;
      const upperBound = Math.min(
        typeof maxWidth === "function"
          ? maxWidth(viewportWidth)
          : (maxWidth ?? Infinity),
        viewportWidth - leftOffset - minWidth,
      );
      const draggedWidth = e.clientX - leftOffset;
      setWidth(Math.max(Math.min(draggedWidth, upperBound), minWidth));
    },
    [leftOffset, maxWidth, minWidth],
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return { width, onDragHandleMouseDown };
}
