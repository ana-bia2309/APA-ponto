import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, Zap, BookmarkPlus, Trash2, Loader2, Clock } from "lucide-react";
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

export default function ExportacoesTab({ employees }: { employees: Employee[] }) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [presets, setPresets] = useState<ExportPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem("apa_export_presets") || "[]"); } catch { return []; }
  });
  const [historico, setHistorico] = useState<HistoricoItem[]>(() => {
    try { return JSON.parse(localStorage.getItem("apa_export_historico") || "[]"); } catch { return []; }
  });

  // Novo preset form
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<ExportPreset["tipo"]>("ponto_pdf");
  const [novoPeriodo, setNovoPeriodo] = useState<ExportPreset["periodo"]>("mes_atual");
  const [novoFuncionarios, setNovoFuncionarios] = useState<"todos" | string>("todos");
  const [novoMes, setNovoMes] = useState(new Date().getMonth() + 1);
  const [novoAno, setNovoAno] = useState(new Date().getFullYear());
  const [showNovoPreset, setShowNovoPreset] = useState(false);

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
    const targetEmployees = empIds === "todos"
      ? employees.filter(e => e.active)
      : employees.filter(e => e.id === empIds);

    if (targetEmployees.length === 0) { toast.error("Nenhum funcionário encontrado"); return; }

    for (const emp of targetEmployees) {
      if (tipo === "ponto_pdf") await generateMonthlyReport(emp, ano, mes);
      else if (tipo === "ponto_excel") await generateMonthlyExcel(emp, ano, mes);
      else if (tipo === "espelho_pdf" || tipo === "espelho_excel") {
        // Gera espelho via EspelhoPontoTab logic inline
        await generateMonthlyReport(emp, ano, mes);
      }
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
    } catch (err: any) {
      toast.error("Erro ao exportar: " + err.message);
    } finally {
      setExporting(null);
    }
  };

  const handleRunPreset = async (preset: ExportPreset) => {
    setExporting(preset.id);
    try {
      const { mes, ano } = getMesAno(preset.periodo, preset.mes, preset.ano);
      await runExport(preset.tipo, mes, ano, preset.funcionarios);
    } catch (err: any) {
      toast.error("Erro ao exportar: " + err.message);
    } finally {
      setExporting(null);
    }
  };

  const salvarPreset = () => {
    if (!novoNome.trim()) { toast.error("Informe um nome para o preset"); return; }
    const novo: ExportPreset = {
      id: crypto.randomUUID(),
      nome: novoNome.trim(),
      tipo: novoTipo,
      periodo: novoPeriodo,
      funcionarios: novoFuncionarios,
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

  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);

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
        Exportações
      </h2>

      {/* Exportações rápidas */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          ⚡ Exportações rápidas
        </p>
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
                onClick={() => handleExportRapida(exp.key, exp.tipo, exp.periodo)}
                className="gap-1 flex-shrink-0">
                {exporting === exp.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Exportar
              </Button>
            </Card>
          ))}
        </div>
      </div>

      {/* Presets salvos */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            🔖 Exportações salvas
          </p>
          <Button size="sm" variant="outline" onClick={() => setShowNovoPreset(!showNovoPreset)} className="gap-1">
            <BookmarkPlus className="w-4 h-4" /> Novo preset
          </Button>
        </div>

        {/* Form novo preset */}
        {showNovoPreset && (
          <Card className="p-4 mb-3 space-y-3 border-primary/30">
            <h4 className="text-sm font-semibold text-foreground">Configurar novo preset</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Nome do preset</Label>
                <input value={novoNome} onChange={e => setNovoNome(e.target.value)}
                  placeholder='Ex: "Fechamento mensal"'
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
              {novoPeriodo === "personalizado" && (
                <>
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
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={salvarPreset} className="gap-1">
                <BookmarkPlus className="w-4 h-4" /> Salvar preset
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNovoPreset(false)}>Cancelar</Button>
            </div>
          </Card>
        )}

        {presets.length === 0 ? (
          <Card className="p-8 text-center">
            <BookmarkPlus className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum preset salvo ainda.</p>
            <p className="text-xs text-muted-foreground mt-1">Crie um preset para exportar com 1 clique.</p>
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
                      <p className="text-xs text-muted-foreground truncate">
                        {TIPO_LABELS[preset.tipo]} · {MONTH_NAMES[mes-1]}/{ano} · {empLabel}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" disabled={exporting === preset.id}
                      onClick={() => handleRunPreset(preset)} className="gap-1">
                      {exporting === preset.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      Exportar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => excluirPreset(preset.id)}
                      className="text-destructive hover:text-destructive">
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
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              🕐 Últimas exportações
            </p>
            <button onClick={() => { setHistorico([]); localStorage.removeItem("apa_export_historico"); }}
              className="text-xs text-muted-foreground hover:text-destructive">
              Limpar
            </button>
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