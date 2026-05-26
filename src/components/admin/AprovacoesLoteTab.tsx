import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Lock, RefreshCw, Loader2, BarChart2, AlertTriangle, Check, Square, CheckSquare } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;

interface EmployeeRow {
  id: string;
  name: string;
  espelhoStatus: "aberto" | "fechado" | "assinado" | null;
  espelhoId: string | null;
  horasTrabalhadas: number;
  horasEsperadas: number;
  diferenca: number;
  bancoImportado: boolean;
}

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function fmtHoras(h: number) {
  const abs = Math.abs(h);
  const hh = Math.floor(abs);
  const mm = Math.round((abs - hh) * 60);
  return `${h < 0 ? "-" : ""}${hh}h${String(mm).padStart(2, "0")}`;
}

export default function AprovacoesLoteTab({ employees }: { employees: Employee[] }) {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");

  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month, 1).toISOString();

      const [closingsRes, recordsRes, bancoRes] = await Promise.all([
        (supabase as any).from("timesheet_closings")
          .select("id, employee_id, status, closed_at, accepted_at")
          .eq("month", month).eq("year", year),
        (supabase as any).from("time_records")
          .select("employee_id, record_type, recorded_at")
          .gte("recorded_at", start).lt("recorded_at", end),
        (supabase as any).from("banco_horas")
          .select("employee_id, descricao")
          .ilike("descricao", `%${MONTH_NAMES[month - 1]}/${year}%`),
      ]);

      const closings = closingsRes.data || [];
      const records = recordsRes.data || [];
      const bancoImportados = new Set((bancoRes.data || []).map((b: any) => b.employee_id));

      const newRows: EmployeeRow[] = await Promise.all(
        employees.filter(e => e.active).map(async emp => {
          const closing = closings.find((c: any) => c.employee_id === emp.id);

          // Calcula horas via RPC
          let horasTrabalhadas = 0, horasEsperadas = 0, diferenca = 0;
          try {
            const { data: calc } = await (supabase as any).rpc("calculate_banco_horas", {
              p_employee_id: emp.id, p_month: month, p_year: year,
            });
            if (calc && calc.length > 0) {
              horasTrabalhadas = calc.reduce((a: number, d: any) => a + Number(d.horas_trabalhadas), 0);
              horasEsperadas = calc.reduce((a: number, d: any) => a + Number(d.horas_esperadas), 0);
              diferenca = calc.reduce((a: number, d: any) => a + Number(d.diferenca), 0);
            }
          } catch {}

          return {
            id: emp.id,
            name: emp.name,
            espelhoStatus: closing?.status || null,
            espelhoId: closing?.id || null,
            horasTrabalhadas,
            horasEsperadas,
            diferenca,
            bancoImportado: bancoImportados.has(emp.id),
          };
        })
      );

      setRows(newRows);
    } catch (err: any) {
      toast.error("Erro ao carregar: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [month, year, employees]);

  useEffect(() => { load(); }, [load]);

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.id)));
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const selectedRows = rows.filter(r => selected.has(r.id));

  // Fechar espelhos em lote
  const handleFecharEspelhos = async () => {
    const targets = selectedRows.filter(r => r.espelhoStatus !== "assinado");
    if (targets.length === 0) { toast.info("Nenhum espelho para fechar nos selecionados."); return; }
    if (!confirm(`Fechar ${targets.length} espelho(s) de ponto? Os funcionários receberão para assinar.`)) return;

    setProcessing(true);
    setProgressTotal(targets.length);
    setProgress(0);
    setProgressLabel("Fechando espelhos...");

    const { data: { user } } = await supabase.auth.getUser();
    let ok = 0;

    for (const row of targets) {
      try {
        const payload = {
          employee_id: row.id,
          month, year,
          status: "fechado",
          closed_at: new Date().toISOString(),
          closed_by: user?.email || "admin",
        };
        if (row.espelhoId) {
          await (supabase as any).from("timesheet_closings").update(payload).eq("id", row.espelhoId);
        } else {
          await (supabase as any).from("timesheet_closings").insert(payload);
        }
        ok++;
      } catch {}
      setProgress(p => p + 1);
    }

    toast.success(`${ok} espelho(s) fechado(s) com sucesso!`);
    setProcessing(false);
    load();
  };

  // Importar banco de horas em lote
  const handleImportarBanco = async () => {
    const targets = selectedRows.filter(r => !r.bancoImportado && r.diferenca !== 0);
    if (targets.length === 0) { toast.info("Nenhum banco de horas para importar nos selecionados."); return; }
    if (!confirm(`Importar banco de horas de ${targets.length} funcionário(s) para ${MONTH_NAMES[month - 1]}/${year}?`)) return;

    setProcessing(true);
    setProgressTotal(targets.length);
    setProgress(0);
    setProgressLabel("Importando banco de horas...");

    let ok = 0;
    for (const row of targets) {
      try {
        const tipo = row.diferenca >= 0 ? "credito" : "debito";
        await (supabase as any).from("banco_horas").insert({
          employee_id: row.id,
          data: `${year}-${String(month).padStart(2, "0")}-01`,
          tipo,
          horas: Math.abs(row.diferenca),
          descricao: `Cálculo automático — ${MONTH_NAMES[month - 1]}/${year}`,
        });
        ok++;
      } catch {}
      setProgress(p => p + 1);
    }

    toast.success(`${ok} banco(s) de horas importado(s)!`);
    setProcessing(false);
    load();
  };

  const allSelected = selected.size === rows.length && rows.length > 0;
  const someSelected = selected.size > 0;

  const countAbertos = rows.filter(r => !r.espelhoStatus || r.espelhoStatus === "aberto").length;
  const countFechados = rows.filter(r => r.espelhoStatus === "fechado").length;
  const countAssinados = rows.filter(r => r.espelhoStatus === "assinado").length;
  const countBancoImportado = rows.filter(r => r.bancoImportado).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-primary" />
          Aprovações em Lote
        </h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Filtro de período */}
      <Card className="p-4">
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="text-xs text-muted-foreground font-medium">Mês</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm block">
              {MONTH_NAMES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Ano</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm block">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* Resumo */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{countAbertos}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Abertos</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-amber-500">{countFechados}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Aguardando assinatura</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-emerald-500">{countAssinados}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Assinados</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-500">{countBancoImportado}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Banco importado</p>
          </Card>
        </div>
      )}

      {/* Barra de progresso */}
      {processing && (
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <p className="text-sm font-medium">{progressLabel}</p>
            <span className="text-xs text-muted-foreground ml-auto">{progress}/{progressTotal}</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-2 bg-primary rounded-full transition-all"
              style={{ width: `${progressTotal > 0 ? (progress / progressTotal) * 100 : 0}%` }} />
          </div>
        </Card>
      )}

      {/* Ações em lote */}
      {someSelected && !processing && (
        <Card className="p-3 border-primary/30 bg-primary/5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-primary">{selected.size} selecionado(s)</span>
            <Button size="sm" onClick={handleFecharEspelhos} className="gap-1">
              <Lock className="w-4 h-4" /> Fechar espelhos
            </Button>
            <Button size="sm" variant="outline" onClick={handleImportarBanco} className="gap-1">
              <BarChart2 className="w-4 h-4" /> Importar banco de horas
            </Button>
          </div>
        </Card>
      )}

      {/* Tabela */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
        </div>
      ) : (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-3 w-10">
                  <button onClick={toggleAll}>
                    {allSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </th>
                <th className="p-3 text-left font-medium text-muted-foreground">Funcionário</th>
                <th className="p-3 text-center font-medium text-muted-foreground">Espelho</th>
                <th className="p-3 text-center font-medium text-muted-foreground">Horas</th>
                <th className="p-3 text-center font-medium text-muted-foreground">Diferença</th>
                <th className="p-3 text-center font-medium text-muted-foreground">Banco</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} onClick={() => toggleOne(row.id)}
                  className={`border-t border-border/50 cursor-pointer transition-colors ${selected.has(row.id) ? "bg-primary/5" : i % 2 === 0 ? "" : "bg-muted/10"} hover:bg-muted/20`}>
                  <td className="p-3 text-center">
                    {selected.has(row.id)
                      ? <CheckSquare className="w-4 h-4 text-primary mx-auto" />
                      : <Square className="w-4 h-4 text-muted-foreground mx-auto" />}
                  </td>
                  <td className="p-3 font-medium text-foreground">{row.name}</td>
                  <td className="p-3 text-center">
                    {row.espelhoStatus === "assinado" && <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[11px] font-bold">✓ Assinado</span>}
                    {row.espelhoStatus === "fechado" && <span className="px-2 py-0.5 rounded-full bg-amber-400 text-amber-900 text-[11px] font-bold">🔒 Aguardando</span>}
                    {(!row.espelhoStatus || row.espelhoStatus === "aberto") && <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px]">Aberto</span>}
                  </td>
                  <td className="p-3 text-center tabular-nums text-xs">
                    <span className="text-blue-600 font-medium">{fmtHoras(row.horasTrabalhadas)}</span>
                    <span className="text-muted-foreground"> / {fmtHoras(row.horasEsperadas)}</span>
                  </td>
                  <td className="p-3 text-center tabular-nums">
                    <span className={`text-xs font-semibold ${row.diferenca > 0 ? "text-emerald-600" : row.diferenca < 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                      {row.diferenca === 0 ? "—" : (row.diferenca > 0 ? "+" : "") + fmtHoras(row.diferenca)}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    {row.bancoImportado
                      ? <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}