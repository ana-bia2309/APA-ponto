import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, Zap, BookmarkPlus, Trash2, Loader2, Clock, AlertTriangle, Calculator } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { generateMonthlyReport, generateMonthlyExcel } from "@/lib/generateReport";

type Employee = Tables<"employees">;

interface ExportPreset {
  id: string;
  nome: string;
  tipo: "espelho_pdf" | "espelho_excel" | "ponto_pdf" | "ponto_excel" | "banco_horas_pdf";
  periodo: "mes_atual" | "mes_anterior" | "personalizado";
  funcionarios: "todos" | string;
  mes?: number;
  ano?: number;
  criado_em: string;
}

interface HistoricoItem {
  id: string;
  descricao: string;
  data: string;
}

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const TIPO_LABELS: Record<ExportPreset["tipo"], string> = {
  espelho_pdf: "Espelho de Ponto — PDF",
  espelho_excel: "Espelho de Ponto — Excel",
  ponto_pdf: "Relatório de Ponto — PDF",
  ponto_excel: "Relatório de Ponto — Excel",
  banco_horas_pdf: "Banco de Horas — PDF",
};

function getMesAno(periodo: ExportPreset["periodo"], mesCustom?: number, anoCustom?: number) {
  const now = new Date();
  if (periodo === "mes_atual") return { mes: now.getMonth() + 1, ano: now.getFullYear() };
  if (periodo === "mes_anterior") {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { mes: d.getMonth() + 1, ano: d.getFullYear() };
  }
  return { mes: mesCustom || now.getMonth() + 1, ano: anoCustom || now.getFullYear() };
}

