import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Clock, Plus, Trash2, RefreshCw, Calculator, List, FileDown, FileSpreadsheet } from "lucide-react";
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
const exportarPDF = () => {
  import("jspdf").then(({ default: jsPDF }) => {
    const emp = employees.find(e => e.id === selectedId);
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const M = 15;

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, W, 28, "F");
    doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
    doc.text("RELATÓRIO DE BANCO DE HORAS", W / 2, 11, { align: "center" });
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(180, 200, 230);
    doc.text("APA Refrigeração e Climatização", W / 2, 17, { align: "center" });
    doc.text(`Funcionário: ${emp?.name || "—"}`, W / 2, 22, { align: "center" });

    let y = 34;
    doc.setFillColor(245, 247, 250);
    doc.rect(M, y, W - M * 2, 12, "FD");
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(40, 40, 50);
    doc.text(`Saldo atual: ${fmtHoras(saldo)}`, M + 2, y + 5);
    doc.text(`Créditos: ${fmtHoras(entries.filter(e => e.tipo === "credito").reduce((a, e) => a + e.horas, 0))}`, M + 60, y + 5);
    doc.text(`Débitos: ${fmtHoras(entries.filter(e => e.tipo === "debito").reduce((a, e) => a + e.horas, 0))}`, M + 120, y + 5);
    y += 16;

    doc.setFillColor(15, 23, 42);
    doc.rect(M, y, W - M * 2, 7, "F");
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
    doc.text("DATA", M + 2, y + 5);
    doc.text("TIPO", M + 35, y + 5);
    doc.text("HORAS", M + 80, y + 5);
    doc.text("DESCRIÇÃO", M + 110, y + 5);
    y += 7;

    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    entries.forEach((e, idx) => {
      if (idx % 2 === 0) { doc.setFillColor(250, 251, 253); doc.rect(M, y, W - M * 2, 6, "F"); }
      doc.setTextColor(40, 40, 50);
      doc.text(new Date(e.data + "T00:00:00").toLocaleDateString("pt-BR"), M + 2, y + 4.5);
      e.tipo === "credito" ? doc.setTextColor(20, 110, 60) : doc.setTextColor(160, 30, 40);
      doc.text(e.tipo === "credito" ? "Crédito" : "Débito", M + 35, y + 4.5);
      doc.text((e.tipo === "debito" ? "-" : "+") + fmtHoras(e.horas), M + 80, y + 4.5);
      doc.setTextColor(40, 40, 50);
      doc.text((e.descricao || "").slice(0, 50), M + 110, y + 4.5);
      y += 6;
      if (y > 270) { doc.addPage(); y = 15; }
    });

    doc.setDrawColor(15, 23, 42); doc.setLineWidth(0.5);
    doc.line(M, doc.internal.pageSize.getHeight() - 12, W - M, doc.internal.pageSize.getHeight() - 12);
    doc.setFontSize(6.5); doc.setTextColor(120, 120, 130);
    doc.text(`APA Ponto — Gerado em ${new Date().toLocaleString("pt-BR")}`, W / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });

    const safeName = (emp?.name || "funcionario").replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30);
    doc.save(`BancoHoras_${safeName}.pdf`);
  });
};

const exportarExcel = () => {
  const emp = employees.find(e => e.id === selectedId);
  const rows = [
    ["Data", "Tipo", "Horas", "Descrição"],
    ...entries.map(e => [
      new Date(e.data + "T00:00:00").toLocaleDateString("pt-BR"),
      e.tipo === "credito" ? "Crédito" : "Débito",
      (e.tipo === "debito" ? "-" : "+") + fmtHoras(e.horas),
      e.descricao,
    ]),
    [],
    ["Saldo atual", fmtHoras(saldo)],
  ];
  const csv = rows.map(r => r.join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `BancoHoras_${(emp?.name || "funcionario").replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("Excel baixado!");
};
  return (
    <div className="space-y-4">
  <div className="flex items-center justify-between">
    <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
      <Clock className="w-5 h-5 text-primary" />
      Banco de Horas
    </h2>
    <div className="flex gap-2">
      {selectedId && entries.length > 0 && (
        <>
          <Button variant="outline" size="sm" onClick={exportarPDF} className="gap-1">
            <FileDown className="w-4 h-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportarExcel} className="gap-1">
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </Button>
        </>
      )}
      <Button variant="outline" size="sm" onClick={load} disabled={loading}>
        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
      </Button>
    </div>
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
          {/* Medidor visual de saldo */}
          {(() => {
            const creditos = entries.filter(e => e.tipo === "credito").reduce((a, e) => a + e.horas, 0);
            const debitos = entries.filter(e => e.tipo === "debito").reduce((a, e) => a + e.horas, 0);
            const limite = 40;
            const pct = Math.min(Math.abs(saldo) / limite * 100, 100);
            const isPositivo = saldo >= 0;
            return (
              <Card className={`p-5 border-2 ${isPositivo ? "border-emerald-500/30" : "border-rose-500/30"}`}>
                <div className="flex items-end justify-between mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Saldo do banco de horas</p>
                    <p className={`text-5xl font-bold mt-1 tabular-nums ${isPositivo ? "text-emerald-500" : "text-rose-500"}`}>
                      {saldo > 0 ? "+" : ""}{fmtHoras(saldo)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{isPositivo ? "Horas a receber / compensar" : "Horas em débito"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Limite recomendado</p>
                    <p className="text-sm font-semibold text-muted-foreground">40h</p>
                  </div>
                </div>

                {/* Barra progressiva */}
                <div className="w-full h-4 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-4 rounded-full transition-all duration-700 ${
                      pct >= 100 ? "bg-rose-500" :
                      pct >= 75 ? "bg-amber-500" :
                      isPositivo ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                  <span>0h</span>
                  <span>{pct.toFixed(0)}% do limite</span>
                  <span>40h</span>
                </div>

                {/* Créditos e débitos */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="rounded-xl bg-emerald-500/10 p-3">
                    <p className="text-xs text-muted-foreground">Créditos</p>
                    <p className="text-xl font-bold text-emerald-500 mt-0.5">+{fmtHoras(creditos)}</p>
                  </div>
                  <div className="rounded-xl bg-rose-500/10 p-3">
                    <p className="text-xs text-muted-foreground">Débitos</p>
                    <p className="text-xl font-bold text-rose-500 mt-0.5">-{fmtHoras(debitos)}</p>
                  </div>
                </div>
              </Card>
            );
          })()}

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
