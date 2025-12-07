import React, { useState, useRef, useEffect } from 'react';

interface ImageViewerProps {
  src: string;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ src }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const lastPos = useRef({ x: 0, y: 0 }); // Last committed position
  const initialDist = useRef(0);

  // Reset when source changes
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    lastPos.current = { x: 0, y: 0 };
  }, [src]);

  // --- Touch Handlers (Mobile) ---

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      // Drag start
      setIsDragging(true);
      startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      // Pinch start
      setIsDragging(false);
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialDist.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging && scale > 1) {
      // Dragging (only if zoomed in)
      const dx = e.touches[0].clientX - startPos.current.x;
      const dy = e.touches[0].clientY - startPos.current.y;
      
      setPosition({
        x: lastPos.current.x + dx,
        y: lastPos.current.y + dy
      });
      e.preventDefault(); // Prevent scrolling
    } else if (e.touches.length === 2) {
      // Pinching
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (initialDist.current > 0) {
        const delta = dist / initialDist.current;
        // Limit zoom
        const newScale = Math.min(Math.max(1, scale * delta), 4);
        setScale(newScale);
      }
      e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    lastPos.current = position;
    // Reset if zoomed out completely
    if (scale <= 1) {
        setPosition({ x: 0, y: 0 });
        lastPos.current = { x: 0, y: 0 };
    }
  };

  // --- Mouse Handlers (Desktop) ---

  const handleMouseDown = (e: React.MouseEvent) => {
      if (scale > 1) {
          setIsDragging(true);
          startPos.current = { x: e.clientX, y: e.clientY };
          e.preventDefault();
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (isDragging && scale > 1) {
          const dx = e.clientX - startPos.current.x;
          const dy = e.clientY - startPos.current.y;
          setPosition({
              x: lastPos.current.x + dx,
              y: lastPos.current.y + dy
          });
      }
  };

  const handleMouseUp = () => {
      if (isDragging) {
          setIsDragging(false);
          lastPos.current = position;
      }
  };

  const handleWheel = (e: React.WheelEvent) => {
      // Ctrl+Wheel or just Wheel to zoom
      // Simple logic: zoom in/out
      const delta = -e.deltaY * 0.005;
      const newScale = Math.min(Math.max(1, scale + delta), 4);
      setScale(newScale);
      if (newScale === 1) {
          setPosition({ x: 0, y: 0 });
          lastPos.current = { x: 0, y: 0 };
      }
  };

  const handleDoubleClick = () => {
      if (scale > 1) {
          setScale(1);
          setPosition({ x: 0, y: 0 });
          lastPos.current = { x: 0, y: 0 };
      } else {
          setScale(2.5);
      }
  };

  return (
    <div 
        ref={containerRef}
        className="w-full h-full overflow-hidden bg-black flex items-center justify-center touch-none relative z-0"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
    >
      <img 
        src={src} 
        alt="Game Target" 
        className="max-w-full max-h-full object-contain transition-transform duration-75 ease-linear will-change-transform"
        style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
        }}
        draggable={false}
      />
      {/* Hint overlay only when not zoomed */}
      {scale === 1 && (
        <div className="absolute bottom-24 text-white/30 text-xs pointer-events-none select-none">
            双击或双指放大查看细节
        </div>
      )}
    </div>
  );
};

export default ImageViewer;