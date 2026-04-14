import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Camera } from "lucide-react";

interface PhotoModalProps {
  open: boolean;
  onClose: () => void;
  photoUrl: string | null;
  loading: boolean;
}

export function PhotoModal({ open, onClose, photoUrl, loading }: PhotoModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" /> Foto do registro
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center min-h-[200px]">
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Carregando foto...</span>
            </div>
          ) : photoUrl ? (
            <img
              src={photoUrl}
              alt="Foto do registro de ponto"
              className="max-w-full max-h-[60vh] rounded-lg object-contain"
            />
          ) : (
            <p className="text-sm text-muted-foreground">Foto não disponível</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
