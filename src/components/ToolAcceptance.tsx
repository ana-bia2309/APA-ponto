import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Wrench, Check, ArrowLeft, Package, Calendar, Shield, Pencil, Loader2 } from "lucide-react";
import SignaturePad from "./SignaturePad";

interface PendingTool {
  id: string;
  tool_name: string;
  loaned_at: string;
}

interface Props {
  cpf: string;
  employeeName: string;
  onClose: () => void;
  onAccepted: () => void;
}

const TERMO_TEXT = `Declaro que recebi a(s) ferramenta(s) acima descrita(s), em perfeitas condições de uso.

Comprometo-me a utilizar a ferramenta apenas para fins de trabalho, zelar pela sua conservação e comunicar imediatamente ao responsável qualquer dano, extravio ou necessidade de manutenção.

Declaro estar ciente de que a devolução da ferramenta será exigida ao término do uso ou em caso de desligamento.`;

const pageBg = "linear-gradient(160deg, hsl(220 30% 8%) 0%, hsl(215 40% 14%) 50%, hsl(210 35% 10%) 100%)";
const cardBg = "linear-gradient(180deg, hsl(210 30% 14%) 0%, hsl(215 25% 11%) 100%)";
const textMuted = "hsl(210 15% 55%)";
const textLight = "hsl(0 0% 92%)";

export default function ToolAcceptance({ cpf, employeeName, onClose, onAccepted }: Props) {
  const [pending, setPending] = useState<PendingTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PendingTool | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [termoRead, setTermoRead] = useState(false);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("get_pending_tools_by_cpf", { p_cpf: cpf });
      if (error) throw error;
      setPending(data || []);
    } catch {
      toast.error("Erro ao carregar ferramentas pendentes");
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
      const fileName = `tool_${selected.id}_${Date.now()}.png`;
      await supabase.storage.from("epi-signatures").upload(fileName, blob, { contentType: "image/png" });
      await (supabase as any).rpc("accept_tool_loan_by_cpf", {
        p_cpf: cpf,
        p_loan_id: selected.id,
        p_signature_url: fileName,
        p_signature_method: "desenho",
        p_accepted_device: navigator.userAgent,
      });
      toast.success("Ferramenta confirmada!");
      resetSelection();
      onAccepted();
      fetchPending();
    } catch (err: any) {
      toast.error(err.message || "Erro ao confirmar");
      setSubmitting(false);
    }
  };

  if (selected) {
    return (
      <div className="min-h-screen flex flex-col items-center px-4 py-6 overflow-auto" style={{ background: pageBg }}>
        <div className="w-full max-w-md">
          <button onClick={resetSelection} className="flex items-center gap-1 text-sm mb-4" style={{ color: "hsl(210 20% 60%)" }}>
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>

          <div className="text-center mb-5">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2"
              style={{ background: "linear-gradient(135deg, hsl(30 70% 40%), hsl(35 80% 45%))" }}>
              <Wrench className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-lg font-bold" style={{ color: "hsl(0 0% 95%)" }}>Aceite de Ferramenta</h2>
            <p className="text-xs mt-1" style={{ color: textMuted }}>{employeeName}</p>
          </div>

          <div className="rounded-2xl p-4 mb-4 border border-white/10" style={{ background: cardBg }}>
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4" style={{ color: "hsl(30 70% 55%)" }} />
              <span className="font-semibold text-sm" style={{ color: textLight }}>{selected.tool_name}</span>
            </div>
            <div className="flex items-center gap-2 text-xs mt-2" style={{ color: textMuted }}>
              <Calendar className="w-3.5 h-3.5" />
              Empréstimo: {new Date(selected.loaned_at + "T00:00:00").toLocaleDateString("pt-BR")}
            </div>
          </div>

          <div className="rounded-2xl p-4 mb-4 border border-white/10" style={{ background: cardBg }}>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4" style={{ color: "hsl(30 90% 55%)" }} />
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "hsl(30 80% 60%)" }}>Termo de Responsabilidade</p>
            </div>
            <div className="text-xs leading-relaxed whitespace-pre-line" style={{ color: "hsl(210 15% 65%)" }}>{TERMO_TEXT}</div>
          </div>

          {!termoRead ? (
            <label className="flex items-start gap-2 cursor-pointer rounded-xl p-3 border border-white/10 mb-3" style={{ background: "hsl(210 30% 13%)" }}>
              <input type="checkbox" checked={termoRead} onChange={e => setTermoRead(e.target.checked)} className="mt-0.5 accent-emerald-500" />
              <span className="text-xs" style={{ color: textMuted }}>Li e compreendi o Termo de Responsabilidade e confirmo o recebimento desta ferramenta.</span>
            </label>
          ) : (
            <div className="rounded-2xl p-4 border border-white/10 space-y-3" style={{ background: cardBg }}>
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4" style={{ color: "hsl(152 60% 55%)" }} />
                <p className="text-sm font-semibold" style={{ color: textLight }}>Assine abaixo para confirmar</p>
              </div>
              <p className="text-xs" style={{ color: textMuted }}>Desenhe sua assinatura no quadro:</p>
              {submitting ? (
                <div className="flex items-center justify-center gap-2 py-8" style={{ color: textMuted }}>
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
    <div className="min-h-screen flex flex-col items-center px-4 py-8" style={{ background: pageBg }}>
      <div className="w-full max-w-md">
        <button onClick={onClose} className="flex items-center gap-1 text-sm mb-6" style={{ color: "hsl(210 20% 60%)" }}>
          <ArrowLeft className="w-4 h-4" /> Voltar ao ponto
        </button>
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ background: "linear-gradient(135deg, hsl(30 90% 50%), hsl(35 85% 55%))" }}>
            <Wrench className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-lg font-bold" style={{ color: "hsl(0 0% 95%)" }}>Ferramentas Pendentes</h2>
          <p className="text-xs mt-1" style={{ color: textMuted }}>{employeeName} • {pending.length} pendência(s)</p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12" style={{ color: textMuted }}>
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
          </div>
        ) : pending.length === 0 ? (
          <div className="text-center py-12">
            <Check className="w-10 h-10 mx-auto mb-3" style={{ color: "hsl(152 55% 55%)" }} />
            <p className="text-sm font-medium" style={{ color: "hsl(0 0% 90%)" }}>Nenhuma ferramenta pendente!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(t => (
              <button key={t.id} onClick={() => { setSelected(t); setTermoRead(false); }}
                className="w-full rounded-xl p-4 border border-white/10 text-left transition-all hover:-translate-y-0.5"
                style={{ background: cardBg }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Wrench className="w-4 h-4" style={{ color: "hsl(30 90% 55%)" }} />
                      <span className="font-semibold text-sm" style={{ color: textLight }}>{t.tool_name}</span>
                    </div>
                    <div className="text-xs mt-1" style={{ color: textMuted }}>
                      Empréstimo: {new Date(t.loaned_at + "T00:00:00").toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full font-medium"
                    style={{ background: "hsl(30 80% 20%)", color: "hsl(30 90% 65%)" }}>Pendente</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
