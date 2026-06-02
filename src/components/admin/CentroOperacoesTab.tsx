import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Wifi, WifiOff, Clock, AlertTriangle, CheckCircle, Users } from "lucide-react";

interface ColaboradorStatus {
  id: string;
  name: string;
  foto_url?: string | null;
  cargo?: string | null;
  status: "online" | "pausa" | "atrasado" | "ausente" | "concluido";
  lastType: string | null;
  lastTime: string | null;
  horasHoje: number;
  inconsistencias: string[];
}

const STATUS_CONFIG = {
  online:    { label: "Online",    bg: "#dcfce7", text: "#15803d", dot: "#22c55e" },
  pausa:     { label: "Em Pausa",  bg: "#fef3c7", text: "#b45309", dot: "#f59e0b" },
  atrasado:  { label: "Atrasado",  bg: "#fee2e2", text: "#dc2626", dot: "#ef4444" },
  ausente:   { label: "Ausente",   bg: "#f1f5f9", text: "#64748b", dot: "#94a3b8" },
  concluido: { label: "Concluído", bg: "#eff6ff", text: "#1e40af", dot: "#3b82f6" },
};

const STEP_LABELS: Record<string, string> = {
  entrada: "Entrada", intervalo: "Intervalo", retorno: "Retorno", saida: "Saída",
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtHoras(h: number) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h${String(mm).padStart(2, "0")}`;
}

export default function CentroOperacoesTab() {
  const [colaboradores, setColaboradores] = useState<ColaboradorStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "online" | "pausa" | "atrasado" | "ausente" | "concluido">("todos");
  const [busca, setBusca] = useState("");

  const fetch = useCallback(async () => {
    try {
      const now = new Date();
      const spFormatter = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Sao_Paulo",
        year: "numeric", month: "2-digit", day: "2-digit",
      });
      const todayStr = spFormatter.format(now);
      const startOfDay = new Date(`${todayStr}T00:00:00-03:00`).toISOString();
      const endOfDay = new Date(`${todayStr}T23:59:59-03:00`).toISOString();

      const [empRes, recordsRes] = await Promise.all([
       (supabase as any).from("employees").select("id, name, foto_url, cargo").eq("active", true).order("name"),
        (supabase as any).from("time_records")
          .select("id, employee_id, record_type, recorded_at")
          .gte("recorded_at", startOfDay)
          .lte("recorded_at", endOfDay)
          .order("recorded_at", { ascending: true }),
      ]);

      const employees = empRes.data || [];
      const records = recordsRes.data || [];
      const nowH = now.getHours() + now.getMinutes() / 60;
      const dow = now.getDay();
      const isWorkDay = dow !== 0;

      const list: ColaboradorStatus[] = employees.map(emp => {
        const empRecs = records.filter((r: any) => r.employee_id === emp.id);
        const entrada = empRecs.find((r: any) => r.record_type === "entrada");
        const intervalo = empRecs.find((r: any) => r.record_type === "intervalo");
        const retorno = empRecs.find((r: any) => r.record_type === "retorno");
        const saida = empRecs.find((r: any) => r.record_type === "saida");
        const last = empRecs[empRecs.length - 1];

        let horasHoje = 0;
        if (entrada && saida) {
          const manha = intervalo
            ? (new Date(intervalo.recorded_at).getTime() - new Date(entrada.recorded_at).getTime()) / 3600000
            : (new Date(saida.recorded_at).getTime() - new Date(entrada.recorded_at).getTime()) / 3600000;
          const tarde = retorno ? (new Date(saida.recorded_at).getTime() - new Date(retorno.recorded_at).getTime()) / 3600000 : 0;
          horasHoje = Math.round((intervalo ? manha + tarde : manha) * 10) / 10;
        } else if (entrada && !saida) {
          horasHoje = Math.round((now.getTime() - new Date(entrada.recorded_at).getTime()) / 3600000 * 10) / 10;
        }

        // Status
        let status: ColaboradorStatus["status"] = "ausente";
        if (saida) status = "concluido";
        else if (intervalo && !retorno) status = "pausa";
        else if (entrada) {
          const entradaHora = new Date(entrada.recorded_at);
          const limite = new Date(`${todayStr}T08:15:00-03:00`);
          status = entradaHora > limite ? "atrasado" : "online";
        }

        // Inconsistências
        const inconsistencias: string[] = [];
        if (intervalo && !retorno && !saida && nowH >= 14) {
          const diffMin = Math.round((nowH - (new Date(intervalo.recorded_at).getHours() + new Date(intervalo.recorded_at).getMinutes() / 60)) * 60);
          inconsistencias.push(`🍽️ No almoço há ${diffMin >= 60 ? Math.floor(diffMin/60) + "h" + String(diffMin%60).padStart(2,"0") + "m" : diffMin + "min"}`);
        }
        if (entrada && saida && horasHoje > 10) inconsistencias.push(`⏰ Jornada de ${fmtHoras(horasHoje)}`);
        if (entrada && !saida && nowH >= 20) inconsistencias.push(`🚪 Sem saída após 20h`);

        return {
          id: emp.id,
          name: emp.name,
          foto_url: (emp as any).foto_url,
          cargo: (emp as any).cargo,
          status,
          lastType: last?.record_type || null,
          lastTime: last?.recorded_at || null,
          horasHoje,
          inconsistencias,
        };
      }).filter(e => isWorkDay || e.status !== "ausente");

      setColaboradores(list);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    const interval = setInterval(() => fetch(), 30000);
    const handleVisibility = () => { if (document.visibilityState === "visible") fetch(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", handleVisibility); };
  }, [fetch]);

  const filtrados = colaboradores
    .filter(e => filtro === "todos" || e.status === filtro)
    .filter(e => !busca || e.name.toLowerCase().includes(busca.toLowerCase()));

  const counts = {
    online: colaboradores.filter(e => e.status === "online").length,
    pausa: colaboradores.filter(e => e.status === "pausa").length,
    atrasado: colaboradores.filter(e => e.status === "atrasado").length,
    ausente: colaboradores.filter(e => e.status === "ausente").length,
    concluido: colaboradores.filter(e => e.status === "concluido").length,
  };

  const comInconsistencias = colaboradores.filter(e => e.inconsistencias.length > 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            🖥️ Centro de Operações
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </h2>
          {lastUpdated && (
            <p className="text-xs text-muted-foreground">
              Atualizado às {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} — atualiza a cada 30s
            </p>
          )}
        </div>
        <button onClick={fetch} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Cards de status */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {(Object.entries(counts) as [keyof typeof counts, number][]).map(([key, count]) => {
          const c = STATUS_CONFIG[key];
          return (
            <button key={key} onClick={() => setFiltro(filtro === key ? "todos" : key)}
              className="rounded-xl p-3 text-center transition-all border-2"
              style={{
                background: filtro === key ? c.bg : "white",
                borderColor: filtro === key ? c.dot : "#e2e8f0",
                boxShadow: filtro === key ? `0 2px 8px ${c.dot}30` : "0 1px 4px rgba(0,0,0,0.05)",
              }}>
              <div className="flex items-center justify-center gap-1 mb-1">
                <div className="w-2 h-2 rounded-full" style={{ background: c.dot }} />
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: c.text }}>{c.label}</p>
              </div>
              <p className="text-2xl font-black" style={{ color: c.text }}>{count}</p>
            </button>
          );
        })}
      </div>

      {/* Alertas de inconsistências */}
      {comInconsistencias.length > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
          <p className="text-xs font-bold text-orange-600 mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> {comInconsistencias.length} inconsistência{comInconsistencias.length > 1 ? "s" : ""} detectada{comInconsistencias.length > 1 ? "s" : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {comInconsistencias.map(e => (
              <div key={e.id} className="text-xs bg-white rounded-lg px-2.5 py-1.5 border border-orange-200">
                <span className="font-semibold text-orange-700">{e.name.split(" ")[0]}</span>
                <span className="text-orange-500 ml-1">{e.inconsistencias[0]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Busca */}
      <input
        value={busca}
        onChange={e => setBusca(e.target.value)}
        placeholder="🔍 Buscar colaborador..."
        className="w-full h-10 rounded-xl border border-gray-200 px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/40"
      />

      {/* Grid de colaboradores */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <Users className="w-10 h-10 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Nenhum colaborador encontrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtrados.map(e => {
            const c = STATUS_CONFIG[e.status];
            return (
              <div key={e.id} className="bg-white rounded-2xl border p-4 transition-all hover:shadow-md"
                style={{ borderColor: e.inconsistencias.length > 0 ? "#fed7aa" : "#e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {e.foto_url ? (
                      <img src={e.foto_url} alt={e.name} className="w-12 h-12 rounded-full object-cover border-2" style={{ borderColor: c.dot }} />
                    ) : (
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-black text-white border-2"
                        style={{ background: `linear-gradient(135deg, ${c.dot}, ${c.dot}99)`, borderColor: c.dot }}>
                        {e.name.charAt(0)}
                      </div>
                    )}
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white"
                      style={{ background: c.dot }} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-sm font-bold text-gray-800 truncate">{e.name}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: c.bg, color: c.text }}>{c.label}</span>
                    </div>
                    {e.cargo && <p className="text-[10px] text-gray-400">{e.cargo}</p>}

                    <div className="mt-2 space-y-1">
                      {e.lastType && e.lastTime && (
                        <p className="text-[11px] text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {STEP_LABELS[e.lastType] || e.lastType} às {fmtTime(e.lastTime)}
                        </p>
                      )}
                      {e.horasHoje > 0 && (
                        <p className="text-[11px] text-gray-500 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-blue-400" />
                          {fmtHoras(e.horasHoje)} trabalhadas
                        </p>
                      )}
                      {e.inconsistencias.map((inc, i) => (
                        <p key={i} className="text-[11px] text-orange-500">{inc}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Resumo rodapé */}
      <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 flex items-center justify-between"
        style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <p className="text-xs text-gray-400">
          <span className="font-bold text-gray-600">{colaboradores.length}</span> colaboradores ativos
        </p>
        <p className="text-xs text-gray-400">
          Presença hoje: <span className="font-bold" style={{ color: "#1e40af" }}>
            {colaboradores.filter(e => e.status !== "ausente").length}/{colaboradores.length}
          </span>
        </p>
      </div>
    </div>
  );
}