// ─── Relatório de Inconsistências ───
function InconsistenciasRelatorio({ employees, addHistorico }: {
  employees: Employee[];
  addHistorico: (desc: string) => void;
}) {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [inconsistencias, setInconsistencias] = useState<{ nome: string; tipo: string; detalhe: string }[]>([]);
  const [gerado, setGerado] = useState(false);
  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);

  const buscar = async () => {
    setLoading(true); setGerado(false);
    try {
      const start = new Date(ano, mes - 1, 1).toISOString();
      const end = new Date(ano, mes, 1).toISOString();
      const { data: records } = await (supabase as any)
        .from("time_records").select("employee_id, record_type, recorded_at")
        .gte("recorded_at", start).lt("recorded_at", end).order("recorded_at");
      const result: { nome: string; tipo: string; detalhe: string }[] = [];
      employees.filter(e => e.active).forEach(emp => {
        const empRecs = (records || []).filter((r: any) => r.employee_id === emp.id);
        const porDia: Record<string, any[]> = {};
        empRecs.forEach((r: any) => {
          const dia = new Date(r.recorded_at).toISOString().slice(0, 10);
          if (!porDia[dia]) porDia[dia] = [];
          porDia[dia].push(r);
        });
        Object.entries(porDia).forEach(([dia, recs]) => {
          const tipos = recs.map((r: any) => r.record_type);
          const entrada = recs.find((r: any) => r.record_type === "entrada");
          const intervalo = recs.find((r: any) => r.record_type === "intervalo");
          const retorno = recs.find((r: any) => r.record_type === "retorno");
          const saida = recs.find((r: any) => r.record_type === "saida");
          const dataFmt = new Date(dia + "T12:00:00").toLocaleDateString("pt-BR");
          if (entrada && !saida) result.push({ nome: emp.name, tipo: "Sem saída", detalhe: `Dia ${dataFmt}` });
          if (intervalo && !retorno) result.push({ nome: emp.name, tipo: "Intervalo sem retorno", detalhe: `Dia ${dataFmt}` });
          if (entrada && saida) {
            const horas = (new Date(saida.recorded_at).getTime() - new Date(entrada.recorded_at).getTime()) / 3600000;
            if (horas > 10) result.push({ nome: emp.name, tipo: "Jornada excessiva", detalhe: `Dia ${dataFmt} — ${horas.toFixed(1)}h` });
          }
          const freq: Record<string, number> = {};
          tipos.forEach((t: string) => { freq[t] = (freq[t] || 0) + 1; });
          if (Object.values(freq).some(v => v > 1)) result.push({ nome: emp.name, tipo: "Registro duplicado", detalhe: `Dia ${dataFmt}` });
        });
      });
      setInconsistencias(result); setGerado(true);
    } catch (err: any) { toast.error("Erro: " + err.message); }
    finally { setLoading(false); }
  };

  const exportarPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 24, "F");
    doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
    doc.text("RELATÓRIO DE INCONSISTÊNCIAS", W / 2, 11, { align: "center" });
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(180, 200, 230);
    doc.text(`${MONTH_NAMES[mes - 1]}/${ano} — APA Ponto`, W / 2, 18, { align: "center" });
    let y = 30;
    doc.setFillColor(15, 23, 42); doc.rect(12, y, W - 24, 7, "F");
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
    doc.text("FUNCIONÁRIO", 14, y + 5); doc.text("TIPO", 80, y + 5); doc.text("DETALHE", 140, y + 5);
    y += 7; doc.setFont("helvetica", "normal"); doc.setTextColor(40, 40, 50);
    inconsistencias.forEach((inc, i) => {
      if (i % 2 === 0) { doc.setFillColor(250, 251, 253); doc.rect(12, y, W - 24, 6, "F"); }
      doc.text(inc.nome.slice(0, 30), 14, y + 4.5);
      doc.text(inc.tipo, 80, y + 4.5);
      doc.text(inc.detalhe, 140, y + 4.5);
      y += 6; if (y > 270) { doc.addPage(); y = 15; }
    });
    if (inconsistencias.length === 0) doc.text("Nenhuma inconsistência encontrada.", W / 2, y + 10, { align: "center" });
    doc.setFontSize(6.5); doc.setTextColor(120, 120, 130);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")} — APA Ponto`, W / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
    doc.save(`inconsistencias_${MONTH_NAMES[mes-1]}_${ano}.pdf`);
    addHistorico(`Relatório de Inconsistências — ${MONTH_NAMES[mes-1]}/${ano}`);
    toast.success("PDF gerado!");
  };

  const exportarExcel = () => {
    const rows = [["Funcionário", "Tipo", "Detalhe"], ...inconsistencias.map(i => [i.nome, i.tipo, i.detalhe])];
    const csv = rows.map(r => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `inconsistencias_${MONTH_NAMES[mes-1]}_${ano}.csv`; a.click();
    URL.revokeObjectURL(url);
    addHistorico(`Inconsistências Excel — ${MONTH_NAMES[mes-1]}/${ano}`);
    toast.success("Excel gerado!");
  };

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">⚠️ Relatório de inconsistências</p>
      <Card className="p-4 space-y-3">
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="text-xs text-muted-foreground font-medium">Mês</label>
            <select value={mes} onChange={e => setMes(Number(e.target.value))}
              className="mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm block">
              {MONTH_NAMES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Ano</label>
            <select value={ano} onChange={e => setAno(Number(e.target.value))}
              className="mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm block">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <Button size="sm" onClick={buscar} disabled={loading} variant="outline" className="gap-1">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
            Analisar
          </Button>
          {gerado && <>
            <Button size="sm" onClick={exportarPDF} className="gap-1"><FileDown className="w-4 h-4" /> PDF</Button>
            <Button size="sm" variant="outline" onClick={exportarExcel} className="gap-1"><FileSpreadsheet className="w-4 h-4" /> Excel</Button>
          </>}
        </div>
        {gerado && (inconsistencias.length === 0 ? (
          <p className="text-sm text-emerald-600 font-medium">✅ Nenhuma inconsistência em {MONTH_NAMES[mes-1]}/{ano}!</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            <p className="text-xs text-muted-foreground">{inconsistencias.length} inconsistência(s) encontrada(s)</p>
            {inconsistencias.map((inc, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-border/50">
                <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                <span className="font-medium text-foreground w-32 truncate">{inc.nome}</span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium">{inc.tipo}</span>
                <span className="text-muted-foreground">{inc.detalhe}</span>
              </div>
            ))}
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── Integração Contábil ───
function IntegracaoContabil({ employees, addHistorico }: {
  employees: Employee[];
  addHistorico: (desc: string) => void;
}) {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);

  const fmt = (v: any) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  const exportar = async () => {
    setLoading(true);
    try {
      // Busca payslips do período
      const { data: period } = await (supabase as any)
        .from("payroll_periods").select("id").eq("year", ano).eq("month", mes).maybeSingle();

      let payslips: any[] = [];
      if (period) {
        const { data: ps } = await (supabase as any)
          .from("payslips").select("*, employees(name, cpf, cargo, matricula, departamento)")
          .eq("period_id", period.id);
        payslips = ps || [];
      }

      // Se não tiver payslips, gera a partir dos funcionários ativos
      if (payslips.length === 0) {
        toast.info("Nenhuma folha calculada para este período. Calcule a folha primeiro em Folha de Pagamento → Fechamento.");
        setLoading(false);
        return;
      }

      const competencia = `${String(mes).padStart(2,"0")}/${ano}`;
      const agora = new Date().toLocaleString("pt-BR");

      // Cabeçalho do arquivo
      const linhas: string[] = [
        `;;ARQUIVO DE INTEGRAÇÃO CONTÁBIL — APA PONTO`,
        `;;Competência: ${competencia}`,
        `;;Gerado em: ${agora}`,
        `;;`,
        `MATRICULA;NOME;CPF;CARGO;DEPARTAMENTO;SALARIO_BASE;HORAS_TRABALHADAS;HORAS_EXTRAS_50;HORAS_EXTRAS_100;HORAS_NOTURNAS;FALTAS_DIAS;TOTAL_PROVENTOS;INSS;IRRF;DESCONTO_VT;TOTAL_DESCONTOS;LIQUIDO;FGTS`,
      ];

      payslips.forEach((ps: any) => {
        const emp = Array.isArray(ps.employees) ? ps.employees[0] : ps.employees;
        const cpfFormatado = (emp?.cpf || "").replace(/\D/g, "");

        // Busca INSS e IRRF do snapshot
        const snapshot = ps.snapshot || {};
        const inss = snapshot?.calculated?.inss || 0;
        const irrf = snapshot?.calculated?.irrf || 0;
        const vt = snapshot?.calculated?.vt || 0;

        linhas.push([
          emp?.matricula || "",
          emp?.name || "",
          cpfFormatado,
          emp?.cargo || "",
          emp?.departamento || "",
          Number(ps.snapshot?.settings?.salario_base || 0).toFixed(2),
          Number(ps.horas_trabalhadas || 0).toFixed(2),
          Number(ps.horas_extras_50 || 0).toFixed(2),
          Number(ps.horas_extras_100 || 0).toFixed(2),
          Number(ps.horas_noturnas || 0).toFixed(2),
          Number(ps.faltas_dias || 0).toFixed(0),
          Number(ps.total_proventos || 0).toFixed(2),
          Number(ps.base_inss || 0).toFixed(2),
          Number(ps.base_irrf || 0).toFixed(2),
          Number(vt).toFixed(2),
          Number(ps.total_descontos || 0).toFixed(2),
          Number(ps.liquido || 0).toFixed(2),
          Number(ps.fgts_mes || 0).toFixed(2),
        ].join(";"));
      });

      // Totais
      const totais = payslips.reduce((acc: any, ps: any) => ({
        proventos: acc.proventos + Number(ps.total_proventos || 0),
        descontos: acc.descontos + Number(ps.total_descontos || 0),
        liquido: acc.liquido + Number(ps.liquido || 0),
        fgts: acc.fgts + Number(ps.fgts_mes || 0),
      }), { proventos: 0, descontos: 0, liquido: 0, fgts: 0 });

      linhas.push(`;;`);
      linhas.push(`;;TOTAIS`);
      linhas.push(`;;Total proventos: R$ ${totais.proventos.toFixed(2)}`);
      linhas.push(`;;Total descontos: R$ ${totais.descontos.toFixed(2)}`);
      linhas.push(`;;Total líquido: R$ ${totais.liquido.toFixed(2)}`);
      linhas.push(`;;Total FGTS: R$ ${totais.fgts.toFixed(2)}`);
      linhas.push(`;;Funcionários: ${payslips.length}`);

      const csv = linhas.join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contabil_${String(mes).padStart(2,"0")}_${ano}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      addHistorico(`Integração Contábil — ${MONTH_NAMES[mes-1]}/${ano}`);
      toast.success(`Arquivo contábil gerado! ${payslips.length} funcionário(s).`);
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally { setLoading(false); }
  };

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        🧾 Integração contábil
      </p>
      <Card className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Exporta os dados da folha em CSV padrão compatível com qualquer software contábil (Domínio, Alterdata, TOTVS, etc).
        </p>
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="text-xs text-muted-foreground font-medium">Mês</label>
            <select value={mes} onChange={e => setMes(Number(e.target.value))}
              className="mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm block">
              {MONTH_NAMES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Ano</label>
            <select value={ano} onChange={e => setAno(Number(e.target.value))}
              className="mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm block">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <Button size="sm" onClick={exportar} disabled={loading} className="gap-1">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            Gerar arquivo contábil
          </Button>
        </div>
        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Campos exportados:</p>
          <p>Matrícula · Nome · CPF · Cargo · Departamento · Salário base · Horas trabalhadas · Horas extras · Horas noturnas · Faltas · Proventos · INSS · IRRF · VT · Descontos · Líquido · FGTS</p>
        </div>
      </Card>
    </div>
  );
}

// ─── Main Component ───
export default function ExportacoesTab({ employees }: { employees: Employee[] }) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [presets, setPresets] = useState<ExportPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem("apa_export_presets") || "[]"); } catch { return []; }
  });
  const [historico, setHistorico] = useState<HistoricoItem[]>(() => {
    try { return JSON.parse(localStorage.getItem("apa_export_historico") || "[]"); } catch { return []; }
  });
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<ExportPreset["tipo"]>("ponto_pdf");
  const [novoPeriodo, setNovoPeriodo] = useState<ExportPreset["periodo"]>("mes_atual");
  const [novoFuncionarios, setNovoFuncionarios] = useState<"todos" | string>("todos");
  const [novoMes, setNovoMes] = useState(new Date().getMonth() + 1);
  const [novoAno, setNovoAno] = useState(new Date().getFullYear());
  const [showNovoPreset, setShowNovoPreset] = useState(false);
  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);

  const savePresets = (p: ExportPreset[]) => {
    setPresets(p);
    localStorage.setItem("apa_export_presets", JSON.stringify(p));
  };

  const addHistorico = (desc: string) => {
    const item = { id: crypto.randomUUID(), descricao: desc, data: new Date().toISOString() };
    const novo = [item, ...historico].slice(0, 20);
    setHistorico(novo);
    localStorage.setItem("apa_export_historico", JSON.stringify(novo));
  };

  const runExport = async (tipo: ExportPreset["tipo"], mes: number, ano: number, empIds: string | "todos") => {
    const targetEmployees = empIds === "todos" ? employees.filter(e => e.active) : employees.filter(e => e.id === empIds);
    if (targetEmployees.length === 0) { toast.error("Nenhum funcionário encontrado"); return; }
    for (const emp of targetEmployees) {
      if (tipo === "ponto_pdf") await generateMonthlyReport(emp, ano, mes);
      else if (tipo === "ponto_excel") await generateMonthlyExcel(emp, ano, mes);
      else await generateMonthlyReport(emp, ano, mes);
    }
    const empLabel = empIds === "todos" ? "todos os funcionários" : targetEmployees[0]?.name;
    addHistorico(`${TIPO_LABELS[tipo]} — ${MONTH_NAMES[mes - 1]}/${ano} — ${empLabel}`);
    toast.success(`Exportação concluída! ${targetEmployees.length} arquivo(s) gerado(s).`);
  };

  const handleExportRapida = async (key: string, tipo: ExportPreset["tipo"], periodo: ExportPreset["periodo"]) => {
    setExporting(key);
    try {
      const { mes, ano } = getMesAno(periodo);
      await runExport(tipo, mes, ano, "todos");
    } catch (err: any) { toast.error("Erro: " + err.message); }
    finally { setExporting(null); }
  };

  const handleRunPreset = async (preset: ExportPreset) => {
    setExporting(preset.id);
    try {
      const { mes, ano } = getMesAno(preset.periodo, preset.mes, preset.ano);
      await runExport(preset.tipo, mes, ano, preset.funcionarios);
    } catch (err: any) { toast.error("Erro: " + err.message); }
    finally { setExporting(null); }
  };

  const salvarPreset = () => {
    if (!novoNome.trim()) { toast.error("Informe um nome para o preset"); return; }
    const novo: ExportPreset = {
      id: crypto.randomUUID(), nome: novoNome.trim(), tipo: novoTipo,
      periodo: novoPeriodo, funcionarios: novoFuncionarios,
      mes: novoPeriodo === "personalizado" ? novoMes : undefined,
      ano: novoPeriodo === "personalizado" ? novoAno : undefined,
      criado_em: new Date().toISOString(),
    };
    savePresets([...presets, novo]);
    setNovoNome(""); setShowNovoPreset(false);
    toast.success("Preset salvo!");
  };

  const excluirPreset = (id: string) => {
    if (!confirm("Excluir este preset?")) return;
    savePresets(presets.filter(p => p.id !== id));
  };

  const exportacoesRapidas = [
    { key: "ponto_pdf_atual", label: "Relatório de Ponto — Mês Atual", sub: "PDF • Todos os funcionários", tipo: "ponto_pdf" as const, periodo: "mes_atual" as const, icon: FileDown, color: "text-blue-600" },
    { key: "ponto_excel_atual", label: "Relatório de Ponto — Mês Atual", sub: "Excel • Todos os funcionários", tipo: "ponto_excel" as const, periodo: "mes_atual" as const, icon: FileSpreadsheet, color: "text-emerald-600" },
    { key: "ponto_pdf_anterior", label: "Relatório de Ponto — Mês Anterior", sub: "PDF • Todos os funcionários", tipo: "ponto_pdf" as const, periodo: "mes_anterior" as const, icon: FileDown, color: "text-blue-600" },
    { key: "ponto_excel_anterior", label: "Relatório de Ponto — Mês Anterior", sub: "Excel • Todos os funcionários", tipo: "ponto_excel" as const, periodo: "mes_anterior" as const, icon: FileSpreadsheet, color: "text-emerald-600" },
  ];

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
        <FileDown className="w-5 h-5 text-primary" />
        Relatórios
      </h2>

      {/* Exportações rápidas */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">⚡ Exportações rápidas</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {exportacoesRapidas.map(exp => (
            <Card key={exp.key} className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <exp.icon className={`w-5 h-5 flex-shrink-0 ${exp.color}`} />
                <div>
                  <p className="text-sm font-medium text-foreground">{exp.label}</p>
                  <p className="text-xs text-muted-foreground">{exp.sub}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" disabled={exporting === exp.key}
                onClick={() => handleExportRapida(exp.key, exp.tipo, exp.periodo)} className="gap-1 flex-shrink-0">
                {exporting === exp.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Exportar
              </Button>
            </Card>
          ))}
        </div>
      </div>

      {/* Relatório de inconsistências */}
      <InconsistenciasRelatorio employees={employees} addHistorico={addHistorico} />

      {/* Integração contábil */}
      <IntegracaoContabil employees={employees} addHistorico={addHistorico} />

      {/* Presets salvos */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">🔖 Exportações salvas</p>
          <Button size="sm" variant="outline" onClick={() => setShowNovoPreset(!showNovoPreset)} className="gap-1">
            <BookmarkPlus className="w-4 h-4" /> Novo preset
          </Button>
        </div>
        {showNovoPreset && (
          <Card className="p-4 mb-3 space-y-3 border-primary/30">
            <h4 className="text-sm font-semibold text-foreground">Configurar novo preset</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Nome do preset</Label>
                <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder='Ex: "Fechamento mensal"'
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div>
                <Label>Tipo de exportação</Label>
                <select value={novoTipo} onChange={e => setNovoTipo(e.target.value as any)}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <Label>Período</Label>
                <select value={novoPeriodo} onChange={e => setNovoPeriodo(e.target.value as any)}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="mes_atual">Mês atual</option>
                  <option value="mes_anterior">Mês anterior</option>
                  <option value="personalizado">Personalizado</option>
                </select>
              </div>
              <div>
                <Label>Funcionários</Label>
                <select value={novoFuncionarios} onChange={e => setNovoFuncionarios(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="todos">Todos os ativos</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              {novoPeriodo === "personalizado" && (<>
                <div>
                  <Label>Mês</Label>
                  <select value={novoMes} onChange={e => setNovoMes(Number(e.target.value))}
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {MONTH_NAMES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Ano</Label>
                  <select value={novoAno} onChange={e => setNovoAno(Number(e.target.value))}
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </>)}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={salvarPreset} className="gap-1"><BookmarkPlus className="w-4 h-4" /> Salvar preset</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNovoPreset(false)}>Cancelar</Button>
            </div>
          </Card>
        )}
        {presets.length === 0 ? (
          <Card className="p-8 text-center">
            <BookmarkPlus className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum preset salvo ainda.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {presets.map(preset => {
              const { mes, ano } = getMesAno(preset.periodo, preset.mes, preset.ano);
              const empLabel = preset.funcionarios === "todos" ? "Todos" : employees.find(e => e.id === preset.funcionarios)?.name || "—";
              return (
                <Card key={preset.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileDown className="w-5 h-5 flex-shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{preset.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">{TIPO_LABELS[preset.tipo]} · {MONTH_NAMES[mes-1]}/{ano} · {empLabel}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" disabled={exporting === preset.id} onClick={() => handleRunPreset(preset)} className="gap-1">
                      {exporting === preset.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      Exportar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => excluirPreset(preset.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Histórico */}
      {historico.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">🕐 Últimas exportações</p>
            <button onClick={() => { setHistorico([]); localStorage.removeItem("apa_export_historico"); }}
              className="text-xs text-muted-foreground hover:text-destructive">Limpar</button>
          </div>
          <div className="space-y-1.5">
            {historico.map(h => (
              <div key={h.id} className="flex items-center gap-2 text-xs text-muted-foreground py-1.5 border-b border-border/50">
                <Clock className="w-3 h-3 flex-shrink-0" />
                <span className="flex-1 truncate">{h.descricao}</span>
                <span className="flex-shrink-0">{new Date(h.data).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}