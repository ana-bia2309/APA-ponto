import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Plus, Trash2, Palmtree, RefreshCw } from "lucide-react";

interface Props {
  employeeId: string;
  employeeName: string;
  onClose: () => void;
}

interface RegistroFerias {
  id: string;
  tipo: "descanso" | "abono";
  data_inicio: string | null;
  data_fim: string | null;
  dias: number;
  motivo: string | null;
  created_at: string;
}

interface SaldoFerias {
  periodo_inicio: string;
  periodo_fim: string;
  dias_direito: number;
  dias_descanso_usados: number;
  dias_abono_usados: number;
  dias_disponiveis: number;
  vencido: boolean;
  dias_para_vencer: number;
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
}

export default function FeriasModal({ employeeId, employeeName, onClose }: Props) {
  const [saldo, setSaldo] = useState<SaldoFerias | null>(null);
  const [registros, setRegistros] = useState<RegistroFerias[]>([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [tipo, setTipo] = useState<"descanso" | "abono">("descanso");
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10));
  const [dias, setDias] = useState(14);
  const [motivo, setMotivo] = useState("");

  const dataFim = (() => {
    if (tipo !== "descanso" || !dataInicio || !dias) return "";
    const d = new Date(dataInicio + "T12:00:00");
    d.setDate(d.getDate() + dias - 1);
    return d.toISOString().slice(0, 10);
  })();

  const load = async () => {
    setLoading(true);
    try {
      const [saldoRes, regRes] = await Promise.all([
        (supabase as any).rpc("get_saldo_ferias", { p_employee_id: employeeId }),
        (supabase as any).from("ferias")
          .select("*")
          .eq("employee_id", employeeId)
          .order("created_at", { ascending: false }),
      ]);
      if (saldoRes.data && saldoRes.data.length > 0) setSaldo(saldoRes.data[0]);
      if (regRes.data) setRegistros(regRes.data);
    } catch (err: any) {
      toast.error("Erro ao carregar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [employeeId]);

  const adicionar = async () => {
    if (!saldo) return;
    if (dias <= 0 || dias > saldo.dias_disponiveis) {
      toast.error(`Saldo insuficiente. Disponível: ${saldo.dias_disponiveis} dia(s)`);
      return;
    }
    if (tipo === "abono" && saldo.dias_abono_usados + dias > 10) {
      toast.error("Abono pecuniário não pode exceder 10 dias (1/3 das férias) por período.");
      return;
    }
    setSalvando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("ferias").insert({
      employee_id: employeeId,
      periodo_aquisitivo_inicio: saldo.periodo_inicio,
      periodo_aquisitivo_fim: saldo.periodo_fim,
      tipo,
      data_inicio: tipo === "descanso" ? dataInicio : null,
      data_fim: tipo === "descanso" ? dataFim : null,
      dias,
      motivo: motivo.trim() || null,
      criado_por: user?.email || null,
    });
    if (error) { toast.error("Erro ao salvar: " + error.message); }
    else {
      toast.success(tipo === "descanso" ? "Férias registradas!" : "Abono registrado!");
      setMotivo(""); setDias(14);
      load();
    }
    setSalvando(false);
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir este registro? O saldo será devolvido.")) return;
    const { error } = await (supabase as any).from("ferias").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Removido"); load(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl bg-background rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Palmtree className="w-4 h-4 text-primary" />
              Gestão de Férias
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{employeeName}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !saldo ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              Não foi possível calcular o saldo. Verifique se o funcionário tem data de admissão cadastrada.
            </div>
          ) : (
            <>
              {/* Painel de saldo */}
              <div className={`rounded-2xl border-2 p-4 ${saldo.vencido ? "border-rose-400/50 bg-rose-50 dark:bg-rose-950/20" : "border-emerald-400/50 bg-emerald-50 dark:bg-emerald-950/20"}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Período aquisitivo atual
                  </p>
                  {saldo.vencido && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white">
                      ⚠️ VENCIDO
                    </span>
                  )}
                  {!saldo.vencido && saldo.dias_para_vencer <= 30 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">
                      Vence em {saldo.dias_para_vencer}d
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {fmtDate(saldo.periodo_inicio)} → {fmtDate(saldo.periodo_fim)}
                </p>

                <div className="flex items-end justify-between mb-3">
                  <div>
                    <p className={`text-4xl font-black ${saldo.vencido ? "text-rose-600" : "text-emerald-600"}`}>
                      {saldo.dias_disponiveis}
                    </p>
                    <p className="text-xs text-muted-foreground">dia(s) disponível(is) de {saldo.dias_direito}</p>
                  </div>
                </div>

                <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                  <div className="h-full flex">
                    <div className="bg-blue-500 h-full" style={{ width: `${(saldo.dias_descanso_usados / 30) * 100}%` }} />
                    <div className="bg-amber-500 h-full" style={{ width: `${(saldo.dias_abono_usados / 30) * 100}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="text-center">
                    <p className="text-sm font-bold text-blue-600">{saldo.dias_descanso_usados}d</p>
                    <p className="text-[10px] text-muted-foreground">Descanso usado</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-amber-600">{saldo.dias_abono_usados}d</p>
                    <p className="text-[10px] text-muted-foreground">Abono vendido</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-muted-foreground">{10 - saldo.dias_abono_usados}d</p>
                    <p className="text-[10px] text-muted-foreground">Limite abono restante</p>
                  </div>
                </div>
              </div>

              {/* Formulário */}
              <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/20">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Registrar uso do saldo
                </p>

                <div className="flex gap-2">
                  <button onClick={() => setTipo("descanso")}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      tipo === "descanso" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                    🏖️ Período de Descanso
                  </button>
                  <button onClick={() => setTipo("abono")}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      tipo === "abono" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                    💰 Vender (Abono)
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {tipo === "descanso" && (
                    <div>
                      <Label className="text-xs">Data início</Label>
                      <Input type="date" className="mt-1" value={dataInicio}
                        onChange={e => setDataInicio(e.target.value)} />
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">Quantidade de dias</Label>
                    <Input type="number" min={tipo === "descanso" ? 5 : 1} max={tipo === "abono" ? 10 : 30}
                      className="mt-1" value={dias}
                      onChange={e => setDias(Number(e.target.value))} />
                  </div>
                </div>

                {tipo === "descanso" && dataFim && (
                  <p className="text-xs text-muted-foreground">
                    📅 Período: {fmtDate(dataInicio)} → {fmtDate(dataFim)}
                    {dias < 14 && <span className="text-amber-600 ml-2">⚠️ CLT exige ao menos um período de 14 dias por ano</span>}
                  </p>
                )}
                {tipo === "abono" && (
                  <p className="text-xs text-amber-600">
                    💡 Abono pecuniário (venda de férias) é limitado a 1/3 do período = 10 dias por ano.
                  </p>
                )}

                <div>
                  <Label className="text-xs">Observação (opcional)</Label>
                  <Input className="mt-1" placeholder="Combinado com o gestor em..."
                    value={motivo} onChange={e => setMotivo(e.target.value)} />
                </div>

                <Button onClick={adicionar} disabled={salvando} size="sm" className="gap-2 w-full">
                  <Plus className="w-4 h-4" />
                  {salvando ? "Salvando..." : `Registrar ${dias} dia(s)`}
                </Button>
              </div>

              {/* Histórico */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Histórico ({registros.length})
                </p>
                {registros.length === 0 ? (
                  <p className="text-center py-6 text-sm text-muted-foreground">Nenhum registro ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {registros.map(r => (
                      <div key={r.id}
                        className="flex items-start justify-between p-3 rounded-xl border border-border bg-background">
                        <div className="flex items-start gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-base ${
                            r.tipo === "descanso" ? "bg-blue-500/10" : "bg-amber-500/10"
                          }`}>
                            {r.tipo === "descanso" ? "🏖️" : "💰"}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {r.tipo === "descanso" ? "Período de Descanso" : "Abono Pecuniário"} — {r.dias}d
                            </p>
                            {r.data_inicio && r.data_fim && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {fmtDate(r.data_inicio)} → {fmtDate(r.data_fim)}
                              </p>
                            )}
                            {r.motivo && (
                              <p className="text-xs text-muted-foreground mt-0.5 italic">{r.motivo}</p>
                            )}
                          </div>
                        </div>
                        <button onClick={() => excluir(r.id)}
                          className="text-destructive hover:text-destructive/80 p-1 rounded transition-colors flex-shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}