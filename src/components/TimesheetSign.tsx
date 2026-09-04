import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, ArrowLeft, Calendar, Check, Loader2, Shield, Pencil } from "lucide-react";
import SignaturePad from "./SignaturePad";

interface PendingTimesheet {
  closing_id: string;
  month: number;
  year: number;
  closed_at: string;
  status: string;
  horas_trabalhadas: number;
  dias_trabalhados: number;
  faltas: number;
  horas_extras: number;
}

interface Props {
  cpf: string;
  employeeName: string;
  onClose: () => void;
  onSigned: () => void;
}

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const pageBg = "linear-gradient(160deg, hsl(220 30% 8%) 0%, hsl(215 40% 14%) 50%, hsl(210 35% 10%) 100%)";
const cardBg = "linear-gradient(180deg, hsl(210 30% 14%) 0%, hsl(215 25% 11%) 100%)";
const textMuted = "hsl(210 15% 55%)";
const textLight = "hsl(0 0% 92%)";

export default function TimesheetSign({ cpf, employeeName, onClose, onSigned }: Props) {
  const [pending, setPending] = useState<PendingTimesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PendingTimesheet | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [termoRead, setTermoRead] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const [motivoRecusa, setMotivoRecusa] = useState("");

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("get_pending_timesheets_by_cpf", { p_cpf: cpf });
      if (error) throw error;
      setPending(data || []);
    } catch {
      toast.error("Erro ao carregar espelhos pendentes");
    } finally {
      setLoading(false);
    }
  }, [cpf]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const resetSelection = () => {
    setSelected(null);
    setTermoRead(false);
  };

  const handleDrawn = async (blob: Blob) => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const fileName = `timesheet_${selected.closing_id}_${Date.now()}.png`;
      await supabase.storage.from("epi-signatures").upload(fileName, blob, { contentType: "image/png" });
      await (supabase as any).rpc("sign_timesheet_closing_by_cpf", {
        p_cpf: cpf,
        p_closing_id: selected.closing_id,
        p_status: "assinado",
        p_signature_url: fileName,
        p_signature_method: "desenho",
        p_accepted_device: navigator.userAgent,
      });
      toast.success("Espelho de ponto assinado com sucesso!");
      resetSelection();
      onSigned();
      fetchPending();
    } catch (err: any) {
      toast.error(err.message || "Erro ao assinar");
    } finally { setSubmitting(false); }
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
              style={{ background: "linear-gradient(135deg, hsl(210 70% 40%), hsl(200 80% 45%))" }}>
              <FileText className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-lg font-bold" style={{ color: "hsl(0 0% 95%)" }}>Assinar Espelho de Ponto</h2>
            <p className="text-xs mt-1" style={{ color: textMuted }}>{employeeName}</p>
          </div>

          <div className="rounded-2xl p-4 mb-4 border border-white/10" style={{ background: cardBg }}>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4" style={{ color: "hsl(210 70% 55%)" }} />
              <span className="font-semibold text-sm" style={{ color: textLight }}>
                {MONTH_NAMES[selected.month - 1]} / {selected.year}
              </span>
            </div>
            <p className="text-xs mb-3" style={{ color: textMuted }}>
              Fechado em: {new Date(selected.closed_at).toLocaleString("pt-BR")}
            </p>
            {/* Dados consolidados */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl p-3 text-center" style={{ background: "hsl(210 30% 10%)" }}>
                <p className="text-lg font-bold" style={{ color: "hsl(152 55% 55%)" }}>
                  {Math.floor(selected.horas_trabalhadas)}h{String(Math.round((selected.horas_trabalhadas % 1) * 60)).padStart(2,"0")}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: textMuted }}>Horas trabalhadas</p>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: "hsl(210 30% 10%)" }}>
                <p className="text-lg font-bold" style={{ color: "hsl(210 80% 65%)" }}>
                  {selected.dias_trabalhados}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: textMuted }}>Dias trabalhados</p>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: "hsl(210 30% 10%)" }}>
                <p className="text-lg font-bold" style={{ color: selected.faltas > 0 ? "hsl(0 72% 60%)" : "hsl(152 55% 55%)" }}>
                  {selected.faltas}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: textMuted }}>Faltas</p>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: "hsl(210 30% 10%)" }}>
                <p className="text-lg font-bold" style={{ color: selected.horas_extras > 0 ? "hsl(38 92% 60%)" : textMuted }}>
                  {Math.floor(selected.horas_extras)}h{String(Math.round((selected.horas_extras % 1) * 60)).padStart(2,"0")}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: textMuted }}>Horas extras</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-4 mb-4 border border-white/10" style={{ background: cardBg }}>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4" style={{ color: "hsl(210 90% 55%)" }} />
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "hsl(210 80% 60%)" }}>Declaração</p>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "hsl(210 15% 65%)" }}>
              Declaro que conferi o espelho de ponto referente a <strong style={{ color: textLight }}>{MONTH_NAMES[selected.month - 1]}/{selected.year}</strong> e que os registros estão corretos e de acordo com os dias e horários efetivamente trabalhados.
            </p>
          </div>

          {!termoRead ? (
            <div className="space-y-2 mb-3">
              <label className="flex items-start gap-2 cursor-pointer rounded-xl p-3 border border-white/10" style={{ background: "hsl(210 30% 13%)" }}>
                <input type="checkbox" checked={termoRead} onChange={e => { setTermoRead(e.target.checked); setRecusando(false); }} className="mt-0.5 accent-emerald-500" />
                <span className="text-xs" style={{ color: textMuted }}>Li e concordo com as informações do espelho de ponto acima.</span>
              </label>
              {!recusando ? (
                <button onClick={() => setRecusando(true)}
                  className="w-full py-2.5 rounded-xl text-xs font-medium border border-rose-500/30 transition-colors"
                  style={{ color: "hsl(0 72% 60%)", background: "hsl(0 72% 10%)" }}>
                  ✕ Recusar espelho
                </button>
              ) : (
                <div className="rounded-xl p-3 border border-rose-500/30 space-y-2" style={{ background: "hsl(0 30% 10%)" }}>
                  <p className="text-xs font-medium" style={{ color: "hsl(0 72% 65%)" }}>Motivo da recusa:</p>
                  <textarea value={motivoRecusa} onChange={e => setMotivoRecusa(e.target.value)}
                    placeholder="Descreva o motivo..."
                    className="w-full rounded-lg p-2 text-xs resize-none border border-white/10 outline-none"
                    style={{ background: "hsl(0 20% 8%)", color: textLight, minHeight: 70 }} />
                  <div className="flex gap-2">
                    <button onClick={async () => {
                      if (!motivoRecusa.trim()) { toast.error("Informe o motivo da recusa"); return; }
                      setSubmitting(true);
                      try {
                        await (supabase as any).rpc("sign_timesheet_closing_by_cpf", {
                          p_cpf: cpf,
                          p_closing_id: selected.closing_id,
                          p_status: "recusado",
                          p_recusa_motivo: motivoRecusa,
                        });
                        toast.success("Espelho recusado. O admin será notificado.");
                        resetSelection();
                        fetchPending();
                      } catch { toast.error("Erro ao recusar"); }
                      finally { setSubmitting(false); }
                    }}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold"
                      style={{ background: "hsl(0 72% 45%)", color: "white" }}>
                      Confirmar recusa
                    </button>
                    <button onClick={() => setRecusando(false)}
                      className="flex-1 py-2 rounded-lg text-xs font-medium border border-white/10"
                      style={{ color: textMuted }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
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
            style={{ background: "linear-gradient(135deg, hsl(210 70% 40%), hsl(200 80% 45%))" }}>
            <FileText className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-lg font-bold" style={{ color: "hsl(0 0% 95%)" }}>Espelho de Ponto</h2>
          <p className="text-xs mt-1" style={{ color: textMuted }}>{employeeName} • {pending.length} pendente(s)</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12" style={{ color: textMuted }}>
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
          </div>
        ) : pending.length === 0 ? (
          <div className="text-center py-12">
            <Check className="w-10 h-10 mx-auto mb-3" style={{ color: "hsl(152 55% 55%)" }} />
            <p className="text-sm font-medium" style={{ color: "hsl(0 0% 90%)" }}>Nenhum espelho pendente!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(t => (
              <button key={t.closing_id} onClick={() => { setSelected(t); setTermoRead(false); }}
                className="w-full rounded-xl p-4 border border-white/10 text-left transition-all hover:-translate-y-0.5"
                style={{ background: cardBg }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" style={{ color: "hsl(210 70% 55%)" }} />
                      <span className="font-semibold text-sm" style={{ color: textLight }}>
                        {MONTH_NAMES[t.month - 1]} / {t.year}
                      </span>
                    </div>
                    <div className="text-xs mt-1" style={{ color: textMuted }}>
                      Fechado em: {new Date(t.closed_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full font-medium"
                    style={{ background: "hsl(210 80% 20%)", color: "hsl(210 90% 65%)" }}>Pendente</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
