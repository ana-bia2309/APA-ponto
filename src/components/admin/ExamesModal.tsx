import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Plus, Trash2, Stethoscope, RefreshCw } from "lucide-react";

interface Props {
  employeeId: string;
  employeeName: string;
  onClose: () => void;
}

interface RegistroExame {
  id: string;
  tipo: string;
  data_realizacao: string;
  periodicidade_meses: number;
  data_validade: string;
  medico: string | null;
  resultado: string | null;
  observacoes: string | null;
}

interface StatusAso {
  ultimo_exame_data: string | null;
  data_validade: string | null;
  dias_para_vencer: number | null;
  vencido: boolean;
  nunca_fez: boolean;
}

const TIPO_OPTIONS = [
  { value: "admissional", label: "Admissional" },
  { value: "periodico", label: "Periódico" },
  { value: "retorno_trabalho", label: "Retorno ao Trabalho" },
  { value: "mudanca_funcao", label: "Mudança de Função" },
  { value: "demissional", label: "Demissional" },
];

const RESULTADO_OPTIONS = [
  { value: "apto", label: "Apto", color: "#16a34a" },
  { value: "apto_com_restricoes", label: "Apto com Restrições", color: "#d97706" },
  { value: "inapto", label: "Inapto", color: "#dc2626" },
];

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
}

export default function ExamesModal({ employeeId, employeeName, onClose }: Props) {
  const [status, setStatus] = useState<StatusAso | null>(null);
  const [registros, setRegistros] = useState<RegistroExame[]>([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [tipo, setTipo] = useState("periodico");
  const [dataRealizacao, setDataRealizacao] = useState(new Date().toISOString().slice(0, 10));
  const [periodicidade, setPeriodicidade] = useState(12);
  const [medico, setMedico] = useState("");
  const [resultado, setResultado] = useState("apto");
  const [observacoes, setObservacoes] = useState("");

  const dataValidade = (() => {
    const d = new Date(dataRealizacao + "T12:00:00");
    d.setMonth(d.getMonth() + periodicidade);
    return d.toISOString().slice(0, 10);
  })();

  const load = async () => {
    setLoading(true);
    try {
      const [statusRes, regRes] = await Promise.all([
        (supabase as any).rpc("get_status_aso", { p_employee_id: employeeId }),
        (supabase as any).from("exames_periodicos")
          .select("*")
          .eq("employee_id", employeeId)
          .order("data_realizacao", { ascending: false }),
      ]);
      if (statusRes.data && statusRes.data.length > 0) setStatus(statusRes.data[0]);
      if (regRes.data) setRegistros(regRes.data);
    } catch (err: any) {
      toast.error("Erro ao carregar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [employeeId]);

  const adicionar = async () => {
    setSalvando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("exames_periodicos").insert({
      employee_id: employeeId,
      tipo,
      data_realizacao: dataRealizacao,
      periodicidade_meses: periodicidade,
      data_validade: dataValidade,
      medico: medico.trim() || null,
      resultado,
      observacoes: observacoes.trim() || null,
      criado_por: user?.email || null,
    });
    if (error) { toast.error("Erro ao salvar: " + error.message); }
    else {
      toast.success("Exame registrado!");
      setMedico(""); setObservacoes("");
      load();
    }
    setSalvando(false);
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir este registro de exame?")) return;
    const { error } = await (supabase as any).from("exames_periodicos").delete().eq("id", id);
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
              <Stethoscope className="w-4 h-4 text-primary" />
              Exames Periódicos (ASO)
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
          ) : (
            <>
              {/* Painel de status */}
              {status && !status.nunca_fez ? (
                <div className={`rounded-2xl border-2 p-4 ${
                  status.vencido ? "border-rose-400/50 bg-rose-50 dark:bg-rose-950/20"
                  : (status.dias_para_vencer ?? 999) <= 30 ? "border-amber-400/50 bg-amber-50 dark:bg-amber-950/20"
                  : "border-emerald-400/50 bg-emerald-50 dark:bg-emerald-950/20"
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Status do ASO
                    </p>
                    {status.vencido && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white">
                        ⚠️ VENCIDO
                      </span>
                    )}
                    {!status.vencido && (status.dias_para_vencer ?? 999) <= 30 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">
                        Vence em {status.dias_para_vencer}d
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Último exame: {fmtDate(status.ultimo_exame_data!)} → Validade: {fmtDate(status.data_validade!)}
                  </p>
                  <p className={`text-3xl font-black ${
                    status.vencido ? "text-rose-600" : (status.dias_para_vencer ?? 999) <= 30 ? "text-amber-600" : "text-emerald-600"
                  }`}>
                    {status.vencido ? "Vencido" : `${status.dias_para_vencer}d`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {status.vencido ? "para validade" : "até o vencimento"}
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border-2 border-rose-400/50 bg-rose-50 dark:bg-rose-950/20 p-4">
                  <p className="text-sm font-bold text-rose-600">⚠️ Nenhum exame registrado</p>
                  <p className="text-xs text-muted-foreground mt-1">Cadastre o exame admissional para iniciar o controle.</p>
                </div>
              )}

              {/* Formulário */}
              <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/20">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Registrar novo exame
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <select value={tipo} onChange={e => setTipo(e.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      {TIPO_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Resultado</Label>
                    <select value={resultado} onChange={e => setResultado(e.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      {RESULTADO_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Data de Realização</Label>
                    <Input type="date" className="mt-1" value={dataRealizacao}
                      onChange={e => setDataRealizacao(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Periodicidade (meses)</Label>
                    <Input type="number" min={1} max={60} className="mt-1" value={periodicidade}
                      onChange={e => setPeriodicidade(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label className="text-xs">Médico/Clínica (opcional)</Label>
                    <Input className="mt-1" value={medico} onChange={e => setMedico(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Próxima validade (calculada)</Label>
                    <Input className="mt-1" value={fmtDate(dataValidade)} disabled />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Observações (opcional)</Label>
                  <Input className="mt-1" placeholder="CID, restrições, etc."
                    value={observacoes} onChange={e => setObservacoes(e.target.value)} />
                </div>

                <Button onClick={adicionar} disabled={salvando} size="sm" className="gap-2 w-full">
                  <Plus className="w-4 h-4" />
                  {salvando ? "Salvando..." : "Registrar exame"}
                </Button>
              </div>

              {/* Histórico */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Histórico ({registros.length})
                </p>
                {registros.length === 0 ? (
                  <p className="text-center py-6 text-sm text-muted-foreground">Nenhum exame registrado ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {registros.map(r => {
                      const res = RESULTADO_OPTIONS.find(opt => opt.value === r.resultado);
                      const tipoLabel = TIPO_OPTIONS.find(t => t.value === r.tipo)?.label || r.tipo;
                      return (
                        <div key={r.id}
                          className="flex items-start justify-between p-3 rounded-xl border border-border bg-background">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 text-base">
                              🩺
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {tipoLabel}
                                {res && (
                                  <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                    style={{ background: res.color + "20", color: res.color }}>
                                    {res.label}
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {fmtDate(r.data_realizacao)} → válido até {fmtDate(r.data_validade)}
                              </p>
                              {r.medico && <p className="text-xs text-muted-foreground mt-0.5 italic">{r.medico}</p>}
                              {r.observacoes && <p className="text-xs text-muted-foreground mt-0.5 italic">{r.observacoes}</p>}
                            </div>
                          </div>
                          <button onClick={() => excluir(r.id)}
                            className="text-destructive hover:text-destructive/80 p-1 rounded transition-colors flex-shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
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