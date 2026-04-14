import { useRef, useState, useEffect, useCallback } from "react";

interface SignaturePadProps {
  onSign: (blob: Blob) => void;
  width?: number;
  height?: number;
}

export default function SignaturePad({ onSign, width = 320, height = 180 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Set canvas resolution
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a2e";
    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    // Guide line
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, height - 40);
    ctx.lineTo(width - 20, height - 40);
    ctx.stroke();
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2.5;
  }, [width, height]);

  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
    setHasDrawn(true);
  }, [getPos]);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, [isDrawing, getPos]);

  const endDraw = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, height - 40);
    ctx.lineTo(width - 20, height - 40);
    ctx.stroke();
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2.5;
    setHasDrawn(false);
  }, [width, height]);

  const confirm = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    canvas.toBlob((blob) => {
      if (blob) onSign(blob);
    }, "image/png");
  }, [hasDrawn, onSign]);

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-xs font-medium" style={{ color: "hsl(210 15% 55%)" }}>
        Assine abaixo com o dedo ou mouse
      </p>
      <canvas
        ref={canvasRef}
        style={{ width, height, touchAction: "none", borderRadius: 12, border: "2px solid hsl(210 30% 25%)" }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <div className="flex gap-3">
        <button
          onClick={clear}
          className="px-4 py-2 rounded-lg text-xs font-medium border border-white/10 transition-colors"
          style={{ background: "hsl(210 30% 14%)", color: "hsl(0 0% 80%)" }}
        >
          Limpar
        </button>
        <button
          onClick={confirm}
          disabled={!hasDrawn}
          className="px-6 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, hsl(152 55% 42%), hsl(160 60% 50%))", color: "white" }}
        >
          Confirmar Assinatura
        </button>
      </div>
    </div>
  );
}
