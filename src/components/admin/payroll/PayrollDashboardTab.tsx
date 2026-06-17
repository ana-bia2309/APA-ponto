import { useEffect, useState, useCallback } from "react";
import { SkeletonDashboard } from "@/components/ui/skeleton-card";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Users, TrendingUp, TrendingDown, Wallet, Clock, Calendar, RefreshCw, Sparkles } from "lucide-react";
import { summarizeWorkFromRecords, calculatePayroll } from "@/lib/payroll/calculator";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const fmt = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export default function PayrollDashboardTab() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    totalFolha: 0, totalFuncionarios: 0, custoExtras: 0,
    totalDescontos: 0, totalLiquido: 0, totalFgts: 0, faltasDias: 0,
  });
  const [evolucao, setEvolucao] = useState<any[]>([]);
  const [extrasData, setExtrasData] = useState<any[]>([]);
  const [payslipDetails, setPayslipDetails] = useState<any[]>([]);
  const [projecao, setProjecao] = useState<{
    confirmadoAteHoje: number;
    projecaoMesCompleto: number;
    funcionariosProjetados: number;
  } | null>(null);
  const [loadingProjecao, setLoadingProjecao] = useState(true);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: period } = await supabase
        .from("payroll_periods" as any)
        .select("id")
        .eq("year", year)
        .eq("month", month)
        .maybeSingle();

      if (period) {
        const { data: payslips } = await supabase
          .from("payslips" as any)
          .select("*")
          .eq("period_id", (period as any).id);

       const ps = (payslips as any[]) || [];
        setSummary({
          totalFolha: ps.reduce((a, p) => a + Number(p.total_proventos || 0), 0),
          totalFuncionarios: ps.length,
          custoExtras: ps.reduce((a, p) => a + Number(p.horas_extras_50 || 0) + Number(p.horas_extras_100 || 0), 0),
          totalDescontos: ps.reduce((a, p) => a + Number(p.total_descontos || 0), 0),
          totalLiquido: ps.reduce((a, p) => a + Number(p.liquido || 0), 0),
          totalFgts: ps.reduce((a, p) => a + Number(p.fgts_mes || 0), 0),
          faltasDias: ps.reduce((a, p) => a + Number(p.faltas_dias || 0), 0),
        });

        // Detalhe por funcionário para o gráfico
        setPayslipDetails(ps.map((p: any) => ({
          nome: (Array.isArray(p.employees) ? p.employees[0] : p.employees)?.name?.split(" ").slice(0, 2).join(" ") || "—",
          liquido: Number(p.liquido || 0),
          proventos: Number(p.total_proventos || 0),
        })).sort((a: any, b: any) => b.liquido - a.liquido));
      }

      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(year, month - 1 - i, 1);
        months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
      }

      const evolucaoData = await Promise.all(
        months.map(async ({ year: y, month: m }) => {
          const { data: p } = await supabase
            .from("payroll_periods" as any)
            .select("id")
            .eq("year", y).eq("month", m)
            .maybeSingle();

          if (!p) return { mes: MONTHS[m - 1], proventos: 0, liquido: 0, descontos: 0, extras: 0 };

          const { data: ps } = await supabase
            .from("payslips" as any)
            .select("total_proventos, liquido, total_descontos, horas_extras_50, horas_extras_100")
            .eq("period_id", (p as any).id);

          const arr = (ps as any[]) || [];
          return {
            mes: MONTHS[m - 1],
            proventos: arr.reduce((a, x) => a + Number(x.total_proventos || 0), 0),
            liquido: arr.reduce((a, x) => a + Number(x.liquido || 0), 0),
            descontos: arr.reduce((a, x) => a + Number(x.total_descontos || 0), 0),
            extras: arr.reduce((a, x) => a + Number(x.horas_extras_50 || 0) + Number(x.horas_extras_100 || 0), 0),
          };
        })
      );

      setEvolucao(evolucaoData);
      setExtrasData(evolucaoData.map((d) => ({ mes: d.mes, extras: d.extras })));
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  const loadProjecao = useCallback(async () => {
    setLoadingProjecao(true);
    try {
      const { data: employees } = await supabase.from("employees").select("*").eq("active", true);
      if (!employees) { setProjecao(null); return; }

      const diaHoje = now.getDate();
      const diasNoMes = new Date(year, month, 0).getDate();
      const diasRestantes = diasNoMes - diaHoje;

      const startIso = new Date(year, month - 1, 1).toISOString();
      const endIso = now.toISOString();

      let confirmadoTotal = 0;
      let projecaoTotal = 0;
      let contados = 0;

      for (const emp of employees) {
        const { data: settings } = await supabase
          .from("payroll_settings").select("*")
          .eq("employee_id", emp.id).maybeSingle();
        if (!settings) continue;

        const { data: records } = await supabase
          .from("time_records").select("record_type, recorded_at")
          .eq("employee_id", emp.id)
          .gte("recorded_at", startIso)
          .lte("recorded_at", endIso)
          .order("recorded_at");

        const work = summarizeWorkFromRecords(records || [], { cargaHorariaDiaria: 8, diasUteisPrevistos: diaHoje });
        work.dias_uteis_mes = diaHoje;
        work.dias_trabalhados = diaHoje - parseInt(work.faltas_dias as string || "0");

        const result = calculatePayroll(settings as any, work);
        confirmadoTotal += Number(result.liquido);

        // Projeção: estende horas extras proporcionalmente para os dias restantes
        const mediaExtras50PorDia = diaHoje > 0 ? Number(work.horas_extras_50) / diaHoje : 0;
        const mediaExtras100PorDia = diaHoje > 0 ? Number(work.horas_extras_100) / diaHoje : 0;
        const workProjetado = {
          ...work,
          horas_extras_50: (Number(work.horas_extras_50) + mediaExtras50PorDia * diasRestantes).toFixed(2),
          horas_extras_100: (Number(work.horas_extras_100) + mediaExtras100PorDia * diasRestantes).toFixed(2),
          dias_uteis_mes: diasNoMes,
          dias_trabalhados: diasNoMes,
          faltas_dias: "0",
        };
        const resultProjetado = calculatePayroll(settings as any, workProjetado);

        // Provisão mensal de férias (1/12 do salário + 1/3) e 13º (1/12 do salário)
        const salario = Number((settings as any).salario_base || 0);
        const provisaoFerias = (salario / 12) * (4 / 3); // 1/12 do salário com adicional de 1/3
        const provisao13 = salario / 12;

        projecaoTotal += Number(resultProjetado.liquido) + provisaoFerias + provisao13;
        contados++;
      }

      setProjecao({
        confirmadoAteHoje: confirmadoTotal,
        projecaoMesCompleto: projecaoTotal,
        funcionariosProjetados: contados,
      });
    } catch (e) {
      console.error("Erro na projeção:", e);
      setProjecao(null);
    } finally {
      setLoadingProjecao(false);
    }
  }, [year, month]);

  useEffect(() => { load(); loadProjecao(); }, [load, loadProjecao]);

 const cards = [
    { label: "Total da folha", value: fmt(summary.totalFolha), icon: Wallet, color: "text-blue-500" },
    { label: "Funcionários", value: summary.totalFuncionarios, icon: Users, color: "text-purple-500" },
    { label: "Horas extras (h)", value: summary.custoExtras.toFixed(1), icon: Clock, color: "text-amber-500" },
    { label: "Total descontos", value: fmt(summary.totalDescontos), icon: TrendingDown, color: "text-rose-500" },
    { label: "Total líquido", value: fmt(summary.totalLiquido), icon: TrendingUp, color: "text-emerald-500" },
    { label: "FGTS", value: fmt(summary.totalFgts), icon: Calendar, color: "text-cyan-500" },
    { label: "Custo médio/func.", value: summary.totalFuncionarios > 0 ? fmt(summary.totalFolha / summary.totalFuncionarios) : "R$ 0,00", icon: Users, color: "text-indigo-500" },
    { label: "Total faltas (dias)", value: String(summary.faltasDias), icon: TrendingDown, color: "text-orange-500" },
    { label: "Absenteísmo", value: summary.totalFuncionarios > 0 ? `${((summary.faltasDias / (summary.totalFuncionarios * 22)) * 100).toFixed(1)}%` : "0%", icon: TrendingDown, color: "text-rose-400" },
  ];

  if (loading) return <SkeletonDashboard />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Dashboard Financeiro</h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Projeção de custo do mês */}
      <Card className="p-5 border-2 border-blue-400/40 bg-blue-500/5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-blue-700 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Projeção de Custo — {MONTHS[month - 1]}/{year}
          </h3>
          {loadingProjecao && <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />}
        </div>
        {projecao ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Confirmado até hoje (dia {now.getDate()})</p>
              <p className="text-2xl font-bold text-foreground">{fmt(projecao.confirmadoAteHoje)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Projeção para o mês completo</p>
              <p className="text-2xl font-black text-blue-600">{fmt(projecao.projecaoMesCompleto)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {loadingProjecao ? "Calculando projeção..." : "Sem dados suficientes — cadastre salários em Parâmetros da Folha."}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground mt-3">
          💡 A projeção estende a média de horas extras para os dias restantes e inclui provisão mensal de férias (1/3) e 13º salário (1/12 cada). Não substitui o fechamento oficial da folha.
        </p>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map((card) => (
          <Card key={card.label} className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <card.icon className={`w-4 h-4 ${card.color}`} />
              {card.label}
            </div>
            <div className="text-xl font-bold">{loading ? "..." : card.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-4">Evolução da folha — últimos 6 meses</h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={evolucao}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => fmt(v)} />
            <Legend />
            <Line type="monotone" dataKey="proventos" name="Proventos" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="liquido" name="Líquido" stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="descontos" name="Descontos" stroke="#f43f5e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

    <Card className="p-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-4">Horas extras por mês</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={extrasData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="extras" name="Horas extras" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

<Card className="p-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-4">Comparativo mensal — proventos vs líquido</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={evolucao}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => fmt(v)} />
            <Legend />
            <Bar dataKey="proventos" name="Proventos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="liquido" name="Líquido" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="descontos" name="Descontos" fill="#f43f5e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Custo por funcionário */}
      {payslipDetails.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">Custo por funcionário — mês atual</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, payslipDetails.length * 40)}>
            <BarChart data={payslipDetails} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v/1000).toFixed(1)}k`} />
              <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={140} />
              <Tooltip formatter={(v: any) => fmt(v)} />
              <Bar dataKey="liquido" name="Líquido" fill="#10b981" radius={[0, 4, 4, 0]} />
              <Bar dataKey="proventos" name="Proventos" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}
