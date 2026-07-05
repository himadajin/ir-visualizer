import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drag-to-resize state for a horizontally split pane. Call `onDragHandleMouseDown`
 * from the drag handle's onMouseDown; document-level mousemove/mouseup listeners
 * (needed since the pointer can leave the handle while dragging) are managed here.
 */
export function usePaneResize(initialWidth: number, minWidth: number) {
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
      const newWidth = Math.min(
        Math.max(e.clientX, minWidth),
        window.innerWidth - minWidth,
      );
      setWidth(newWidth);
    },
    [minWidth],
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
