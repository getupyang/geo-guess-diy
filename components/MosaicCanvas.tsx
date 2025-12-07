import React, { useRef, useEffect, useState, useCallback } from 'react';

interface MosaicCanvasProps {
  imageSrc: string;
  onImageUpdate: (base64: string) => void;
  isEditing: boolean;
}

const MosaicCanvas: React.FC<MosaicCanvasProps> = ({ imageSrc, onImageUpdate, isEditing }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgObj, setImgObj] = useState<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      setImgObj(img);
      const canvas = canvasRef.current;
      if (canvas) {
        // Calculate aspect ratio to fit screen width but maintain ratio
        const maxWidth = Math.min(window.innerWidth, 800);
        const scale = maxWidth / img.width;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
      }
    };
  }, [imageSrc]);

  const applyMosaic = (x: number, y: number, size: number = 20) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Simple pixelation effect
    const sampleSize = 10;
    const startX = Math.floor((x - size / 2) / sampleSize) * sampleSize;
    const startY = Math.floor((y - size / 2) / sampleSize) * sampleSize;
    
    // We are just drawing a blurred/filled rect for simplicity in this demo
    // Real mosaic involves reading pixel data, averaging, and redrawing
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; // Censorship style
    // Alternatively, just blur
    ctx.filter = 'blur(4px)';
    ctx.drawImage(
      canvas,
      x - size, y - size, size * 2, size * 2,
      x - size, y - size, size * 2, size * 2
    );
    ctx.filter = 'none';
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isEditing || !isDrawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const y = e.touches[0].clientY - rect.top;
    applyMosaic(x, y, 30);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isEditing || !isDrawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    applyMosaic(x, y, 30);
  };

  const saveCanvas = useCallback(() => {
    if (canvasRef.current) {
      onImageUpdate(canvasRef.current.toDataURL('image/jpeg', 0.8));
    }
  }, [onImageUpdate]);

  return (
    <div className="relative w-full flex justify-center bg-black overflow-hidden touch-none">
      <canvas
        ref={canvasRef}
        className={`${isEditing ? 'cursor-crosshair' : 'cursor-default'} max-w-full`}
        onTouchStart={() => setIsDrawing(true)}
        onTouchEnd={() => { setIsDrawing(false); saveCanvas(); }}
        onTouchMove={handleTouchMove}
        onMouseDown={() => setIsDrawing(true)}
        onMouseUp={() => { setIsDrawing(false); saveCanvas(); }}
        onMouseMove={handleMouseMove}
      />
      {isEditing && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-xs pointer-events-none">
          涂抹以打码
        </div>
      )}
    </div>
  );
};

export default MosaicCanvas;
