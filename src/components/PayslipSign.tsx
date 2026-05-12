import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, FileText, ShieldCheck, KeyRound, MessageSquare, Pencil, Check, Loader2 } from "lucide-react";
import SignaturePad from "./SignaturePad";

interface PendingPayslip {
  payslip_id: string;
  year: number;
  month: number;
  liquido: number | string;
  employee_name: string;
  status: string;
}

interface Props {
  cpf: string;
  employeeName: string;
  onClose: () => void;
  onSigned: () => void;
}

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const fmt = (v: any) => "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

const detectDevice = () => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux";
  return "Desconhecido";
};

const fetchPublicIp = async (): Promise<string | null> => {
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const j = await r.json();
    return j.ip || null;
  } catch { return null; }
};

const cardBg = "linear-gradient(180deg, hsl(210 30% 14%) 0%, hsl(215 25% 11%) 100%)";
const pageBg = "linear-gradient(160deg, hsl(220 30% 8%) 0%, hsl(215 40% 14%) 50%, hsl(210 35% 10%) 100%)";
const textMuted = "hsl(210 15% 55%)";
const textLight = "hsl(0 0% 92%)";

export default function PayslipSign({ cpf, employeeName, onClose, onSigned }: Props) {
  const [pending, setPending] = useState<PendingPayslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PendingPayslip | null>(null);
  const [method, setMethod] = useState<"senha" | "otp" | "desenho" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_pending_payslips_by_cpf" as any, { p_cpf: cpf });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setPending((data as any) || []);
  }, [cpf]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const resetSelection = () => {
    setSelected(null); setMethod(null); setPassword(""); setOtp(""); setOtpSent(null);
  };

  const persistSign = async (payload: {
    method: "senha" | "otp" | "desenho";
    signature_url?: string;
    password?: string;
    otp?: string;
  }) => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const ip = await fetchPublicIp();
      const { error } = await supabase.rpc("sign_payslip_by_cpf" as any, {
        p_cpf: cpf,
        p_payslip_id: selected.payslip_id,
        p_method: payload.method,
        p_signature_url: payload.signature_url ?? null,
        p_password: payload.password ?? null,
        p_otp: payload.otp ?? null,
        p_ip: ip,
        p_user_agent: navigator.userAgent,
        p_device: detectDevice(),
      });
      if (error) throw error;
      toast.success("Holerite assinado com sucesso!");
      resetSelection();
      onSigned();
      fetchPending();
    } catch (err: any) {
      toast.error(err.message || "Erro ao assinar holerite");
    } finally { setSubmitting(false); }
  };

  const handleDrawn = async (blob: Blob) => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const fileName = `${selected.payslip_id}_${Date.now()}.png`;
      const { error: upErr } = await supabase.storage
        .from("payslip-signatures")
        .upload(fileName, blob, { contentType: "image/png" });
      if (upErr) throw upErr;
      await persistSign({ method: "desenho", signature_url: fileName });
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar assinatura");
      setSubmitting(false);
    }
  };

  const requestOtp = async () => {
    if (!selected) return;
    const { data, error } = await supabase.rpc("generate_payslip_otp" as any, {
      p_cpf: cpf, p_payslip_id: selected.payslip_id,
    });
    if (error) { toast.error(error.message); return; }
    setOtpSent(data as any);
    toast.success(`Código gerado: ${data}`, { duration: 8000 });
  };

  // ---------- Selected payslip flow ----------
  if (selected) {
    return (
      <div className="min-h-screen flex flex-col items-center px-4 py-6 overflow-auto" style={{ background: pageBg }}>
        <div className="w-full max-w-md">
          <button onClick={resetSelection}
            className="flex items-center gap-1 text-sm mb-4" style={{ color: "hsl(210 20% 60%)" }}>
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>

          <div className="text-center mb-5">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2"
              style={{ background: "linear-gradient(135deg, hsl(210 70% 40%), hsl(200 80% 45%))" }}>
              <FileText className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-lg font-bold" style={{ color: "hsl(0 0% 95%)" }}>Assinar Holerite</h2>
            <p className="text-xs mt-1" style={{ color: textMuted }}>{employeeName}</p>
          </div>

          <div className="rounded-2xl p-4 mb-4 border border-white/10" style={{ background: cardBg }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "hsl(210 40% 55%)" }}>
              Competência
            </p>
            <p className="text-base font-bold" style={{ color: textLight }}>
              {MONTHS[selected.month-1]} / {selected.year}
            </p>
            <p className="text-sm mt-1" style={{ color: "hsl(152 55% 60%)" }}>
              Líquido: <strong>{fmt(selected.liquido)}</strong>
            </p>
          </div>

          {!method ? (
            <div className="space-y-3">
              <p className="text-xs text-center mb-2" style={{ color: textMuted }}>
                Escolha o método de assinatura digital
              </p>

              <button onClick={() => setMethod("senha")}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-white/10 transition-all hover:-translate-y-0.5"
                style={{ background: cardBg }}>
                <KeyRound className="w-5 h-5" style={{ color: "hsl(210 70% 60%)" }} />
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold" style={{ color: textLight }}>Senha</p>
                  <p className="text-[11px]" style={{ color: textMuted }}>Confirme com seu CPF</p>
                </div>
              </button>

              <button onClick={() => setMethod("otp")}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-white/10 transition-all hover:-translate-y-0.5"
                style={{ background: cardBg }}>
                <MessageSquare className="w-5 h-5" style={{ color: "hsl(40 90% 60%)" }} />
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold" style={{ color: textLight }}>Código OTP</p>
                  <p className="text-[11px]" style={{ color: textMuted }}>Gerar código de 6 dígitos (5 min)</p>
                </div>
              </button>

              <button onClick={() => setMethod("desenho")}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-white/10 transition-all hover:-translate-y-0.5"
                style={{ background: cardBg }}>
                <Pencil className="w-5 h-5" style={{ color: "hsl(152 60% 55%)" }} />
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold" style={{ color: textLight }}>Assinatura desenhada</p>
                  <p className="text-[11px]" style={{ color: textMuted }}>Desenhe sua assinatura na tela</p>
                </div>
              </button>
            </div>
          ) : (
            <div className="rounded-2xl p-4 border border-white/10 space-y-3" style={{ background: cardBg }}>
              <button onClick={() => setMethod(null)} className="text-xs flex items-center gap-1" style={{ color: textMuted }}>
                <ArrowLeft className="w-3 h-3" /> Trocar método
              </button>

              {method === "senha" && (
                <>
                  <p className="text-xs" style={{ color: textMuted }}>
                    Digite o seu CPF (somente números) para confirmar.
                  </p>
                  <input
                    type="password"
                    inputMode="numeric"
                    placeholder="00000000000"
                    value={password}
                    onChange={(e) => setPassword(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    className="w-full h-12 rounded-xl px-3 text-base bg-black/30 border border-white/10"
                    style={{ color: textLight }}
                  />
                  <button
                    disabled={submitting || password.length !== 11}
                    onClick={() => persistSign({ method: "senha", password })}
                    className="w-full h-12 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40"
                    style={{ background: "linear-gradient(135deg, hsl(210 70% 45%), hsl(200 80% 50%))" }}>
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Confirmar assinatura</>}
                  </button>
                </>
              )}

              {method === "otp" && (
                <>
                  {!otpSent ? (
                    <>
                      <p className="text-xs" style={{ color: textMuted }}>
                        Gere um código OTP de 6 dígitos válido por 5 minutos.
                      </p>
                      <button onClick={requestOtp}
                        className="w-full h-12 rounded-xl font-semibold text-white"
                        style={{ background: "linear-gradient(135deg, hsl(40 85% 45%), hsl(35 80% 40%))" }}>
                        Gerar código OTP
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs" style={{ color: textMuted }}>
                        Código gerado. Digite-o abaixo para confirmar.
                      </p>
                      <input
                        inputMode="numeric"
                        placeholder="000000"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className="w-full h-12 rounded-xl px-3 text-center text-2xl tracking-[0.4em] bg-black/30 border border-white/10"
                        style={{ color: textLight }}
                      />
                      <button
                        disabled={submitting || otp.length !== 6}
                        onClick={() => persistSign({ method: "otp", otp })}
                        className="w-full h-12 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40"
                        style={{ background: "linear-gradient(135deg, hsl(40 85% 45%), hsl(35 80% 40%))" }}>
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Confirmar OTP</>}
                      </button>
                    </>
                  )}
                </>
              )}

              {method === "desenho" && (
                <>
                  <p className="text-xs" style={{ color: textMuted }}>Assine no quadro abaixo:</p>
                  {submitting ? (
                    <div className="flex items-center justify-center gap-2 py-8" style={{ color: textMuted }}>
                      <Loader2 className="w-5 h-5 animate-spin" /> Enviando...
                    </div>
                  ) : (
                    <SignaturePad onSign={handleDrawn} width={Math.min(320, window.innerWidth - 80)} height={180} />
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- Pending list ----------
  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8" style={{ background: pageBg }}>
      <div className="w-full max-w-md">
        <button onClick={onClose}
          className="flex items-center gap-1 text-sm mb-6" style={{ color: "hsl(210 20% 60%)" }}>
          <ArrowLeft className="w-4 h-4" /> Voltar ao ponto
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ background: "linear-gradient(135deg, hsl(210 70% 45%), hsl(200 85% 55%))" }}>
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-lg font-bold" style={{ color: "hsl(0 0% 95%)" }}>Holerites Pendentes</h2>
          <p className="text-xs mt-1" style={{ color: textMuted }}>
            {employeeName} • {pending.length} pendência(s)
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12" style={{ color: textMuted }}>
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
          </div>
        ) : pending.length === 0 ? (
          <div className="text-center py-12">
            <Check className="w-10 h-10 mx-auto mb-3" style={{ color: "hsl(152 55% 55%)" }} />
            <p className="text-sm font-medium" style={{ color: "hsl(0 0% 90%)" }}>Nenhum holerite pendente!</p>
            <p className="text-xs mt-1" style={{ color: textMuted }}>Todos os holerites foram assinados.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((p) => (
              <button key={p.payslip_id} onClick={() => setSelected(p)}
                className="w-full rounded-xl p-4 border border-white/10 text-left transition-all hover:-translate-y-0.5"
                style={{ background: cardBg, boxShadow: "0 4px 16px hsl(220 40% 5% / 0.4)" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" style={{ color: "hsl(210 70% 60%)" }} />
                      <span className="font-semibold text-sm" style={{ color: textLight }}>
                        {MONTHS[p.month-1]} / {p.year}
                      </span>
                    </div>
                    <div className="text-xs mt-1" style={{ color: textMuted }}>
                      Líquido: <span style={{ color: "hsl(152 55% 60%)" }}>{fmt(p.liquido)}</span>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full font-medium"
                    style={{ background: "hsl(210 60% 25%)", color: "hsl(210 80% 75%)" }}>
                    Assinar
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
