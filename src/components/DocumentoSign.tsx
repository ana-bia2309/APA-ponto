import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileSignature, Check, ArrowLeft, Calendar, Shield, Pencil, Loader2 } from "lucide-react";
import SignaturePad from "./SignaturePad";

interface PendingDocumento {
  destinatario_id: string;
  documento_id: string;
  titulo: string;
  conteudo: string;
  created_at: string;
}

interface DocumentoSignProps {
  cpf: string;
  employeeName: string;
  onClose: () => void;
  onSigned: () => void;
}

const cardBg = "white";
const cardShadow = "0 2px 12px rgba(0,0,0,0.06)";
const textMuted = "#64748b";
const textLight = "#1e293b";
const pageBg = "#F0F4F8";

export default function DocumentoSign({ cpf, employeeName, onClose, onSigned }: DocumentoSignProps) {
  const [pending, setPending] = useState<PendingDocumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PendingDocumento | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [termoRead, setTermoRead] = useState(false);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("get_pending_documentos_by_cpf", { p_cpf: cpf });
      if (error) throw error;
      setPending((data as any) || []);
    } catch {
      toast.error("Erro ao carregar documentos pendentes");
    } finally {
      setLoading(false);
    }
  }, [cpf]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const resetSelection = () => {
    setSelected(null); setTermoRead(false);
  };

  const handleDrawn = async (blob: Blob) => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const fileName = `${selected.destinatario_id}_${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage.from("documento-signatures").upload(fileName, blob, { contentType: "image/png" });
      if (uploadError) throw uploadError;
      const { error } = await (supabase as any).rpc("accept_documento", {
        p_cpf: cpf,
        p_destinatario_id: selected.destinatario_id,
        p_signature_url: fileName,
        p_signature_method: "desenho",
        p_accepted_device: navigator.userAgent,
      });
      if (error) throw error;
      toast.success("Documento assinado com sucesso!");
      resetSelection();
      onSigned();
      fetchPending();
    } catch (err: any) {
      toast.error("Erro ao registrar assinatura: " + (err.message || ""));
    } finally { setSubmitting(false); }
  };

  if (selected) {
    return (
      <div className="min-h-screen flex flex-col items-center px-4 py-6 relative overflow-auto" style={{ background: pageBg }}>
        <div className="w-full max-w-md">
          <button onClick={resetSelection} className="flex items-center gap-1 text-sm mb-4 text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>

          <div className="text-center mb-5">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2"
              style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
              <FileSignature className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-lg font-bold text-gray-800">Assinatura de Documento</h2>
            <p className="text-xs mt-1 text-gray-400">{employeeName}</p>
          </div>

          <div className="rounded-2xl p-4 mb-4" style={{ background: cardBg, boxShadow: cardShadow }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 text-blue-600">{selected.titulo}</p>
            <div className="flex items-center gap-2 text-xs mb-3 text-gray-400">
              <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
              Publicado em {new Date(selected.created_at).toLocaleDateString("pt-BR")}
            </div>
            <div className="text-xs leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto text-gray-600">
              {selected.conteudo}
            </div>
          </div>

          {!termoRead ? (
            <label className="flex items-start gap-2 cursor-pointer rounded-xl p-3 mb-3 bg-white" style={{ boxShadow: cardShadow }}>
              <input type="checkbox" checked={termoRead} onChange={e => setTermoRead(e.target.checked)} className="mt-0.5 accent-emerald-500" />
              <span className="text-xs text-gray-500">Li e estou de acordo com o conteúdo deste documento.</span>
            </label>
          ) : (
            <div className="rounded-2xl p-4 space-y-3" style={{ background: cardBg, boxShadow: cardShadow }}>
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-emerald-500" />
                <p className="text-sm font-semibold text-gray-800">Assine abaixo para confirmar</p>
              </div>
              <p className="text-xs text-gray-400">Desenhe sua assinatura no quadro:</p>
              {submitting ? (
                <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" /> Enviando...
                </div>
              ) : (
                <SignaturePad onSign={handleDrawn} width={Math.min(320, window.innerWidth - 80)} height={180} />
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 relative overflow-hidden" style={{ background: pageBg }}>
      <div className="w-full max-w-md">
        <button onClick={onClose} className="flex items-center gap-1 text-sm mb-6 text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-4 h-4" /> Voltar ao ponto
        </button>
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
            <FileSignature className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-lg font-bold text-gray-800">Documentos Pendentes</h2>
          <p className="text-xs mt-1 text-gray-400">{employeeName} • {pending.length} pendência(s)</p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
          </div>
        ) : pending.length === 0 ? (
          <div className="text-center py-12">
            <Check className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
            <p className="text-sm font-medium text-gray-700">Nenhum documento pendente!</p>
            <p className="text-xs mt-1 text-gray-400">Todos os documentos foram assinados.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(doc => (
              <button key={doc.destinatario_id} onClick={() => { setSelected(doc); setTermoRead(false); }}
                className="w-full rounded-xl p-4 text-left transition-all hover:-translate-y-0.5 bg-white"
                style={{ boxShadow: cardShadow }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold text-sm text-gray-800">{doc.titulo}</span>
                    </div>
                    <div className="text-xs mt-1 text-gray-400">
                      {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full font-medium" style={{ background: "#fef3c7", color: "#b45309" }}>
                    Pendente
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}