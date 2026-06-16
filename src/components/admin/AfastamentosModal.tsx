import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Plus, Trash2, BriefcaseMedical, RefreshCw } from "lucide-react";

interface Props {
  employeeId: string;
  employeeName: string;
  onClose: () => void;
}

interface Afastamento {
  id: string;
  tipo: string;
  data_inicio: string;
  data_fim: string;
  motivo: string | null;
  created_at: string;
}

interface TrocaPlantao {
  id: string;
  data_original: string;
  data_compensacao: string | null;
  motivo: string | null;
  status: string;
  created_at: string;
}

const TIPO_OPTIONS = [
  { value: "licenca_medica", label: "🏥 Licença Médica" },
  { value: "licenca_maternidade", label: "🤱 Licença Maternidade" },
  { value: "licenca_paternidade", label: "👨‍👶 Licença Paternidade" },
  { value: "ferias", label: "🏖️ Férias" },
  { value: "acidente_trabalho", label: "⚠️ Acidente de Trabalho" },
  { value: "suspensao", label: "🚫 Suspensão" },
  { value: "outro", label: "📋 Outro" },
];

const TIPO_LABELS: Record<string, string> = {
  licenca_medica: "🏥 Licença Médica",
  licenca_maternidade: "🤱 Maternidade",
  licenca_paternidade: "👨‍👶 Paternidade",
  ferias: "🏖️ Férias",
  acidente_trabalho: "⚠️ Acidente",
  suspensao: "🚫 Suspensão",
  outro: "📋 Outro",
};

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
}

