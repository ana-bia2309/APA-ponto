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

interface BancoMes {
  id: string;
  employee_id: string;
  reference_month: string; // "YYYY-MM"
  extra_hours: number;
  debit_hours: number;
  balance: number;
  updated_at: string;
}

interface DiaCalculo {
  dia: string;
  horas_trabalhadas: number;
  horas_esperadas: number;
  diferenca: number;
}

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function fmtMes(referenceMonth: string) {
  const [y, m] = referenceMonth.split("-").map(Number);
  return `${MONTH_NAMES[(m || 1) - 1]}/${y}`;
}

export default function BancoHorasTab({ employees }: { employees: Employee[] }) {
  const [selectedId, setSelectedId] = useState("");
  const [entries, setEntries] = useState<BancoMes[]>([]);
  const [loading, setLoading] = useState(false);
  const [destinoFuncionario, setDestinoFuncionario] = useState<"hora_extra" | "banco_horas">("hora_extra");

  // Cálculo automático (diário, a partir dos registros de ponto)
  const [subTab, setSubTab] = useState<"manual" | "automatico">("automatico");
  const [calcMonth, setCalcMonth] = useState(new Date().getMonth() + 1);
  const [calcYear, setCalcYear] = useState(new Date().getFullYear());
  const [diasCalculo, setDiasCalculo] = useState<DiaCalculo[]>([]);
  const [calcLoading, setCalcLoading] = useState(false);
  const [importando, setImportando] = useState(false);

  // Ajuste manual (mensal)
  const [ajusteMonth, setAjusteMonth] = useState(new Date().getMonth() + 1);
  const [ajusteYear, setAjusteYear] = useState(new Date().getFullYear());
  const [ajusteCredito, setAjusteCredito] = useState("");
  const [ajusteDebito, setAjusteDebito] = useState("");
  const [salvandoAjuste, setSalvandoAjuste] = useState(false);

  const totalCredito = entries.reduce((a, e) => a + Number(e.extra_hours || 0), 0);
  const totalDebito = entries.reduce((a, e) => a + Number(e.debit_hours || 0), 0);
  const totalDif = entries.reduce((a, e) => a + Number(e.balance || 0), 0);

  const totalDifCalc = diasCalculo.reduce((a, d) => a + Number(d.diferenca), 0);
  const totalTrabalhado = diasCalculo.reduce((a, d) => a + Number(d.horas_trabalhadas), 0);
  const totalEsperado = diasCalculo.reduce((a, d) => a + Number(d.horas_esperadas), 0);

  const load = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("hour_bank")
      .select("*")
      .eq("employee_id", selectedId)
      .order("reference_month", { ascending: false });
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

  useEffect(() => {
    if (!selectedId) { setDestinoFuncionario("hora_extra"); return; }
    (async () => {
      const { data } = await supabase
        .from("payroll_settings" as any)
        .select("destino_horas_excedentes")
        .eq("employee_id", selectedId)
        .maybeSingle();
      setDestinoFuncionario(((data as any)?.destino_horas_excedentes) === "banco_horas" ? "banco_horas" : "hora_extra");
    })();
  }, [selectedId]);

  // Soma `delta` (positivo ou negativo) ao crédito/débito daquele mês, preservando o que já existir.
  const aplicarDelta = async (referenceMonth: string, deltaCredito: number, deltaDebito: number) => {
    const { data: existing } = await supabase
      .from("hour_bank" as any)
      .select("extra_hours, debit_hours")
      .eq("employee_id", selectedId)
      .eq("reference_month", referenceMonth)
      .maybeSingle();
    const extraAtual = Number((existing as any)?.extra_hours || 0);
    const debitoAtual = Number((existing as any)?.debit_hours || 0);
    const novoExtra = extraAtual + deltaCredito;
    const novoDebito = debitoAtual + deltaDebito;
    const { error } = await supabase.from("hour_bank" as any).upsert({
      employee_id: selectedId,
      reference_month: referenceMonth,
      extra_hours: novoExtra,
      debit_hours: novoDebito,
      balance: novoExtra - novoDebito,
    }, { onConflict: "employee_id,reference_month" });
    if (error) throw error;
  };

  const importarMes = async () => {
    if (!selectedId || diasCalculo.length === 0) return;
    const dif = diasCalculo.reduce((a, d) => a + Number(d.diferenca), 0);
    if (dif === 0) { toast.info("Nenhuma diferença para importar."); return; }
    if (!confirm(`Importar ${fmtHoras(Math.abs(dif))} de ${dif >= 0 ? "crédito" : "débito"} para ${MONTH_NAMES[calcMonth - 1]}/${calcYear}?`)) return;

    setImportando(true);
    try {
      const referenceMonth = `${calcYear}-${String(calcMonth).padStart(2, "0")}`;
      await aplicarDelta(referenceMonth, Math.max(dif, 0), Math.max(-dif, 0));
      toast.success("Importado com sucesso!");
      load();
    } catch (err: any) {
      toast.error("Erro ao importar: " + err.message);
    } finally {
      setImportando(false);
    }
  };

  const aplicarAjuste = async () => {
    if (!selectedId) return;
    const credito = parseFloat(ajusteCredito) || 0;
    const debito = parseFloat(ajusteDebito) || 0;
    if (credito === 0 && debito === 0) { toast.error("Informe horas de crédito ou débito"); return; }
    setSalvandoAjuste(true);
    try {
      const referenceMonth = `${ajusteYear}-${String(ajusteMonth).padStart(2, "0")}`;
      await aplicarDelta(referenceMonth, credito, debito);
      toast.success("Ajuste aplicado!");
      setAjusteCredito(""); setAjusteDebito("");
      load();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setSalvandoAjuste(false);
    }
  };

  const excluirMes = async (id: string) => {
    if (!confirm("Excluir o registro deste mês? Isso zera o saldo desse mês específico.")) return;
    await (supabase as any).from("hour_bank").delete().eq("id", id);
    load();
  };

  const fmtHoras = (h: number) => {
    const abs = Math.abs(h);
    const hh = Math.floor(abs);
    const mm = Math.round((abs - hh) * 60);
    return `${h < 0 ? "-" : ""}${String(hh).padStart(2, "0")}h${String(mm).padStart(2, "0")}m`;
  };

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
      doc.text(`Saldo atual: ${fmtHoras(totalDif)}`, M + 2, y + 5);
      doc.text(`Créditos: ${fmtHoras(totalCredito)}`, M + 60, y + 5);
      doc.text(`Débitos: ${fmtHoras(totalDebito)}`, M + 120, y + 5);
      y += 16;

      doc.setFillColor(15, 23, 42);
      doc.rect(M, y, W - M * 2, 7, "F");
      doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
      doc.text("MÊS", M + 2, y + 5);
      doc.text("CRÉDITO", M + 60, y + 5);
      doc.text("DÉBITO", M + 110, y + 5);
      doc.text("SALDO", M + 160, y + 5);
      y += 7;

      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
      entries.forEach((e, idx) => {
        if (idx % 2 === 0) { doc.setFillColor(250, 251, 253); doc.rect(M, y, W - M * 2, 6, "F"); }
        doc.setTextColor(40, 40, 50);
        doc.text(fmtMes(e.reference_month), M + 2, y + 4.5);
        doc.setTextColor(20, 110, 60);
        doc.text("+" + fmtHoras(e.extra_hours), M + 60, y + 4.5);
        doc.setTextColor(160, 30, 40);
        doc.text("-" + fmtHoras(e.debit_hours), M + 110, y + 4.5);
        doc.setTextColor(40, 40, 50);
        doc.text(fmtHoras(e.balance), M + 160, y + 4.5);
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
      ["Mês", "Crédito", "Débito", "Saldo"],
      ...entries.map(e => [
        fmtMes(e.reference_month),
        "+" + fmtHoras(e.extra_hours),
        "-" + fmtHoras(e.debit_hours),
        fmtHoras(e.balance),
      ]),
      [],
      ["Saldo total", fmtHoras(totalDif)],
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
          <Card className={`p-5 border-2 ${totalDif >= 0 ? "border-emerald-500/30" : "border-rose-500/30"}`}>
            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Saldo do banco de horas</p>
                <p className={`text-5xl font-bold mt-1 tabular-nums ${totalDif >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {totalDif > 0 ? "+" : ""}{fmtHoras(totalDif)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{totalDif >= 0 ? "Horas a receber / compensar" : "Horas em débito"}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Limite recomendado</p>
                <p className="text-sm font-semibold text-muted-foreground">40h</p>
              </div>
            </div>
            <div className="w-full h-4 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-4 rounded-full transition-all duration-700 ${
                  Math.abs(totalDif) >= 40 ? "bg-rose-500" :
                  Math.abs(totalDif) >= 30 ? "bg-amber-500" :
                  totalDif >= 0 ? "bg-emerald-500" : "bg-rose-500"
                }`}
                style={{ width: `${Math.min(Math.abs(totalDif) / 40 * 100, 100)}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-xl bg-emerald-500/10 p-3">
                <p className="text-xs text-muted-foreground">Créditos acumulados</p>
                <p className="text-xl font-bold text-emerald-500 mt-0.5">+{fmtHoras(totalCredito)}</p>
              </div>
              <div className="rounded-xl bg-rose-500/10 p-3">
                <p className="text-xs text-muted-foreground">Débitos acumulados</p>
                <p className="text-xl font-bold text-rose-500 mt-0.5">-{fmtHoras(totalDebito)}</p>
              </div>
            </div>
          </Card>

          {totalDif > 40 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <span className="text-amber-500 text-lg">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-amber-600">Excesso de horas no banco</p>
                <p className="text-xs text-amber-600">Saldo de {fmtHoras(totalDif)} ultrapassa o limite recomendado de 40h.</p>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant={subTab === "automatico" ? "default" : "outline"} size="sm"
              onClick={() => setSubTab("automatico")} className="gap-1">
              <Calculator className="w-4 h-4" /> Cálculo Automático
            </Button>
            <Button variant={subTab === "manual" ? "default" : "outline"} size="sm"
              onClick={() => setSubTab("manual")} className="gap-1">
              <List className="w-4 h-4" /> Ajuste Manual
            </Button>
          </div>

          {subTab === "automatico" && (
            <div className="space-y-3">
              {destinoFuncionario === "banco_horas" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <span className="text-blue-500 text-lg">ℹ️</span>
                  <div>
                    <p className="text-sm font-semibold text-blue-600">Crédito automático ativo</p>
                    <p className="text-xs text-blue-600">
                      Este funcionário está configurado para banco de horas em Parâmetros da Folha.
                      As horas excedentes já são creditadas automaticamente quando a folha é calculada —
                      não importe manualmente aqui para não duplicar.
                    </p>
                  </div>
                </div>
              )}
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
                  <div className="grid grid-cols-3 gap-3">
                    <Card className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Trabalhado</p>
                      <p className="text-xl font-bold text-blue-500 mt-1">{fmtHoras(totalTrabalhado)}</p>
                    </Card>
                    <Card className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Esperado</p>
                      <p className="text-xl font-bold mt-1">{fmtHoras(totalEsperado)}</p>
                    </Card>
                    <Card className={`p-3 text-center border-2 ${totalDifCalc >= 0 ? "border-emerald-500/30" : "border-rose-500/30"}`}>
                      <p className="text-xs text-muted-foreground">Diferença</p>
                      <p className={`text-xl font-bold mt-1 ${totalDifCalc >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {fmtHoras(totalDifCalc)}
                      </p>
                    </Card>
                  </div>

                  <Button onClick={importarMes} disabled={importando || totalDifCalc === 0 || destinoFuncionario === "banco_horas"} className="w-full gap-2">
                    <Plus className="w-4 h-4" />
                    {importando ? "Importando..." : `Importar ${fmtHoras(Math.abs(totalDifCalc))} como ${totalDifCalc >= 0 ? "crédito" : "débito"} no banco`}
                  </Button>

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

          {subTab === "manual" && (
            <Card className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Ajustar saldo de um mês</h3>
              <p className="text-xs text-muted-foreground">
                Soma horas de crédito e/ou débito ao saldo já existente daquele mês (não substitui, acumula).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <Label>Mês</Label>
                  <select value={ajusteMonth} onChange={(e) => setAjusteMonth(Number(e.target.value))}
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Ano</Label>
                  <select value={ajusteYear} onChange={(e) => setAjusteYear(Number(e.target.value))}
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Crédito (horas)</Label>
                  <Input type="number" step="0.5" min="0" placeholder="Ex: 2.5"
                    value={ajusteCredito} onChange={(e) => setAjusteCredito(e.target.value)} />
                </div>
                <div>
                  <Label>Débito (horas)</Label>
                  <Input type="number" step="0.5" min="0" placeholder="Ex: 2.5"
                    value={ajusteDebito} onChange={(e) => setAjusteDebito(e.target.value)} />
                </div>
              </div>
              <Button onClick={aplicarAjuste} disabled={salvandoAjuste} className="gap-2">
                <Plus className="w-4 h-4" /> {salvandoAjuste ? "Aplicando..." : "Aplicar ajuste"}
              </Button>
            </Card>
          )}

          <Card className="p-0 overflow-hidden">
            <div className="p-3 border-b border-border bg-muted/30">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Histórico por mês</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="p-3">Mês</th>
                  <th className="p-3">Crédito</th>
                  <th className="p-3">Débito</th>
                  <th className="p-3">Saldo</th>
                  <th className="p-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhum registro encontrado.</td></tr>
                ) : entries.map((e) => (
                  <tr key={e.id} className="border-t border-border/50">
                    <td className="p-3 font-medium">{fmtMes(e.reference_month)}</td>
                    <td className="p-3 text-emerald-500">+{fmtHoras(e.extra_hours)}</td>
                    <td className="p-3 text-rose-500">-{fmtHoras(e.debit_hours)}</td>
                    <td className={`p-3 font-medium ${e.balance >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                      {e.balance > 0 ? "+" : ""}{fmtHoras(e.balance)}
                    </td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => excluirMes(e.id)} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}