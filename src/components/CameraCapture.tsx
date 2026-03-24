import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, X, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
}

export default function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [error, setError] = useState("");

  const startCamera = useCallback(async (facing: "user" | "environment") => {
    try {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }
      setError("");
    } catch {
      setError("Câmera não disponível");
    }
  }, [stream]);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror for front camera
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          setPhoto(canvas.toDataURL("image/jpeg", 0.7));
          setPhotoBlob(blob);
          stream?.getTracks().forEach((t) => t.stop());
        }
      },
      "image/jpeg",
      0.7
    );
  };

  const retake = () => {
    setPhoto(null);
    setPhotoBlob(null);
    startCamera(facingMode);
  };

  const confirm = () => {
    if (photoBlob) onCapture(photoBlob);
  };

  const switchCamera = () => {
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    startCamera(next);
  };

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
        <p className="text-white mb-4">{error}</p>
        <Button variant="outline" onClick={onCancel}>Voltar</Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <canvas ref={canvasRef} className="hidden" />

      {!photo ? (
        <>
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="max-h-full max-w-full object-contain"
              style={facingMode === "user" ? { transform: "scaleX(-1)" } : {}}
            />
          </div>

          {/* Oval guide overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-64 border-2 border-white/50 rounded-[50%]" />
          </div>

          <div className="p-4 flex items-center justify-center gap-6">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={onCancel}
            >
              <X className="w-6 h-6" />
            </Button>
            <button
              onClick={takePhoto}
              className="w-16 h-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 transition-colors"
            />
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={switchCamera}
            >
              <RotateCcw className="w-6 h-6" />
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <img src={photo} alt="Preview" className="max-h-full max-w-full object-contain" />
          </div>

          <div className="p-4 flex items-center justify-center gap-6">
            <Button
              variant="ghost"
              size="lg"
              className="text-white hover:bg-white/20"
              onClick={retake}
            >
              <RotateCcw className="w-5 h-5 mr-2" /> Tirar outra
            </Button>
            <Button
              size="lg"
              className="bg-success hover:bg-success/90 text-success-foreground"
              onClick={confirm}
            >
              <Check className="w-5 h-5 mr-2" /> Confirmar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