function diffDias(ini: string, fim: string) {
  const a = new Date(ini + "T12:00:00");
  const b = new Date(fim + "T12:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

export default function AfastamentosModal({ employeeId, employeeName, onClose }: Props) {
  const [tab, setTab] = useState<"afastamentos" | "trocas">("afastamentos");

  // Afastamentos
  const [afastamentos, setAfastamentos] = useState<Afastamento[]>([]);
  const [loadingA, setLoadingA] = useState(false);
  const [novoTipo, setNovoTipo] = useState("licenca_medica");
  const [novoInicio, setNovoInicio] = useState(new Date().toISOString().slice(0, 10));
  const [novoFim, setNovoFim] = useState(new Date().toISOString().slice(0, 10));
  const [novoMotivo, setNovoMotivo] = useState("");
  const [salvandoA, setSalvandoA] = useState(false);

  // Trocas
  const [trocas, setTrocas] = useState<TrocaPlantao[]>([]);
  const [loadingT, setLoadingT] = useState(false);
  const [trocaOriginal, setTrocaOriginal] = useState(new Date().toISOString().slice(0, 10));
  const [trocaCompensacao, setTrocaCompensacao] = useState("");
  const [trocaMotivo, setTrocaMotivo] = useState("");
  const [salvandoT, setSalvandoT] = useState(false);

  const fetchAfastamentos = async () => {
    setLoadingA(true);
    const { data, error } = await (supabase as any)
      .from("afastamentos")
      .select("*")
      .eq("employee_id", employeeId)
      .order("data_inicio", { ascending: false });
    if (!error && data) setAfastamentos(data);
    setLoadingA(false);
  };

  const fetchTrocas = async () => {
    setLoadingT(true);
    const { data, error } = await (supabase as any)
      .from("trocas_plantao")
      .select("*")
      .eq("employee_id", employeeId)
      .order("data_original", { ascending: false });
    if (!error && data) setTrocas(data);
    setLoadingT(false);
  };

  useEffect(() => { fetchAfastamentos(); fetchTrocas(); }, [employeeId]);

  const adicionarAfastamento = async () => {
    if (!novoInicio || !novoFim) { toast.error("Informe as datas"); return; }
    if (new Date(novoFim) < new Date(novoInicio)) { toast.error("Data fim deve ser após data início"); return; }
    setSalvandoA(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("afastamentos").insert({
      employee_id: employeeId,
      tipo: novoTipo,
      data_inicio: novoInicio,
      data_fim: novoFim,
      motivo: novoMotivo.trim() || null,
      criado_por: user?.email || null,
    });
    if (error) { toast.error("Erro ao salvar: " + error.message); }
    else { toast.success("Afastamento registrado!"); setNovoMotivo(""); fetchAfastamentos(); }
    setSalvandoA(false);
  };

  const excluirAfastamento = async (id: string) => {
    if (!confirm("Excluir este afastamento?")) return;
    const { error } = await (supabase as any).from("afastamentos").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Removido"); fetchAfastamentos(); }
  };

  const adicionarTroca = async () => {
    if (!trocaOriginal) { toast.error("Informe a data do plantão original"); return; }
    setSalvandoT(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("trocas_plantao").insert({
      employee_id: employeeId,
      data_original: trocaOriginal,
      data_compensacao: trocaCompensacao || null,
      motivo: trocaMotivo.trim() || null,
      status: "registrado",
      criado_por: user?.email || null,
    });
    if (error) { toast.error("Erro ao salvar: " + error.message); }
    else { toast.success("Troca registrada!"); setTrocaMotivo(""); setTrocaCompensacao(""); fetchTrocas(); }
    setSalvandoT(false);
  };

  const excluirTroca = async (id: string) => {
    if (!confirm("Excluir esta troca?")) return;
    const { error } = await (supabase as any).from("trocas_plantao").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Removido"); fetchTrocas(); }
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
              <BriefcaseMedical className="w-4 h-4 text-primary" />
              Afastamentos e Trocas
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{employeeName}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-3 border-b border-border flex-shrink-0">
          <button onClick={() => setTab("afastamentos")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "afastamentos"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}>
            🏥 Afastamentos ({afastamentos.length})
          </button>
          <button onClick={() => setTab("trocas")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "trocas"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}>
            🔄 Trocas de Plantão ({trocas.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── AFASTAMENTOS ── */}
          {tab === "afastamentos" && (
            <>
              {/* Formulário */}
              <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/20">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Registrar novo afastamento
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Tipo</Label>
                    <select value={novoTipo} onChange={e => setNovoTipo(e.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      {TIPO_OPTIONS.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Data início</Label>
                    <Input type="date" className="mt-1" value={novoInicio}
                      onChange={e => setNovoInicio(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Data fim</Label>
                    <Input type="date" className="mt-1" value={novoFim}
                      onChange={e => setNovoFim(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Observação (opcional)</Label>
                    <Input className="mt-1" placeholder="CID, número do atestado, etc."
                      value={novoMotivo} onChange={e => setNovoMotivo(e.target.value)} />
                  </div>
                </div>
                {novoInicio && novoFim && new Date(novoFim) >= new Date(novoInicio) && (
                  <p className="text-xs text-muted-foreground">
                    ⏱ {diffDias(novoInicio, novoFim)} dia(s) — banco de horas zerado nesse período
                  </p>
                )}
                <Button onClick={adicionarAfastamento} disabled={salvandoA} size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  {salvandoA ? "Salvando..." : "Registrar afastamento"}
                </Button>
              </div>

              {/* Lista */}
              {loadingA ? (
                <div className="flex justify-center py-6">
                  <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : afastamentos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Nenhum afastamento registrado.
                </div>
              ) : (
                <div className="space-y-2">
                  {afastamentos.map(a => (
                    <div key={a.id}
                      className="flex items-start justify-between p-3 rounded-xl border border-border bg-background">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0 text-base">
                          {TIPO_LABELS[a.tipo]?.split(" ")[0] || "📋"}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {TIPO_LABELS[a.tipo]?.split(" ").slice(1).join(" ") || a.tipo}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {fmtDate(a.data_inicio)} → {fmtDate(a.data_fim)}
                            <span className="ml-2 font-medium text-primary">
                              {diffDias(a.data_inicio, a.data_fim)} dia(s)
                            </span>
                          </p>
                          {a.motivo && (
                            <p className="text-xs text-muted-foreground mt-0.5 italic">{a.motivo}</p>
                          )}
                        </div>
                      </div>
                      <button onClick={() => excluirAfastamento(a.id)}
                        className="text-destructive hover:text-destructive/80 p-1 rounded transition-colors flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── TROCAS DE PLANTÃO ── */}
          {tab === "trocas" && (
            <>
              {/* Formulário */}
              <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/20">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Registrar troca de plantão
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Data do plantão trocado</Label>
                    <Input type="date" className="mt-1" value={trocaOriginal}
                      onChange={e => setTrocaOriginal(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Data de compensação (opcional)</Label>
                    <Input type="date" className="mt-1" value={trocaCompensacao}
                      onChange={e => setTrocaCompensacao(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Motivo (opcional)</Label>
                    <Input className="mt-1" placeholder="Ex: Trocou com Marcos — plantão 14/06"
                      value={trocaMotivo} onChange={e => setTrocaMotivo(e.target.value)} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  💡 O dia trocado não será cobrado no banco de horas deste funcionário.
                </p>
                <Button onClick={adicionarTroca} disabled={salvandoT} size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  {salvandoT ? "Salvando..." : "Registrar troca"}
                </Button>
              </div>

              {/* Lista */}
              {loadingT ? (
                <div className="flex justify-center py-6">
                  <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : trocas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Nenhuma troca registrada.
                </div>
              ) : (
                <div className="space-y-2">
                  {trocas.map(t => (
                    <div key={t.id}
                      className="flex items-start justify-between p-3 rounded-xl border border-border bg-background">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 text-base">
                          🔄
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Plantão {fmtDate(t.data_original)}
                          </p>
                          {t.data_compensacao && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Compensa em {fmtDate(t.data_compensacao)}
                            </p>
                          )}
                          {t.motivo && (
                            <p className="text-xs text-muted-foreground mt-0.5 italic">{t.motivo}</p>
                          )}
                          <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            t.status === "registrado"
                              ? "bg-blue-500/10 text-blue-600"
                              : "bg-emerald-500/10 text-emerald-600"
                          }`}>
                            {t.status === "registrado" ? "Registrado" : "Compensado"}
                          </span>
                        </div>
                      </div>
                      <button onClick={() => excluirTroca(t.id)}
                        className="text-destructive hover:text-destructive/80 p-1 rounded transition-colors flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}