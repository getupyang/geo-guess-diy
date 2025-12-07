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
        // Ensure we don't upscale small images too much, but always fit container
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

  const applyMosaic = (x: number, y: number, brushSize: number = 20) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Pixelation Effect Logic
    // We process a square area defined by brushSize
    const startX = x - brushSize / 2;
    const startY = y - brushSize / 2;
    
    // Get the pixel data for the area under the brush
    // Note: We might go out of bounds, but getImageData handles clipping reasonably well in modern browsers,
    // or returns zeros.
    try {
        const imgData = ctx.getImageData(startX, startY, brushSize, brushSize);
        const data = imgData.data;
        
        // Calculate average color
        let r = 0, g = 0, b = 0;
        let count = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            // Ignore transparent pixels if any (though usually base image is opaque)
            if (data[i + 3] > 0) {
                r += data[i];
                g += data[i + 1];
                b += data[i + 2];
                count++;
            }
        }
        
        if (count > 0) {
            r = Math.floor(r / count);
            g = Math.floor(g / count);
            b = Math.floor(b / count);
            
            // Draw a single solid block representing the average color (Mosaic tile)
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(startX, startY, brushSize, brushSize);
        }
    } catch (e) {
        // Handle cross-origin issues or bounds errors
        console.warn("Mosaic error", e);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isEditing) return;
    setIsDrawing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    
    // Draw initial dot
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    applyMosaic(x, y, 25);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isEditing || !isDrawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    applyMosaic(x, y, 25);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (canvasRef.current) {
        onImageUpdate(canvasRef.current.toDataURL('image/jpeg', 0.85));
    }
  };

  return (
    <div className="relative w-full flex justify-center bg-black overflow-hidden touch-none">
      <canvas
        ref={canvasRef}
        className={`${isEditing ? 'cursor-crosshair' : 'cursor-default'} max-w-full`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      {isEditing && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur text-white px-4 py-1.5 rounded-full text-xs font-medium pointer-events-none shadow-lg border border-white/10">
          涂抹画面打码
        </div>
      )}
    </div>
  );
};

export default MosaicCanvas;