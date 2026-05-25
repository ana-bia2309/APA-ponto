import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Clock, Plus, Trash2, RefreshCw, Calculator, List } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;

interface BancoEntry {
  id: string;
  employee_id: string;
  data: string;
  tipo: "credito" | "debito";
  horas: number;
  descricao: string;
  created_at: string;
}

interface DiaCalculo {
  dia: string;
  horas_trabalhadas: number;
  horas_esperadas: number;
  diferenca: number;
}

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export default function BancoHorasTab({ employees }: { employees: Employee[] }) {
  const [selectedId, setSelectedId] = useState("");
  const [entries, setEntries] = useState<BancoEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [novaData, setNovaData] = useState(new Date().toISOString().slice(0, 10));
  const [novoTipo, setNovoTipo] = useState<"credito" | "debito">("credito");
  const [novasHoras, setNovasHoras] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");

  // Cálculo automático
  const [subTab, setSubTab] = useState<"manual" | "automatico">("automatico");
  const [calcMonth, setCalcMonth] = useState(new Date().getMonth() + 1);
  const [calcYear, setCalcYear] = useState(new Date().getFullYear());
  const [diasCalculo, setDiasCalculo] = useState<DiaCalculo[]>([]);
  const [calcLoading, setCalcLoading] = useState(false);
  const [importando, setImportando] = useState(false);

  const saldo = entries.reduce((acc, e) => {
    return e.tipo === "credito" ? acc + e.horas : acc - e.horas;
  }, 0);

  const load = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("banco_horas" as any)
      .select("*")
      .eq("employee_id", selectedId)
      .order("data", { ascending: false });
    if (!error && data) setEntries(data as any);
    setLoading(false);
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);

  const calcular = useCallback(async () => {
    if (!selectedId) return;
    setCalcLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("calculate_banco_horas", {
        p_employee_id: selectedId,
        p_month: calcMonth,
        p_year: calcYear,
      });
      if (error) throw error;
      setDiasCalculo(data || []);
    } catch (err: any) {
      toast.error("Erro ao calcular: " + err.message);
    } finally {
      setCalcLoading(false);
    }
  }, [selectedId, calcMonth, calcYear]);

  useEffect(() => {
    if (selectedId && subTab === "automatico") calcular();
  }, [selectedId, calcMonth, calcYear, subTab, calcular]);

  const importarMes = async () => {
    if (!selectedId || diasCalculo.length === 0) return;
    const totalDif = diasCalculo.reduce((a, d) => a + Number(d.diferenca), 0);
    if (totalDif === 0) { toast.info("Nenhuma diferença para importar."); return; }
    if (!confirm(`Importar ${fmtHoras(Math.abs(totalDif))} de ${totalDif >= 0 ? "crédito" : "débito"} para ${MONTH_NAMES[calcMonth - 1]}/${calcYear}?`)) return;

    setImportando(true);
    try {
      const tipo = totalDif >= 0 ? "credito" : "debito";
      const { error } = await supabase.from("banco_horas" as any).insert({
        employee_id: selectedId,
        data: `${calcYear}-${String(calcMonth).padStart(2, "0")}-01`,
        tipo,
        horas: Math.abs(totalDif),
        descricao: `Cálculo automático — ${MONTH_NAMES[calcMonth - 1]}/${calcYear}`,
      });
      if (error) throw error;
      toast.success("Importado com sucesso!");
      load();
    } catch (err: any) {
      toast.error("Erro ao importar: " + err.message);
    } finally {
      setImportando(false);
    }
  };

  const adicionar = async () => {
    if (!selectedId || !novasHoras || !novaDescricao) {
      toast.error("Preencha todos os campos");
      return;
    }
    const horas = parseFloat(novasHoras);
    if (isNaN(horas) || horas <= 0) { toast.error("Horas inválidas"); return; }
    const { error } = await supabase.from("banco_horas" as any).insert({
      employee_id: selectedId, data: novaData, tipo: novoTipo, horas, descricao: novaDescricao,
    });
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Lançamento adicionado!");
    setNovasHoras(""); setNovaDescricao("");
    load();
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir este lançamento?")) return;
    await supabase.from("banco_horas" as any).delete().eq("id", id);
    load();
  };

  const fmtHoras = (h: number) => {
    const abs = Math.abs(h);
    const hh = Math.floor(abs);
    const mm = Math.round((abs - hh) * 60);
    return `${h < 0 ? "-" : ""}${String(hh).padStart(2, "0")}h${String(mm).padStart(2, "0")}m`;
  };

  const totalDif = diasCalculo.reduce((a, d) => a + Number(d.diferenca), 0);
  const totalTrabalhado = diasCalculo.reduce((a, d) => a + Number(d.horas_trabalhadas), 0);
  const totalEsperado = diasCalculo.reduce((a, d) => a + Number(d.horas_esperadas), 0);
  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          Banco de Horas
        </h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Seleção de funcionário */}
      <Card className="p-4">
        <Label>Funcionário</Label>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Selecione um funcionário...</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </Card>

      {selectedId && (
        <>
          {/* Cards de saldo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className={`p-4 border-2 ${saldo >= 0 ? "border-emerald-500/30" : "border-rose-500/30"}`}>
              <p className="text-sm text-muted-foreground">Saldo atual</p>
              <p className={`text-3xl font-bold mt-1 ${saldo >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                {fmtHoras(saldo)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{saldo >= 0 ? "Horas a receber" : "Horas a compensar"}</p>
            </Card>
            <Card className="p-4 border-2 border-emerald-500/20">
              <p className="text-sm text-muted-foreground">Horas positivas</p>
              <p className="text-3xl font-bold mt-1 text-emerald-500">
                {fmtHoras(entries.filter(e => e.tipo === "credito").reduce((a, e) => a + e.horas, 0))}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Total de créditos</p>
            </Card>
            <Card className="p-4 border-2 border-rose-500/20">
              <p className="text-sm text-muted-foreground">Horas negativas</p>
              <p className="text-3xl font-bold mt-1 text-rose-500">
                {fmtHoras(entries.filter(e => e.tipo === "debito").reduce((a, e) => a + e.horas, 0))}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Total de débitos</p>
            </Card>
          </div>

          {saldo > 40 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <span className="text-amber-500 text-lg">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-amber-600">Excesso de horas no banco</p>
                <p className="text-xs text-amber-600">Saldo de {fmtHoras(saldo)} ultrapassa o limite recomendado de 40h.</p>
              </div>
            </div>
          )}
          {saldo < -20 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
              <span className="text-rose-500 text-lg">🔴</span>
              <div>
                <p className="text-sm font-semibold text-rose-600">Saldo negativo elevado</p>
                <p className="text-xs text-rose-600">Funcionário possui {fmtHoras(Math.abs(saldo))} a compensar.</p>
              </div>
            </div>
          )}

          {saldo > 0 && (
            <Card className="p-4 space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Previsão de compensação</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-lg bg-muted/40">
                  <p className="text-xs text-muted-foreground">Compensando 2h/dia</p>
                  <p className="text-lg font-bold mt-1">{Math.ceil(saldo / 2)} dias</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/40">
                  <p className="text-xs text-muted-foreground">Compensando 4h/dia</p>
                  <p className="text-lg font-bold mt-1">{Math.ceil(saldo / 4)} dias</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/40">
                  <p className="text-xs text-muted-foreground">Folga integral (8h)</p>
                  <p className="text-lg font-bold mt-1">{Math.ceil(saldo / 8)} dia(s)</p>
                </div>
              </div>
            </Card>
          )}

          {/* Sub-abas */}
          <div className="flex gap-2">
            <Button variant={subTab === "automatico" ? "default" : "outline"} size="sm"
              onClick={() => setSubTab("automatico")} className="gap-1">
              <Calculator className="w-4 h-4" /> Cálculo Automático
            </Button>
            <Button variant={subTab === "manual" ? "default" : "outline"} size="sm"
              onClick={() => setSubTab("manual")} className="gap-1">
              <List className="w-4 h-4" /> Lançamentos Manuais
            </Button>
          </div>

          {/* CÁLCULO AUTOMÁTICO */}
          {subTab === "automatico" && (
            <div className="space-y-3">
              <Card className="p-4">
                <div className="flex gap-3 flex-wrap items-end">
                  <div>
                    <Label>Mês</Label>
                    <select value={calcMonth} onChange={e => setCalcMonth(Number(e.target.value))}
                      className="mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm">
                      {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Ano</Label>
                    <select value={calcYear} onChange={e => setCalcYear(Number(e.target.value))}
                      className="mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm">
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <Button onClick={calcular} disabled={calcLoading} variant="outline" size="sm">
                    <RefreshCw className={`w-4 h-4 mr-1 ${calcLoading ? "animate-spin" : ""}`} />
                    Recalcular
                  </Button>
                </div>
              </Card>

              {diasCalculo.length > 0 && (
                <>
                  {/* Resumo do mês */}
                  <div className="grid grid-cols-3 gap-3">
                    <Card className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Trabalhado</p>
                      <p className="text-xl font-bold text-blue-500 mt-1">{fmtHoras(totalTrabalhado)}</p>
                    </Card>
                    <Card className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Esperado</p>
                      <p className="text-xl font-bold mt-1">{fmtHoras(totalEsperado)}</p>
                    </Card>
                    <Card className={`p-3 text-center border-2 ${totalDif >= 0 ? "border-emerald-500/30" : "border-rose-500/30"}`}>
                      <p className="text-xs text-muted-foreground">Diferença</p>
                      <p className={`text-xl font-bold mt-1 ${totalDif >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {fmtHoras(totalDif)}
                      </p>
                    </Card>
                  </div>

                  <Button onClick={importarMes} disabled={importando || totalDif === 0} className="w-full gap-2">
                    <Plus className="w-4 h-4" />
                    {importando ? "Importando..." : `Importar ${fmtHoras(Math.abs(totalDif))} como ${totalDif >= 0 ? "crédito" : "débito"} no banco`}
                  </Button>

                  {/* Tabela por dia */}
                  <Card className="p-0 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40">
                        <tr className="text-left">
                          <th className="p-3">Data</th>
                          <th className="p-3">Trabalhado</th>
                          <th className="p-3">Esperado</th>
                          <th className="p-3">Diferença</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diasCalculo.map((d) => {
                          const dif = Number(d.diferenca);
                          const trab = Number(d.horas_trabalhadas);
                          const esp = Number(d.horas_esperadas);
                          return (
                            <tr key={d.dia} className="border-t border-border/50">
                              <td className="p-3">{new Date(d.dia + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</td>
                              <td className="p-3 tabular-nums">{trab > 0 ? fmtHoras(trab) : "—"}</td>
                              <td className="p-3 tabular-nums text-muted-foreground">{fmtHoras(esp)}</td>
                              <td className={`p-3 font-medium tabular-nums ${dif > 0 ? "text-emerald-500" : dif < 0 ? "text-rose-500" : "text-muted-foreground"}`}>
                                {dif === 0 ? "—" : (dif > 0 ? "+" : "") + fmtHoras(dif)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Card>
                </>
              )}

              {diasCalculo.length === 0 && !calcLoading && (
                <Card className="p-8 text-center">
                  <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum registro encontrado para este período.</p>
                </Card>
              )}
            </div>
          )}

          {/* LANÇAMENTOS MANUAIS */}
          {subTab === "manual" && (
            <div className="space-y-3">
              <Card className="p-4 space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Novo lançamento</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <Label>Data</Label>
                    <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
                  </div>
                  <div>
                    <Label>Tipo</Label>
                    <select value={novoTipo} onChange={(e) => setNovoTipo(e.target.value as any)}
                      className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="credito">Crédito (horas a receber)</option>
                      <option value="debito">Débito (compensação)</option>
                    </select>
                  </div>
                  <div>
                    <Label>Horas</Label>
                    <Input type="number" step="0.5" min="0" placeholder="Ex: 2.5"
                      value={novasHoras} onChange={(e) => setNovasHoras(e.target.value)} />
                  </div>
                  <div>
                    <Label>Descrição</Label>
                    <Input placeholder="Ex: Horas extras maio"
                      value={novaDescricao} onChange={(e) => setNovaDescricao(e.target.value)} />
                  </div>
                </div>
                <Button onClick={adicionar} className="gap-2">
                  <Plus className="w-4 h-4" /> Adicionar lançamento
                </Button>
              </Card>

              <Card className="p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-left">
                      <th className="p-3">Data</th>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Horas</th>
                      <th className="p-3">Descrição</th>
                      <th className="p-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.length === 0 ? (
                      <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhum lançamento encontrado.</td></tr>
                    ) : entries.map((e) => (
                      <tr key={e.id} className="border-t border-border/50">
                        <td className="p-3">{new Date(e.data + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${e.tipo === "credito" ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>
                            {e.tipo === "credito" ? "Crédito" : "Débito"}
                          </span>
                        </td>
                        <td className={`p-3 font-medium ${e.tipo === "credito" ? "text-emerald-500" : "text-rose-500"}`}>
                          {e.tipo === "debito" ? "-" : "+"}{fmtHoras(e.horas)}
                        </td>
                        <td className="p-3 text-muted-foreground">{e.descricao}</td>
                        <td className="p-3 text-right">
                          <Button size="sm" variant="ghost" onClick={() => excluir(e.id)} className="text-destructive hover:text-destructive">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
