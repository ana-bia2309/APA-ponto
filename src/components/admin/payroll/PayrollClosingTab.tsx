import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Calculator, Lock, Unlock, RefreshCw } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { calculatePayroll, summarizeWorkFromRecords } from "@/lib/payroll/calculator";

type Employee = Tables<"employees">;

export default function PayrollClosingTab({ employees }: { employees: Employee[] }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [periodStatus, setPeriodStatus] = useState<"aberto"|"fechado">("aberto");
  const [payslips, setPayslips] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const loadPeriod = async () => {
    const { data: period } = await supabase
      .from("payroll_periods" as any)
      .select("*").eq("year", year).eq("month", month).maybeSingle();
    if (period) {
      setPeriodId((period as any).id);
      setPeriodStatus((period as any).status);
      const { data: ps } = await supabase
        .from("payslips" as any)
        .select("*, employees(name)").eq("period_id", (period as any).id);
      setPayslips((ps as any) || []);
    } else {
      setPeriodId(null); setPeriodStatus("aberto"); setPayslips([]);
    }
  };

  useEffect(() => { loadPeriod(); }, [year, month]);

  const ensurePeriod = async (): Promise<string> => {
    if (periodId) return periodId;
    const { data, error } = await supabase
      .from("payroll_periods" as any)
      .insert({ year, month, status: "aberto" } as any)
      .select().single();
    if (error) throw error;
    setPeriodId((data as any).id);
    return (data as any).id;
  };

  const calcAll = async () => {
    if (periodStatus === "fechado") {
      toast.error("Competência fechada. Reabra para recalcular.");
      return;
    }
    setBusy(true);
    try {
      const pid = await ensurePeriod();
      const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
      const end = new Date(Date.UTC(year, month, 1)).toISOString();

      for (const emp of employees) {
        const { data: settings } = await supabase
          .from("payroll_settings" as any).select("*")
          .eq("employee_id", emp.id).maybeSingle();
        if (!settings) continue;

        const { data: records } = await supabase
          .from("time_records").select("record_type, recorded_at")
          .eq("employee_id", emp.id)
          .gte("recorded_at", start).lt("recorded_at", end)
          .order("recorded_at");

        const { data: customs } = await supabase
          .from("payroll_custom_items" as any).select("*")
          .eq("employee_id", emp.id).eq("active", true);

        const work = summarizeWorkFromRecords(records || []);
        const customItems = ((customs as any[]) || []).map((c: any) => ({
          kind: c.kind, code: "C", description: c.description, amount: String(c.amount),
        }));
        const result = calculatePayroll(settings as any, { ...work, custom_items: customItems });

        // upsert payslip
        const payslipPayload = {
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
          snapshot: { settings, work, calculated_at: new Date().toISOString() },
        };
        const { data: ps, error: psErr } = await supabase
          .from("payslips" as any)
          .upsert(payslipPayload as any, { onConflict: "period_id,employee_id" })
          .select().single();
        if (psErr) { console.error(psErr); continue; }
        await supabase.from("payroll_items" as any).delete().eq("payslip_id", (ps as any).id);
        const itemRows = result.items.map((it, idx) => ({
          payslip_id: (ps as any).id, kind: it.kind, code: it.code,
          description: it.description, reference: it.reference || null,
          amount: it.amount, sort_order: idx,
        }));
        if (itemRows.length) await supabase.from("payroll_items" as any).insert(itemRows as any);
      }
      await loadPeriod();
      toast.success("Folha calculada!");
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally { setBusy(false); }
  };

  const toggleClose = async () => {
    if (!periodId) return;
    const newStatus = periodStatus === "aberto" ? "fechado" : "aberto";
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("payroll_periods" as any).update({
      status: newStatus,
      closed_at: newStatus === "fechado" ? new Date().toISOString() : null,
      closed_by: newStatus === "fechado" ? user?.id : null,
    } as any).eq("id", periodId);
    setPeriodStatus(newStatus);
    toast.success(newStatus === "fechado" ? "Competência fechada!" : "Competência reaberta!");
  };

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
            {Array.from({length:12},(_,i)=>i+1).map((m)=>(
              <option key={m} value={m}>{String(m).padStart(2,"0")}</option>
            ))}
          </select>
        </div>
        <Button onClick={calcAll} disabled={busy || periodStatus === "fechado"} className="gap-2">
          {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
          Calcular Folha
        </Button>
        {periodId && (
          <Button onClick={toggleClose} variant={periodStatus === "fechado" ? "outline" : "secondary"} className="gap-2">
            {periodStatus === "fechado" ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            {periodStatus === "fechado" ? "Reabrir" : "Fechar Competência"}
          </Button>
        )}
        <span className={`text-xs px-2 py-1 rounded ${periodStatus === "fechado" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
          {periodStatus.toUpperCase()}
        </span>
      </Card>

      {payslips.length > 0 ? (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-3">Funcionário</th>
                <th className="p-3 text-right">Proventos</th>
                <th className="p-3 text-right">Descontos</th>
                <th className="p-3 text-right">Líquido</th>
                <th className="p-3 text-right">FGTS</th>
              </tr>
            </thead>
            <tbody>
              {payslips.map((p) => (
                <tr key={p.id} className="border-t border-border/50">
                  <td className="p-3">{p.employees?.name}</td>
                  <td className="p-3 text-right text-emerald-400">{fmt(p.total_proventos)}</td>
                  <td className="p-3 text-right text-rose-400">{fmt(p.total_descontos)}</td>
                  <td className="p-3 text-right font-bold">{fmt(p.liquido)}</td>
                  <td className="p-3 text-right text-muted-foreground">{fmt(p.fgts_mes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhum holerite gerado. Configure os salários e clique em "Calcular Folha".
        </p>
      )}
    </div>
  );
}
