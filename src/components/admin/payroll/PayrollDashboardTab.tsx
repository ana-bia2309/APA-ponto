import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Users, TrendingUp, TrendingDown, Wallet, Clock, Calendar, RefreshCw } from "lucide-react";
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

  useEffect(() => { load(); }, [load]);

  const cards = [
    { label: "Total da folha", value: fmt(summary.totalFolha), icon: Wallet, color: "text-blue-500" },
    { label: "Funcionários", value: summary.totalFuncionarios, icon: Users, color: "text-purple-500" },
    { label: "Horas extras (h)", value: summary.custoExtras.toFixed(1), icon: Clock, color: "text-amber-500" },
    { label: "Total descontos", value: fmt(summary.totalDescontos), icon: TrendingDown, color: "text-rose-500" },
    { label: "Total líquido", value: fmt(summary.totalLiquido), icon: TrendingUp, color: "text-emerald-500" },
    { label: "FGTS", value: fmt(summary.totalFgts), icon: Calendar, color: "text-cyan-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Dashboard Financeiro</h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

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
    </div>
  );
}