import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Calculator, Lock, Unlock, RefreshCw, TrendingUp, Wallet, Receipt, Users, Trash2, Download } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { calculatePayroll, summarizeWorkFromRecords } from "@/lib/payroll/calculator";
import { generatePayrollReport } from "@/lib/generateReport";
import { getDiasUteisNoMes } from "@/lib/payroll/tables";
import { getDiasEsperadosTrabalho, buscarExcecoesEscala } from "@/lib/escala12x36";

type Employee = Tables<"employees">;

export default function PayrollClosingTab({ employees }: { employees: Employee[] }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [periodStatus, setPeriodStatus] = useState<"aberto" | "fechado">("aberto");
  const [payslips, setPayslips] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // null | "all" | employeeId | "close"

  const loadPeriod = async () => {
    const { data: period } = await supabase
      .from("payroll_periods")
      .select("*").eq("year", year).eq("month", month).maybeSingle();
    if (period) {
      setPeriodId(period.id);
      setPeriodStatus(period.status as "aberto" | "fechado");
      const { data: ps } = await supabase
        .from("payslips")
        .select("*, employees(name)").eq("period_id", period.id);
      setPayslips(ps || []);
    } else {
      setPeriodId(null); setPeriodStatus("aberto"); setPayslips([]);
    }
  };

  useEffect(() => { loadPeriod(); }, [year, month]);

  const ensurePeriod = async (): Promise<string> => {
    if (periodId) return periodId;
    const { data, error } = await supabase
      .from("payroll_periods")
      .insert({ year, month, status: "aberto" })
      .select().single();
    if (error) throw error;
    setPeriodId(data.id);
    return data.id;
  };

  const calcEmployee = async (emp: Employee, pid: string): Promise<boolean> => {
    const { data: settings } = await supabase
      .from("payroll_settings").select("*")
      .eq("employee_id", emp.id).maybeSingle();
    console.log("DEBUG settings:", settings);
    if (!settings) return false;

    const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
    const end = new Date(Date.UTC(year, month, 1)).toISOString();
    const { data: records } = await supabase
      .from("time_records").select("record_type, recorded_at")
      .eq("employee_id", emp.id)
      .gte("recorded_at", start).lt("recorded_at", end)
      .order("recorded_at");
    const { data: customs } = await supabase
      .from("payroll_custom_items").select("*")
      .eq("employee_id", emp.id).eq("active", true);

    // Busca parcelas de adiantamento pendentes para este funcionário neste mês/ano
    const { data: adiantamentosDoFuncionario } = await (supabase as any)
      .from("adiantamentos")
      .select("id")
      .eq("employee_id", emp.id);

    const idsAdiantamentos = (adiantamentosDoFuncionario || []).map((a: any) => a.id);

    let parcelasPendentes: any[] = [];
    if (idsAdiantamentos.length > 0) {
      const { data } = await (supabase as any)
        .from("adiantamento_parcelas")
        .select("id, valor, numero_parcela")
        .eq("ano", year).eq("mes", month).eq("descontada", false)
        .in("adiantamento_id", idsAdiantamentos);
      parcelasPendentes = data || [];
    }

    const primeiroDiaMes = new Date(year, month - 1, 1).toISOString().slice(0, 10);
    const ultimoDiaMes = new Date(year, month, 0).toISOString().slice(0, 10);
    const isEscala12x36 = (emp as any).escala === "12x36" && !!(emp as any).escala_referencia_data;

    let diasPrevistos: number;
    let cargaHorariaDiaria: number;

    if (isEscala12x36) {
      const excecoes = await buscarExcecoesEscala(emp.id, primeiroDiaMes, ultimoDiaMes);
      diasPrevistos = getDiasEsperadosTrabalho(
        (emp as any).escala_referencia_data, primeiroDiaMes, ultimoDiaMes, excecoes,
      ).length;
      cargaHorariaDiaria = Number((emp as any).carga_horaria_turno) || 11;
    } else {
      diasPrevistos = getDiasUteisNoMes(year, month);
      cargaHorariaDiaria = 8;
    }

    const work = summarizeWorkFromRecords(records || [], { cargaHorariaDiaria, diasUteisPrevistos: diasPrevistos });
    work.dias_uteis_mes = diasPrevistos;
    work.dias_trabalhados = parseInt(work.faltas_dias as string) >= 0
  
      ? diasPrevistos - parseInt(work.faltas_dias as string)
      : diasPrevistos;
      work.horas_falta_dia = cargaHorariaDiaria;
    const customItems = (customs || []).map((c: any) => ({
      kind: c.kind, code: "C", description: c.description, amount: String(c.amount),
    }));
    const parcelasItems = (parcelasPendentes || []).map((p: any) => ({
      kind: "desconto" as const, code: "ADT", description: `Adiantamento — parcela ${p.numero_parcela}`,
      amount: String(p.valor),
    }));
    const result = calculatePayroll(settings as any, { ...work, custom_items: [...customItems, ...parcelasItems] });

    const totalAdiantamentos = parcelasPendentes.reduce((acc, p) => acc + Number(p.valor), 0);

    const payload = {
      period_id: pid, employee_id: emp.id,
      total_proventos: result.total_proventos,
      total_descontos: result.total_descontos,
      liquido: result.liquido,
      base_inss: result.base_inss,
      base_irrf: result.base_irrf,
      fgts_mes: result.fgts,
      horas_trabalhadas: work.horas_trabalhadas,
      horas_extras_50: work.horas_extras_50,
      horas_extras_100: work.horas_extras_100,
      horas_noturnas: work.horas_noturnas,
      faltas_dias: work.faltas_dias,
      atrasos_minutos: work.atrasos_minutos,
      snapshot: { settings, work, calculated_at: new Date().toISOString(), total_adiantamentos: totalAdiantamentos },
    };
    const { data: ps, error } = await supabase
      .from("payslips")
      .upsert(payload as any, { onConflict: "period_id,employee_id" })
      .select().single();
    if (error) { console.error("PAYSLIP ERROR:", JSON.stringify(error)); return false; }
    await supabase.from("payroll_items").delete().eq("payslip_id", ps.id);
    const itemRows = result.items.map((it, idx) => ({
      payslip_id: ps.id, kind: it.kind, code: it.code,
      description: it.description, reference: it.reference || null,
      amount: Number(it.amount), sort_order: idx,
    }));
    if (itemRows.length) await supabase.from("payroll_items").insert(itemRows);

    // Marca as parcelas de adiantamento deste mês como descontadas
    if (parcelasPendentes && parcelasPendentes.length > 0) {
      await (supabase as any)
        .from("adiantamento_parcelas")
        .update({ descontada: true, payslip_id: ps.id })
        .in("id", parcelasPendentes.map((p: any) => p.id));
    }

    return true;
  };

  const calcAll = async () => {
    if (periodStatus === "fechado") {
      toast.error("Competência fechada. Reabra para recalcular.");
      return;
    }
    setBusy("all");
    try {
      const pid = await ensurePeriod();
      let ok = 0;
      for (const emp of employees) if (await calcEmployee(emp, pid)) ok++;
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase as any).from("audit_logs").insert({
        action: "payroll_calculated_all",
        table_name: "payroll_period",
        record_id: pid,
        user_email: user?.email || null,
        details: { year, month, processed: ok, total: employees.length },
      });
      await loadPeriod();
      toast.success(`Folha calculada (${ok}/${employees.length})`);
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally { setBusy(null); }
  };

  const calcOne = async (emp: Employee) => {
    if (periodStatus === "fechado") {
      toast.error("Competência fechada. Reabra para recalcular.");
      return;
    }
    setBusy(emp.id);
    try {
      const pid = await ensurePeriod();
      const ok = await calcEmployee(emp, pid);
      if (!ok) { toast.error("Configure o salário do colaborador"); return; }
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase as any).from("audit_logs").insert({
        action: "payroll_calculated_employee",
        table_name: "payslip",
        record_id: emp.id,
        user_email: user?.email || null,
        details: { year, month, employee_name: emp.name },
      });
      await loadPeriod();
      toast.success(`${emp.name} recalculado`);
    } finally { setBusy(null); }
  };

  const closePeriod = async () => {
    if (!periodId) { toast.error("Calcule a folha primeiro"); return; }
    setBusy("close");
    try {
      const { data, error } = await supabase.functions.invoke("auto-close-payroll", {
        body: { year, month },
      });
      if (error) throw error;
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase as any).from("audit_logs").insert({
        action: "payroll_period_closed",
        table_name: "payroll_period",
        record_id: periodId,
        user_email: user?.email || null,
        details: { year, month, totals: (data as any)?.totals },
      });
      await loadPeriod();
      toast.success("Competência fechada e auditada!");
    } catch (e: any) {
      toast.error("Erro ao fechar: " + e.message);
    } finally { setBusy(null); }
  };

  const reopenPeriod = async () => {
    if (!periodId) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("payroll_periods").update({
      status: "aberto", closed_at: null, closed_by: null,
    }).eq("id", periodId);
    await (supabase as any).from("audit_logs").insert({
      action: "payroll_period_reopened",
      table_name: "payroll_period",
      record_id: periodId,
      user_email: user?.email || null,
      details: { year, month },
    });
    setPeriodStatus("aberto");
    toast.success("Competência reaberta!");
  };

  const deletePayslip = async (emp: Employee) => {
    if (!periodId) return;
    if (!confirm(`Excluir holerite de ${emp.name}?`)) return;
    const ps = payslips.find((p) => p.employee_id === emp.id);
    if (!ps) return;
    await supabase.from("payroll_items").delete().eq("payslip_id", ps.id);
    await supabase.from("payslips").delete().eq("id", ps.id);
    await loadPeriod();
    toast.success(`Holerite de ${emp.name} excluído.`);
  };
  const summary = useMemo(() => {
    return payslips.reduce(
      (a, p) => ({
        proventos: a.proventos + Number(p.total_proventos || 0),
        descontos: a.descontos + Number(p.total_descontos || 0),
        liquido: a.liquido + Number(p.liquido || 0),
        fgts: a.fgts + Number(p.fgts_mes || 0),
      }),
      { proventos: 0, descontos: 0, liquido: 0, fgts: 0 },
    );
  }, [payslips]);

  const fmt = (v: any) => "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div>
          <Label>Ano</Label>
          <Input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="w-28" />
        </div>
        <div>
          <Label>Mês</Label>
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
            ))}
          </select>
        </div>
        <Button onClick={calcAll} disabled={!!busy || periodStatus === "fechado"} className="gap-2">
          {busy === "all" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
          Calcular Todos
        </Button>
        {periodStatus === "aberto" ? (
          <Button onClick={closePeriod} disabled={!!busy || !periodId} variant="secondary" className="gap-2">
            {busy === "close" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Fechar Competência
          </Button>
        ) : (
          <Button onClick={reopenPeriod} variant="outline" className="gap-2">
            <Unlock className="w-4 h-4" /> Reabrir
          </Button>
        )}
        <span className={`text-xs px-2 py-1 rounded ${periodStatus === "fechado" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
          {periodStatus.toUpperCase()}
        </span>
        {periodId && (
          <Button
            variant="outline"
            className="gap-2"
            onClick={async () => {
              try {
                await generatePayrollReport(year, month);
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          >
            <Download className="w-4 h-4" /> Exportar PDF
          </Button>
        )}
      </Card>

      {payslips.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="w-3 h-3" />Holerites</div>
            <div className="text-2xl font-bold mt-1">{payslips.length}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="w-3 h-3" />Proventos</div>
            <div className="text-2xl font-bold mt-1 text-emerald-400">{fmt(summary.proventos)}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Receipt className="w-3 h-3" />Descontos</div>
            <div className="text-2xl font-bold mt-1 text-rose-400">{fmt(summary.descontos)}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Wallet className="w-3 h-3" />Líquido</div>
            <div className="text-2xl font-bold mt-1">{fmt(summary.liquido)}</div>
          </Card>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Funcionário</th>
              <th className="p-3 text-right">Proventos</th>
              <th className="p-3 text-right">Descontos</th>
              <th className="p-3 text-right">Adiantamento</th>
              <th className="p-3 text-right">Líquido</th>
              <th className="p-3 text-right">FGTS</th>
              <th className="p-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
      {employees.map((emp) => {
              const ps = payslips.find((p) => p.employee_id === emp.id);
              return (
                <tr key={emp.id} className="border-t border-border/50">
                  <td className="p-3">{emp.name}</td>
                  <td className="p-3 text-right text-emerald-400">{ps ? fmt(ps.total_proventos) : "—"}</td>
                  <td className="p-3 text-right text-rose-400">{ps ? fmt(ps.total_descontos) : "—"}</td>
                  <td className="p-3 text-right">
                    {ps && Number(ps.snapshot?.total_adiantamentos || 0) > 0 ? (
                      <span className="text-amber-500 font-medium">{fmt(ps.snapshot.total_adiantamentos)}</span>
                    ) : "—"}
                  </td>
                  <td className="p-3 text-right font-bold">{ps ? fmt(ps.liquido) : "—"}</td>
                  <td className="p-3 text-right text-muted-foreground">{ps ? fmt(ps.fgts_mes) : "—"}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => calcOne(emp)}
                        disabled={!!busy || periodStatus === "fechado"} className="gap-1">
                        {busy === emp.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Calculator className="w-3 h-3" />}
                        Recalcular
                      </Button>
                      {ps && (
                        <Button size="sm" variant="ghost" onClick={() => deletePayslip(emp)}
                          disabled={!!busy || periodStatus === "fechado"}
                          className="gap-1 text-destructive hover:text-destructive">
                          <Trash2 className="w-3 h-3" />
                          Excluir
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
