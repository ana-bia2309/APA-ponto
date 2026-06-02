import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw } from "lucide-react";

export default function MapaCalorTab() {
  const [loading, setLoading] = useState(true);
  const [dadosSemana, setDadosSemana] = useState<{ dia: string; presenca: number; atrasos: number; faltas: number; total: number }[]>([]);
  const [dadosHora, setDadosHora] = useState<{ hora: number; count: number }[]>([]);
  const [dadosMes, setDadosMes] = useState<{ semana: number; dia: number; value: number; date: string }[]>([]);
  const [periodo, setPeriodo] = useState<"30" | "60" | "90">("30");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const dias = parseInt(periodo);
      const inicio = new Date();
      inicio.setDate(inicio.getDate() - dias);

      const [empRes, recordsRes] = await Promise.all([
        supabase.from("employees").select("id").eq("active", true),
        (supabase as any).from("time_records")
          .select("employee_id, record_type, recorded_at")
          .gte("recorded_at", inicio.toISOString())
          .order("recorded_at", { ascending: true }),
      ]);

      const employees = empRes.data || [];
      const records = recordsRes.data || [];
      const totalEmp = employees.length;

      // Dados por dia da semana
      const nomes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      const semanaData: Record<number, { presenca: Set<string>; atrasos: number; dias: Set<string> }> = {};
      for (let i = 0; i < 7; i++) semanaData[i] = { presenca: new Set(), atrasos: 0, dias: new Set() };

      // Contar ocorrências de cada dia no período
      for (let d = new Date(inicio); d <= new Date(); d.setDate(d.getDate() + 1)) {
        semanaData[d.getDay()].dias.add(d.toISOString().slice(0, 10));
      }

      records.forEach((r: any) => {
        const dow = new Date(r.recorded_at).getDay();
        if (r.record_type === "entrada") {
          semanaData[dow].presenca.add(`${r.employee_id}_${r.recorded_at.slice(0, 10)}`);
          const h = new Date(r.recorded_at).getHours();
          const m = new Date(r.recorded_at).getMinutes();
          if (h > 8 || (h === 8 && m > 15)) semanaData[dow].atrasos++;
        }
      });

      const semanaResult = nomes.map((nome, i) => {
        const ocorrencias = semanaData[i].dias.size;
        const presencas = semanaData[i].presenca.size;
        const esperado = ocorrencias * totalEmp;
        return {
          dia: nome,
          presenca: esperado > 0 ? Math.round((presencas / esperado) * 100) : 0,
          atrasos: semanaData[i].atrasos,
          faltas: Math.max(0, esperado - presencas),
          total: esperado,
        };
      });
      setDadosSemana(semanaResult);

      // Dados por hora (atrasos)
      const horaData: Record<number, number> = {};
      for (let h = 5; h <= 22; h++) horaData[h] = 0;
      records.filter((r: any) => r.record_type === "entrada").forEach((r: any) => {
        const h = new Date(r.recorded_at).getHours();
        if (h >= 5 && h <= 22) horaData[h]++;
      });
      setDadosHora(Object.entries(horaData).map(([h, count]) => ({ hora: parseInt(h), count })));

      // Mapa de calor por dia do mês (últimos 30 dias)
      const hoje = new Date();
      const mesData: { semana: number; dia: number; value: number; date: string }[] = [];
      const diasMap: Record<string, number> = {};

      records.filter((r: any) => r.record_type === "entrada").forEach((r: any) => {
        const d = r.recorded_at.slice(0, 10);
        if (!diasMap[d]) diasMap[d] = 0;
        diasMap[d]++;
      });

      // Últimas 10 semanas
      const inicioCalendario = new Date(hoje);
      inicioCalendario.setDate(inicioCalendario.getDate() - 69);
      inicioCalendario.setDate(inicioCalendario.getDate() - inicioCalendario.getDay());

      for (let s = 0; s < 10; s++) {
        for (let d = 0; d < 7; d++) {
          const date = new Date(inicioCalendario);
          date.setDate(date.getDate() + s * 7 + d);
          if (date > hoje) continue;
          const dStr = date.toISOString().slice(0, 10);
          mesData.push({
            semana: s,
            dia: d,
            value: diasMap[dStr] || 0,
            date: dStr,
          });
        }
      }
      setDadosMes(mesData);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [periodo]);

  useEffect(() => { load(); }, [load]);

  const maxHora = Math.max(...dadosHora.map(h => h.count), 1);
  const maxMes = Math.max(...dadosMes.map(d => d.value), 1);

  const getCalorColor = (value: number, max: number) => {
    if (value === 0) return "#f1f5f9";
    const intensity = value / max;
    if (intensity < 0.25) return "#bbf7d0";
    if (intensity < 0.5) return "#4ade80";
    if (intensity < 0.75) return "#16a34a";
    return "#14532d";
  };

  const getPresencaColor = (pct: number) => {
    if (pct >= 90) return { bg: "#dcfce7", text: "#15803d" };
    if (pct >= 70) return { bg: "#fef9c3", text: "#854d0e" };
    if (pct >= 50) return { bg: "#fed7aa", text: "#c2410c" };
    return { bg: "#fecaca", text: "#dc2626" };
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">🌡️ Mapa de Calor de Frequência</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Visualize padrões de presença e ausência</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            {(["30", "60", "90"] as const).map(p => (
              <button key={p} onClick={() => setPeriodo(p)}
                className="px-3 py-1.5 text-xs font-semibold transition-all"
                style={{
                  background: periodo === p ? "#1e40af" : "white",
                  color: periodo === p ? "white" : "#64748b",
                }}>
                {p}d
              </button>
            ))}
          </div>
          <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Presença por dia da semana */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">📅 Presença por Dia da Semana</p>
            <div className="space-y-2">
              {dadosSemana.filter(d => d.total > 0).map((d, i) => {
                const c = getPresencaColor(d.presenca);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <p className="text-xs font-bold text-gray-500 w-8 flex-shrink-0">{d.dia}</p>
                    <div className="flex-1 h-7 bg-gray-100 rounded-lg overflow-hidden relative">
                      <div className="h-full rounded-lg transition-all"
                        style={{ width: `${d.presenca}%`, background: `linear-gradient(90deg, ${c.bg}, ${c.text}30)`, borderRight: `3px solid ${c.text}` }} />
                      <span className="absolute inset-0 flex items-center px-2 text-[11px] font-bold" style={{ color: c.text }}>
                        {d.presenca}% presença
                      </span>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "#fef3c7", color: "#b45309" }}>
                        ⏰ {d.atrasos}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "#fff1f2", color: "#dc2626" }}>
                        ✗ {d.faltas}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded" style={{ background: "#dcfce7" }} /><span className="text-[10px] text-gray-400">≥90%</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded" style={{ background: "#fef9c3" }} /><span className="text-[10px] text-gray-400">70-89%</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded" style={{ background: "#fed7aa" }} /><span className="text-[10px] text-gray-400">50-69%</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded" style={{ background: "#fecaca" }} /><span className="text-[10px] text-gray-400">&lt;50%</span></div>
            </div>
          </div>

          {/* Horários de entrada */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">🕐 Distribuição de Horários de Entrada</p>
            <div className="flex items-end gap-1 h-24">
              {dadosHora.map((h, i) => {
                const pct = h.count / maxHora;
                const isAtraso = h.hora > 8 || (h.hora === 8);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${h.hora}h: ${h.count} registros`}>
                    <div className="w-full rounded-t-sm transition-all"
                      style={{
                        height: `${Math.max(pct * 100, 2)}%`,
                        background: h.hora > 8 ? "#fca5a5" : h.hora === 8 ? "#fde68a" : "#86efac",
                        minHeight: h.count > 0 ? "3px" : "0",
                      }} />
                    {h.hora % 3 === 0 && (
                      <p className="text-[8px] text-gray-400">{h.hora}h</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded" style={{ background: "#86efac" }} /><span className="text-[10px] text-gray-400">No horário</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded" style={{ background: "#fde68a" }} /><span className="text-[10px] text-gray-400">Limite (8h)</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded" style={{ background: "#fca5a5" }} /><span className="text-[10px] text-gray-400">Atraso</span></div>
            </div>
          </div>

          {/* Mapa de calor GitHub-style */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">📊 Atividade Diária (Estilo GitHub)</p>
            <div className="flex gap-1 overflow-x-auto pb-2">
              {Array.from({ length: 10 }, (_, s) => (
                <div key={s} className="flex flex-col gap-1">
                  {Array.from({ length: 7 }, (_, d) => {
                    const cell = dadosMes.find(c => c.semana === s && c.dia === d);
                    if (!cell) return <div key={d} className="w-4 h-4" />;
                    const dow = new Date(cell.date + "T12:00:00").getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    return (
                      <div key={d}
                        className="w-4 h-4 rounded-sm cursor-pointer transition-transform hover:scale-125"
                        style={{ background: isWeekend ? "#f1f5f9" : getCalorColor(cell.value, maxMes) }}
                        title={`${cell.date}: ${cell.value} registros`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-gray-400">Menos</span>
              {["#f1f5f9", "#bbf7d0", "#4ade80", "#16a34a", "#14532d"].map((c, i) => (
                <div key={i} className="w-3 h-3 rounded-sm" style={{ background: c }} />
              ))}
              <span className="text-[10px] text-gray-400">Mais</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}