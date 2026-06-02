import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

interface Anomalia {
  employeeId: string;
  name: string;
  tipo: "atraso_crescente" | "horas_extras_anormal" | "ausencia_recorrente" | "mudanca_padrao";
  severidade: "alta" | "media" | "baixa";
  descricao: string;
  detalhe: string;
  tendencia: "piora" | "melhora" | "estavel";
}

const TIPO_CONFIG = {
  atraso_crescente:      { icon: "⏰", label: "Atrasos Crescentes",       color: "#dc2626", bg: "#fff1f2" },
  horas_extras_anormal:  { icon: "🔥", label: "Horas Extras Anormais",    color: "#b45309", bg: "#fff7ed" },
  ausencia_recorrente:   { icon: "📅", label: "Ausências Recorrentes",    color: "#7c3aed", bg: "#f5f3ff" },
  mudanca_padrao:        { icon: "📊", label: "Mudança de Padrão",        color: "#0e7490", bg: "#ecfeff" },
};

const SEVERIDADE_CONFIG = {
  alta:  { label: "Alta",  color: "#dc2626", bg: "#fff1f2" },
  media: { label: "Média", color: "#b45309", bg: "#fff7ed" },
  baixa: { label: "Baixa", color: "#15803d", bg: "#f0fdf4" },
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function AnomaliaTab() {
  const [anomalias, setAnomalias] = useState<Anomalia[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [filtro, setFiltro] = useState<"todas" | "alta" | "media" | "baixa">("todas");

  const analyze = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const dias30 = new Date(); dias30.setDate(dias30.getDate() - 30);
      const dias60 = new Date(); dias60.setDate(dias60.getDate() - 60);
      const dias15 = new Date(); dias15.setDate(dias15.getDate() - 15);

      const [empRes, records30, records60] = await Promise.all([
        supabase.from("employees").select("id, name").eq("active", true),
        (supabase as any).from("time_records").select("employee_id, record_type, recorded_at")
          .gte("recorded_at", dias30.toISOString()).order("recorded_at", { ascending: true }),
        (supabase as any).from("time_records").select("employee_id, record_type, recorded_at")
          .gte("recorded_at", dias60.toISOString()).lt("recorded_at", dias30.toISOString())
          .order("recorded_at", { ascending: true }),
      ]);

      const employees = empRes.data || [];
      const recs30 = records30.data || [];
      const recs60 = records60.data || [];

      const result: Anomalia[] = [];

      employees.forEach(emp => {
        const emp30 = recs30.filter((r: any) => r.employee_id === emp.id);
        const emp60 = recs60.filter((r: any) => r.employee_id === emp.id);

        // Helper: atrasos por período
        const getAtrasos = (recs: any[]) => recs.filter((r: any) => {
          if (r.record_type !== "entrada") return false;
          const h = new Date(r.recorded_at).getHours();
          const m = new Date(r.recorded_at).getMinutes();
          return h > 8 || (h === 8 && m > 15);
        });

        // Helper: horas por dia
        const getHorasPorDia = (recs: any[]) => {
          const porDia: Record<string, any[]> = {};
          recs.forEach((r: any) => {
            const dia = r.recorded_at.slice(0, 10);
            if (!porDia[dia]) porDia[dia] = [];
            porDia[dia].push(r);
          });
          return Object.values(porDia).map(dayRecs => {
            const entrada = dayRecs.find((r: any) => r.record_type === "entrada");
            const saida = dayRecs.find((r: any) => r.record_type === "saida");
            if (!entrada || !saida) return 0;
            return (new Date(saida.recorded_at).getTime() - new Date(entrada.recorded_at).getTime()) / 3600000;
          }).filter(h => h > 0);
        };

        // Helper: dias trabalhados por dia da semana
        const getDiasSemana = (recs: any[]) => {
          const freq: Record<number, number> = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
          const diasUnicos = new Set(recs.filter((r: any) => r.record_type === "entrada").map((r: any) => r.recorded_at.slice(0, 10)));
          diasUnicos.forEach(dia => {
            const dow = new Date(dia + "T12:00:00").getDay();
            freq[dow]++;
          });
          return freq;
        };

        // 1. Atrasos crescentes
        const atrasos30 = getAtrasos(emp30).length;
        const atrasos60 = getAtrasos(emp60).length;
        const entradas30 = emp30.filter((r: any) => r.record_type === "entrada").length;
        const entradas60 = emp60.filter((r: any) => r.record_type === "entrada").length;
        const taxa30 = entradas30 > 0 ? atrasos30 / entradas30 : 0;
        const taxa60 = entradas60 > 0 ? atrasos60 / entradas60 : 0;

        if (taxa30 > 0.3 && taxa30 > taxa60 * 1.5 && atrasos30 >= 3) {
          result.push({
            employeeId: emp.id,
            name: emp.name,
            tipo: "atraso_crescente",
            severidade: taxa30 > 0.6 ? "alta" : taxa30 > 0.4 ? "media" : "baixa",
            descricao: `${atrasos30} atrasos nos últimos 30 dias (${Math.round(taxa30 * 100)}% das entradas)`,
            detalhe: `Período anterior: ${Math.round(taxa60 * 100)}% → Período atual: ${Math.round(taxa30 * 100)}% (+${Math.round((taxa30 - taxa60) * 100)}%)`,
            tendencia: "piora",
          });
        }

        // 2. Horas extras anormais
        const horas30 = getHorasPorDia(emp30);
        const horas60 = getHorasPorDia(emp60);
        const mediaHE30 = horas30.length > 0 ? horas30.reduce((a, b) => a + b, 0) / horas30.length : 0;
        const mediaHE60 = horas60.length > 0 ? horas60.reduce((a, b) => a + b, 0) / horas60.length : 0;
        const diasHE30 = horas30.filter(h => h > 10).length;

        if (mediaHE30 > 9.5 && mediaHE30 > mediaHE60 * 1.2 && horas30.length >= 5) {
          result.push({
            employeeId: emp.id,
            name: emp.name,
            tipo: "horas_extras_anormal",
            severidade: mediaHE30 > 11 ? "alta" : mediaHE30 > 10 ? "media" : "baixa",
            descricao: `Média de ${mediaHE30.toFixed(1)}h/dia nos últimos 30 dias`,
            detalhe: `Período anterior: ${mediaHE60.toFixed(1)}h/dia → Atual: ${mediaHE30.toFixed(1)}h/dia · ${diasHE30} dias acima de 10h`,
            tendencia: mediaHE30 > mediaHE60 ? "piora" : "melhora",
          });
        }

        // 3. Ausências recorrentes em dia específico
        const semana30 = getDiasSemana(emp30);
        const semana60 = getDiasSemana(emp60);
        const nomes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
        for (let dow = 1; dow <= 5; dow++) {
          const presentes30 = semana30[dow] || 0;
          const presentes60 = semana60[dow] || 0;
          // Quantas vezes esse dia ocorreu nos últimos 30 dias
          let ocorrencias = 0;
          for (let d = new Date(dias30); d <= now; d.setDate(d.getDate() + 1)) {
            if (d.getDay() === dow) ocorrencias++;
          }
          const ausencias = ocorrencias - presentes30;
          if (ausencias >= 3 && ausencias > ocorrencias * 0.5) {
            result.push({
              employeeId: emp.id,
              name: emp.name,
              tipo: "ausencia_recorrente",
              severidade: ausencias >= 4 ? "alta" : "media",
              descricao: `Faltou ${ausencias}x nas ${nomes[dow].toLowerCase()}-feiras dos últimos 30 dias`,
              detalhe: `Presença às ${nomes[dow].toLowerCase()}-feiras: ${presentes30}/${ocorrencias} dias · Período anterior: ${presentes60} presenças`,
              tendencia: presentes30 < presentes60 ? "piora" : "estavel",
            });
          }
        }

        // 4. Mudança brusca de padrão
        const emp15 = emp30.filter((r: any) => new Date(r.recorded_at) >= dias15);
        const emp30_15 = emp30.filter((r: any) => new Date(r.recorded_at) < dias15);
        const horas15 = getHorasPorDia(emp15);
        const horas30_15 = getHorasPorDia(emp30_15);
        const media15 = horas15.length > 0 ? horas15.reduce((a, b) => a + b, 0) / horas15.length : 0;
        const media30_15 = horas30_15.length > 0 ? horas30_15.reduce((a, b) => a + b, 0) / horas30_15.length : 0;
        const diff = Math.abs(media15 - media30_15);

        if (diff > 2 && horas15.length >= 3 && horas30_15.length >= 3) {
          result.push({
            employeeId: emp.id,
            name: emp.name,
            tipo: "mudanca_padrao",
            severidade: diff > 3 ? "alta" : "media",
            descricao: `Mudança de ${diff.toFixed(1)}h/dia na média dos últimos 15 dias`,
            detalhe: `15-30 dias atrás: ${media30_15.toFixed(1)}h/dia → Últimos 15 dias: ${media15.toFixed(1)}h/dia`,
            tendencia: media15 > media30_15 ? "piora" : "melhora",
          });
        }
      });

      // Remove duplicatas por funcionário/tipo
      const unique = result.filter((a, i, arr) =>
        arr.findIndex(b => b.employeeId === a.employeeId && b.tipo === a.tipo) === i
      );

      setAnomalias(unique.sort((a, b) => {
        const ord = { alta: 0, media: 1, baixa: 2 };
        return ord[a.severidade] - ord[b.severidade];
      }));
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { analyze(); }, [analyze]);

  const filtradas = filtro === "todas" ? anomalias : anomalias.filter(a => a.severidade === filtro);
  const counts = {
    alta: anomalias.filter(a => a.severidade === "alta").length,
    media: anomalias.filter(a => a.severidade === "media").length,
    baixa: anomalias.filter(a => a.severidade === "baixa").length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            🔍 Detector de Anomalias
            {anomalias.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "#fff1f2", color: "#dc2626" }}>
                {anomalias.length} detectada{anomalias.length > 1 ? "s" : ""}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Análise inteligente dos últimos 60 dias
            {lastUpdated && ` · ${lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
        <button onClick={analyze} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        {(["alta", "media", "baixa"] as const).map(sev => {
          const c = SEVERIDADE_CONFIG[sev];
          return (
            <button key={sev} onClick={() => setFiltro(filtro === sev ? "todas" : sev)}
              className="rounded-xl p-3 text-center border-2 transition-all"
              style={{
                background: filtro === sev ? c.bg : "white",
                borderColor: filtro === sev ? c.color : "#e2e8f0",
              }}>
              <p className="text-xl font-black" style={{ color: c.color }}>{counts[sev]}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: c.color }}>
                Severidade {c.label}
              </p>
            </button>
          );
        })}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-sm font-semibold text-gray-600">Nenhuma anomalia detectada!</p>
          <p className="text-xs text-gray-400 mt-1">Todos os colaboradores com padrão normal nos últimos 60 dias</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map((a, i) => {
            const tipo = TIPO_CONFIG[a.tipo];
            const sev = SEVERIDADE_CONFIG[a.severidade];
            return (
              <div key={i} className="bg-white rounded-2xl border p-4"
                style={{ borderColor: sev.color + "30", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">{tipo.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-sm font-black text-gray-800">{a.name}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: tipo.bg, color: tipo.color }}>
                        {tipo.label}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: sev.bg, color: sev.color }}>
                        {sev.label}
                      </span>
                      {a.tendencia === "piora" && <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
                      {a.tendencia === "melhora" && <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />}
                    </div>
                    <p className="text-xs font-semibold text-gray-700">{a.descricao}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{a.detalhe}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {anomalias.length === 0 && !loading && (
        <p className="text-[10px] text-gray-400 text-center">
          Análise baseada em atrasos, horas extras, ausências e mudanças de padrão dos últimos 60 dias
        </p>
      )}
    </div>
  );
}