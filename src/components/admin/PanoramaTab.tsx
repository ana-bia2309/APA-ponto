import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, TrendingUp, TrendingDown, Users, Clock, Calendar, Award } from "lucide-react";

interface PanoramaData {
  totalAtivos: number;
  presentesHoje: number;
  ausентesHoje: number;
  atrasadosHoje: number;
  horasExtrasMes: number;
  faltasMes: number;
  mediaHorasDia: number;
  aniversarianteMes: { name: string; data_nascimento: string }[];
  topPontuais: { name: string; dias: number }[];
  proximosFeriados: { nome: string; data: string; dias: number }[];
  presencaSemana: { dia: string; presentes: number; total: number }[];
}

const FERIADOS = [
  { data: "2026-06-04", nome: "Corpus Christi" },
  { data: "2026-09-07", nome: "Independência do Brasil" },
  { data: "2026-10-12", nome: "Nossa Sra. Aparecida" },
  { data: "2026-11-02", nome: "Finados" },
  { data: "2026-11-15", nome: "Proclamação da República" },
  { data: "2026-11-20", nome: "Consciência Negra" },
  { data: "2026-12-25", nome: "Natal" },
  { data: "2027-01-01", nome: "Ano Novo" },
];

function fmtHoras(h: number) {
  const hh = Math.floor(Math.abs(h));
  const mm = Math.round((Math.abs(h) - hh) * 60);
  return `${hh}h${String(mm).padStart(2, "0")}`;
}

