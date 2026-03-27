import { useState } from "react";
import { X, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;

interface AbsenceJustificationProps {
  employee: Employee;
  cpf: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AbsenceJustification({ employee, onClose, onSuccess }: AbsenceJustificationProps) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error("Informe o motivo da justificativa");
      return;
    }
    setLoading(true);
    try {
      let fileUrl: string | null = null;

      if (file) {
        const fileName = `${employee.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("justifications")
          .upload(fileName, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("justifications").getPublicUrl(fileName);
        fileUrl = urlData.publicUrl;
      }

      const { error } = await supabase.from("absence_justifications").insert({
        employee_id: employee.id,
        date,
        reason: reason.trim(),
        file_url: fileUrl,
      });
      if (error) throw error;

      toast.success("Justificativa enviada!");
      onSuccess();
      onClose();
    } catch {
      toast.error("Erro ao enviar justificativa");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Justificativa de Falta</h2>
        <button onClick={onClose} className="text-foreground">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6 space-y-5">
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">Funcionário</label>
          <p className="text-sm text-muted-foreground">{employee.name}</p>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">Data</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">Motivo</label>
          <Textarea
            placeholder="Ex: Atestado médico, consulta, etc."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">Anexo (opcional)</label>
          <label className="flex items-center gap-3 p-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file ? (
              <>
                <FileText className="w-5 h-5 text-accent flex-shrink-0" />
                <span className="text-sm text-foreground truncate">{file.name}</span>
              </>
            ) : (
              <>
                <Upload className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Toque para anexar foto ou PDF</span>
              </>
            )}
          </label>
        </div>
      </div>

      <div className="p-4 border-t border-border">
        <Button onClick={handleSubmit} disabled={loading} className="w-full h-12 text-base font-semibold">
          {loading ? "Enviando..." : "Enviar Justificativa"}
        </Button>
      </div>
    </div>
  );
}