export default function PanoramaTab() {
  const [data, setData] = useState<PanoramaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const spFormatter = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Sao_Paulo",
        year: "numeric", month: "2-digit", day: "2-digit",
      });
      const todayStr = spFormatter.format(now);
      const startOfDay = new Date(`${todayStr}T00:00:00-03:00`).toISOString();
      const endOfDay = new Date(`${todayStr}T23:59:59-03:00`).toISOString();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [empRes, todayRecords, monthRecords] = await Promise.all([
        (supabase as any).from("employees").select("id, name, active, data_admissao").eq("active", true),
        (supabase as any).from("time_records").select("employee_id, record_type, recorded_at")
          .gte("recorded_at", startOfDay).lte("recorded_at", endOfDay),
        (supabase as any).from("time_records").select("employee_id, record_type, recorded_at")
          .gte("recorded_at", startOfMonth).lte("recorded_at", endOfDay),
      ]);

      const employees = empRes.data || [];
      const todayRecs = todayRecords.data || [];
      const monthRecs = monthRecords.data || [];
      const totalAtivos = employees.length;

      // Presença hoje
      const comEntrada = new Set(todayRecs.filter((r: any) => r.record_type === "entrada").map((r: any) => r.employee_id));
      const comSaida = new Set(todayRecs.filter((r: any) => r.record_type === "saida").map((r: any) => r.employee_id));
      const presentesHoje = comEntrada.size;
      const ausентesHoje = totalAtivos - presentesHoje;

      // Atrasados hoje
      const atrasadosHoje = todayRecs.filter((r: any) => {
        if (r.record_type !== "entrada") return false;
        const h = new Date(r.recorded_at).getHours();
        const m = new Date(r.recorded_at).getMinutes();
        return h > 8 || (h === 8 && m > 15);
      }).length;

      // Horas extras no mês
      let horasExtrasMes = 0;
      const porDiaEmp: Record<string, Record<string, any[]>> = {};
      monthRecs.forEach((r: any) => {
        const dia = r.recorded_at.slice(0, 10);
        if (!porDiaEmp[r.employee_id]) porDiaEmp[r.employee_id] = {};
        if (!porDiaEmp[r.employee_id][dia]) porDiaEmp[r.employee_id][dia] = [];
        porDiaEmp[r.employee_id][dia].push(r);
      });

      let totalHorasMes = 0;
      let diasComRegistro = 0;
      let faltasMes = 0;

      Object.values(porDiaEmp).forEach(dias => {
        Object.values(dias).forEach(recs => {
          const entrada = recs.find((r: any) => r.record_type === "entrada");
          const saida = recs.find((r: any) => r.record_type === "saida");
          const intervalo = recs.find((r: any) => r.record_type === "intervalo");
          const retorno = recs.find((r: any) => r.record_type === "retorno");
          if (entrada && saida) {
            const manha = intervalo
              ? (new Date(intervalo.recorded_at).getTime() - new Date(entrada.recorded_at).getTime()) / 3600000
              : (new Date(saida.recorded_at).getTime() - new Date(entrada.recorded_at).getTime()) / 3600000;
            const tarde = retorno ? (new Date(saida.recorded_at).getTime() - new Date(retorno.recorded_at).getTime()) / 3600000 : 0;
            const horas = intervalo ? manha + tarde : manha;
            totalHorasMes += horas;
            diasComRegistro++;
            if (horas > 8) horasExtrasMes += horas - 8;
          }
        });
      });

      const mediaHorasDia = diasComRegistro > 0 ? totalHorasMes / diasComRegistro : 0;

      // Top pontuais (menos atrasos no mês)
      const atrasosPorEmp: Record<string, number> = {};
      const diasPorEmp: Record<string, number> = {};
      monthRecs.forEach((r: any) => {
        if (r.record_type === "entrada") {
          if (!diasPorEmp[r.employee_id]) diasPorEmp[r.employee_id] = 0;
          diasPorEmp[r.employee_id]++;
          const h = new Date(r.recorded_at).getHours();
          const m = new Date(r.recorded_at).getMinutes();
          if (h > 8 || (h === 8 && m > 15)) {
            if (!atrasosPorEmp[r.employee_id]) atrasosPorEmp[r.employee_id] = 0;
            atrasosPorEmp[r.employee_id]++;
          }
        }
      });

      const topPontuais = employees
        .filter((e: any) => diasPorEmp[e.id] >= 3)
        .map((e: any) => ({
          name: e.name,
          dias: diasPorEmp[e.id] - (atrasosPorEmp[e.id] || 0),
        }))
        .sort((a: any, b: any) => b.dias - a.dias)
        .slice(0, 3);

      // Próximos feriados
      const hoje = new Date();
      const proximosFeriados = FERIADOS
        .map(f => ({ ...f, date: new Date(f.data + "T12:00:00") }))
        .filter(f => f.date >= hoje)
        .slice(0, 3)
        .map(f => ({
          nome: f.nome,
          data: f.data,
          dias: Math.ceil((f.date.getTime() - hoje.getTime()) / 86400000),
        }));

      // Presença por dia da semana (últimos 7 dias)
      const diasSemana = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dStr = spFormatter.format(d);
        const nomes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
        const presentes = new Set(
          monthRecs.filter((r: any) => r.record_type === "entrada" && r.recorded_at.startsWith(dStr))
            .map((r: any) => r.employee_id)
        ).size;
        diasSemana.push({ dia: nomes[d.getDay()], presentes, total: totalAtivos });
      }

      setData({
        totalAtivos,
        presentesHoje,
        ausентesHoje,
        atrasadosHoje,
        horasExtrasMes: Math.round(horasExtrasMes * 10) / 10,
        faltasMes,
        mediaHorasDia: Math.round(mediaHorasDia * 10) / 10,
        aniversarianteMes: [],
        topPontuais,
        proximosFeriados,
        presencaSemana: diasSemana,
      });
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (!data) return null;

  const presencaPct = data.totalAtivos > 0 ? Math.round((data.presentesHoje / data.totalAtivos) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">📊 Panorama da Empresa</h2>
          <p className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            {lastUpdated && ` · Atualizado às ${lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Ativos", value: data.totalAtivos, icon: Users, color: "#1e40af", bg: "#eff6ff", sub: "colaboradores" },
          { label: "Presentes Hoje", value: `${data.presentesHoje} (${presencaPct}%)`, icon: TrendingUp, color: "#15803d", bg: "#f0fdf4", sub: `${data.ausентesHoje} ausentes` },
          { label: "Atrasados Hoje", value: data.atrasadosHoje, icon: Clock, color: "#b45309", bg: "#fffbeb", sub: "após 08h15" },
          { label: "HE no Mês", value: `+${fmtHoras(data.horasExtrasMes)}`, icon: TrendingUp, color: "#7c3aed", bg: "#f5f3ff", sub: "horas extras" },
        ].map((kpi, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{kpi.label}</p>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: kpi.bg }}>
                <kpi.icon className="w-3.5 h-3.5" style={{ color: kpi.color }} />
              </div>
            </div>
            <p className="text-xl font-black" style={{ color: kpi.color }}>{kpi.value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Gráfico de presença semanal */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">📈 Presença — Últimos 7 dias</p>
        <div className="flex items-end gap-2 h-24">
          {data.presencaSemana.map((d, i) => {
            const pct = d.total > 0 ? (d.presentes / d.total) * 100 : 0;
            const isToday = i === data.presencaSemana.length - 1;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <p className="text-[10px] font-bold text-gray-500">{d.presentes}</p>
                <div className="w-full rounded-t-lg transition-all" style={{
                  height: `${Math.max(pct, 5)}%`,
                  background: isToday ? "linear-gradient(135deg, #1e40af, #0ea5e9)" : "#e2e8f0",
                  minHeight: "4px",
                }} />
                <p className="text-[10px] font-semibold" style={{ color: isToday ? "#1e40af" : "#94a3b8" }}>{d.dia}</p>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <p className="text-[10px] text-gray-400">Média diária: <span className="font-bold text-gray-600">{fmtHoras(data.mediaHorasDia)}</span></p>
          <p className="text-[10px] text-gray-400">Taxa de presença: <span className="font-bold" style={{ color: "#1e40af" }}>{presencaPct}%</span></p>
        </div>
      </div>

      {/* Grid: Top Pontuais + Próximos Feriados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Top Pontuais */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">🏆 Mais Pontuais do Mês</p>
          {data.topPontuais.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">Dados insuficientes</p>
          ) : (
            <div className="space-y-3">
              {data.topPontuais.map((e, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                    style={{ background: i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : "#cd7c3a" }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{e.name}</p>
                    <p className="text-[10px] text-gray-400">{e.dias} dias sem atraso</p>
                  </div>
                  <Award className="w-4 h-4 flex-shrink-0" style={{ color: i === 0 ? "#f59e0b" : "#94a3b8" }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Próximos Feriados */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">📅 Próximos Feriados</p>
          <div className="space-y-3">
            {data.proximosFeriados.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0" style={{ background: "#eff6ff" }}>
                  <p className="text-[9px] font-bold text-blue-400 uppercase">
                    {new Date(f.data + "T12:00:00").toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
                  </p>
                  <p className="text-sm font-black text-blue-700 leading-none">
                    {new Date(f.data + "T12:00:00").getDate()}
                  </p>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-700">{f.nome}</p>
                </div>
                <span className="text-[11px] font-bold px-2 py-1 rounded-full flex-shrink-0"
                  style={{ background: f.dias <= 7 ? "#fef3c7" : "#f1f5f9", color: f.dias <= 7 ? "#b45309" : "#64748b" }}>
                  {f.dias === 0 ? "Hoje!" : f.dias === 1 ? "Amanhã" : `em ${f.dias}d`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Saúde organizacional */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">❤️ Saúde Organizacional</p>
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: "Presença",
              value: presencaPct,
              color: presencaPct >= 90 ? "#15803d" : presencaPct >= 75 ? "#b45309" : "#dc2626",
              status: presencaPct >= 90 ? "Excelente" : presencaPct >= 75 ? "Regular" : "Crítico",
            },
            {
              label: "Pontualidade",
              value: data.presentesHoje > 0 ? Math.round(((data.presentesHoje - data.atrasadosHoje) / data.presentesHoje) * 100) : 100,
              color: "#7c3aed",
              status: data.atrasadosHoje === 0 ? "Excelente" : data.atrasadosHoje <= 2 ? "Boa" : "Atenção",
            },
            {
              label: "Carga Horária",
              value: Math.min(Math.round((data.mediaHorasDia / 8) * 100), 100),
              color: "#1e40af",
              status: data.mediaHorasDia >= 7.5 ? "Ideal" : data.mediaHorasDia >= 6 ? "Regular" : "Baixa",
            },
          ].map((item, i) => (
            <div key={i} className="text-center">
              <div className="relative w-16 h-16 mx-auto mb-2">
                <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke={item.color} strokeWidth="3"
                    strokeDasharray={`${item.value} 100`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-xs font-black" style={{ color: item.color }}>{item.value}%</p>
                </div>
              </div>
              <p className="text-xs font-semibold text-gray-700">{item.label}</p>
              <p className="text-[10px] font-bold mt-0.5" style={{ color: item.color }}>{item.status}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}