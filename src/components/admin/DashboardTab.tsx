import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle } from "lucide-react";

interface EmployeeStatus {
  id: string;
  name: string;
  lastRecord: string | null;
  lastType: string | null;
  lastTime: string | null;
  status: "presente" | "falta" | "incompleto" | "atrasou";
  horasHoje: number;
  bancoCritico: boolean;
  records: { type: string; time: string }[];
  inconsistencias: Inconsistencia[];
}

interface Inconsistencia {
  tipo: "esqueceu_retorno" | "jornada_longa" | "duplicado" | "fora_turno" | "sem_saida";
  mensagem: string;
}

const STEP_LABELS: Record<string, string> = {
  entrada: "Entrada", intervalo: "Intervalo", retorno: "Retorno", saida: "Saída",
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtHoras(h: number) {
  const abs = Math.abs(h);
  const hh = Math.floor(abs);
  const mm = Math.round((abs - hh) * 60);
  return `${h < 0 ? "-" : ""}${hh}h${String(mm).padStart(2, "0")}`;
}

function detectarInconsistencias(
  empRecords: any[],
  now: Date,
  todayStr: string
): Inconsistencia[] {
  const inconsistencias: Inconsistencia[] = [];
  const nowH = now.getHours() + now.getMinutes() / 60;

  const entrada = empRecords.find(r => r.record_type === "entrada");
  const intervalo = empRecords.find(r => r.record_type === "intervalo");
  const retorno = empRecords.find(r => r.record_type === "retorno");
  const saida = empRecords.find(r => r.record_type === "saida");

  // 1. Esqueceu retorno do almoço (tem intervalo, não tem retorno, já passa das 14h)
  if (intervalo && !retorno && !saida && nowH >= 14) {
    const intervaloH = new Date(intervalo.recorded_at).getHours() + new Date(intervalo.recorded_at).getMinutes() / 60;
    const diffMin = Math.round((nowH - intervaloH) * 60);
    inconsistencias.push({
      tipo: "esqueceu_retorno",
      mensagem: `Saiu para almoço há ${diffMin >= 60 ? Math.floor(diffMin/60) + "h" + String(diffMin%60).padStart(2,"0") + "m" : diffMin + "min"} e não retornou`,
    });
  }

  // 2. Jornada excedeu 10h
  if (entrada && saida) {
    const diffH = (new Date(saida.recorded_at).getTime() - new Date(entrada.recorded_at).getTime()) / 3600000;
    if (diffH > 10) {
      inconsistencias.push({
        tipo: "jornada_longa",
        mensagem: `Jornada de ${fmtHoras(diffH)} excede o limite de 10h`,
      });
    }
  }

  // 3. Ponto duplicado (mesmo tipo mais de uma vez)
  const tipos = empRecords.map(r => r.record_type);
  const duplicados = tipos.filter((t, i) => tipos.indexOf(t) !== i);
  if (duplicados.length > 0) {
    const uniq = [...new Set(duplicados)];
    inconsistencias.push({
      tipo: "duplicado",
      mensagem: `Registro duplicado: ${uniq.map(t => STEP_LABELS[t] || t).join(", ")}`,
    });
  }

  // 4. Entrada fora do turno (antes das 05h ou depois das 22h)
  if (entrada) {
    const entradaH = new Date(entrada.recorded_at).getHours();
    if (entradaH < 5 || entradaH >= 22) {
      inconsistencias.push({
        tipo: "fora_turno",
        mensagem: `Entrada às ${fmtTime(entrada.recorded_at)} fora do horário normal`,
      });
    }
  }

  // 5. Sem saída e já passou das 20h
  if (entrada && !saida && nowH >= 20) {
    inconsistencias.push({
      tipo: "sem_saida",
      mensagem: `Não registrou saída (entrada às ${fmtTime(entrada.recorded_at)})`,
    });
  }

  return inconsistencias;
}

export default function DashboardTab({ onNavigate, role }: { onNavigate?: (tab: string) => void; role?: "admin" | "rh" | "usuario" | null }) {
  const [statuses, setStatuses] = useState<EmployeeStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [bancoCriticos, setBancoCriticos] = useState<{ name: string; saldo: number }[]>([]);
  const [atestadosPendentes, setAtestadosPendentes] = useState(0);
  const [horaExtraTotal, setHoraExtraTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comportamentos, setComportamentos] = useState<{id: string; name: string; alertas: string[]}[]>([]);

  const fetch = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const spFormatter = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Sao_Paulo",
        year: "numeric", month: "2-digit", day: "2-digit",
      });
      const todayStr = spFormatter.format(now);
      const startOfDay = new Date(`${todayStr}T00:00:00-03:00`).toISOString();
      const endOfDay = new Date(`${todayStr}T23:59:59-03:00`).toISOString();

      const [empRes, recordsRes, bancoRes, justRes] = await Promise.all([
        supabase.from("employees").select("id, name").eq("active", true).order("name"),
        (supabase as any).from("time_records")
          .select("id, employee_id, record_type, recorded_at")
          .gte("recorded_at", startOfDay)
          .lte("recorded_at", endOfDay)
          .order("recorded_at", { ascending: true }),
        (supabase as any).from("banco_horas").select("employee_id, tipo, horas"),
        supabase.from("absence_justifications").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      ]);

      const employees = empRes.data || [];
      const records = recordsRes.data || [];

      const bancoMap: Record<string, number> = {};
      (bancoRes.data || []).forEach((e: any) => {
        if (!bancoMap[e.employee_id]) bancoMap[e.employee_id] = 0;
        bancoMap[e.employee_id] += e.tipo === "credito" ? e.horas : -e.horas;
      });

      const criticos = employees
        .filter(e => Math.abs(bancoMap[e.id] || 0) > 20)
        .map(e => ({ name: e.name, saldo: bancoMap[e.id] || 0 }))
        .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));
      setBancoCriticos(criticos);
      setAtestadosPendentes(justRes.count || 0);

      const dow = now.getDay();
      const isWorkDay = dow !== 0;
      let totalHorasExtras = 0;

      const statusList: EmployeeStatus[] = employees.map(emp => {
        const empRecords = records.filter((r: any) => r.employee_id === emp.id);
        const entrada = empRecords.find((r: any) => r.record_type === "entrada");
        const intervalo = empRecords.find((r: any) => r.record_type === "intervalo");
        const retorno = empRecords.find((r: any) => r.record_type === "retorno");
        const saida = empRecords.find((r: any) => r.record_type === "saida");
        const last = empRecords[empRecords.length - 1];

        const timelineRecords = empRecords.map((r: any) => ({ type: r.record_type, time: r.recorded_at }));

        let horasHoje = 0;
        if (entrada && saida) {
          const manha = intervalo
            ? (new Date(intervalo.recorded_at).getTime() - new Date(entrada.recorded_at).getTime()) / 3600000
            : (new Date(saida.recorded_at).getTime() - new Date(entrada.recorded_at).getTime()) / 3600000;
          const tarde = retorno && saida
            ? (new Date(saida.recorded_at).getTime() - new Date(retorno.recorded_at).getTime()) / 3600000
            : 0;
          horasHoje = Math.round((intervalo ? manha + tarde : manha) * 10) / 10;
        } else if (entrada && !saida) {
          horasHoje = Math.round((now.getTime() - new Date(entrada.recorded_at).getTime()) / 3600000 * 10) / 10;
        }

        if (saida && horasHoje > 8) totalHorasExtras += horasHoje - 8;

        let status: EmployeeStatus["status"] = "falta";
        if (!isWorkDay) status = "presente";
        else if (saida) status = "presente";
        else if (entrada) {
          const entradaHora = new Date(entrada.recorded_at);
          const limite = new Date(`${todayStr}T08:15:00-03:00`);
          status = entradaHora > limite ? "atrasou" : "incompleto";
        }

        const inconsistencias = detectarInconsistencias(empRecords, now, todayStr);

        return {
          id: emp.id,
          name: emp.name,
          lastRecord: last?.record_type || null,
          lastType: last?.record_type || null,
          lastTime: last?.recorded_at || null,
          status,
          horasHoje,
          bancoCritico: Math.abs(bancoMap[emp.id] || 0) > 20,
          records: timelineRecords,
          inconsistencias,
        };
   }).filter(e => isWorkDay || e.status !== "falta");

      setHoraExtraTotal(Math.round(totalHorasExtras * 10) / 10);

      // Detecção de comportamento suspeito
      const now30 = new Date();
      now30.setDate(now30.getDate() - 30);
      const { data: monthRecords } = await (supabase as any)
        .from("time_records")
        .select("employee_id, record_type, recorded_at, mode")
        .gte("recorded_at", now30.toISOString())
        .order("recorded_at", { ascending: true });

      const { data: manualCount } = await (supabase as any)
        .from("manual_punches")
        .select("employee_id")
        .gte("created_at", now30.toISOString());

      const comportSuspeitos: {id: string; name: string; alertas: string[]}[] = [];

      employees.forEach(emp => {
        const alertas: string[] = [];
        const empMonth = (monthRecords || []).filter((r: any) => r.employee_id === emp.id);

        // 1. Ponto no mesmo segundo por 3+ dias
        const entradaSeconds = empMonth
          .filter((r: any) => r.record_type === "entrada")
          .map((r: any) => new Date(r.recorded_at).getSeconds());
        if (entradaSeconds.length >= 3) {
          const freq: Record<number, number> = {};
          entradaSeconds.forEach((s: number) => { freq[s] = (freq[s] || 0) + 1; });
          const maxFreq = Math.max(...Object.values(freq));
          if (maxFreq >= 3) alertas.push(`⏱️ Ponto registrado no mesmo segundo por ${maxFreq} dias`);
        }

        // 2. Excesso de correções manuais
        const manuais = (manualCount || []).filter((r: any) => r.employee_id === emp.id).length;
        if (manuais >= 3) alertas.push(`✏️ ${manuais} correções manuais nos últimos 30 dias`);

        // 3. Registros fora do horário comercial frequentes
        const foraHorario = empMonth.filter((r: any) => {
          const h = new Date(r.recorded_at).getHours();
          return h < 5 || h >= 22;
        }).length;
        if (foraHorario >= 3) alertas.push(`🌙 ${foraHorario} registros fora do horário comercial`);

        // 4. Muitos registros duplicados
        const porDia: Record<string, string[]> = {};
        empMonth.forEach((r: any) => {
          const dia = new Date(r.recorded_at).toISOString().slice(0, 10);
          if (!porDia[dia]) porDia[dia] = [];
          porDia[dia].push(r.record_type);
        });
        const diasDuplicados = Object.values(porDia).filter(tipos => {
          const freq: Record<string, number> = {};
          tipos.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
          return Object.values(freq).some(v => v > 1);
        }).length;
        if (diasDuplicados >= 2) alertas.push(`📋 Registros duplicados em ${diasDuplicados} dias`);

        // 5. Saída sempre idêntica ao minuto
        const saidaMinutes = empMonth
          .filter((r: any) => r.record_type === "saida")
          .map((r: any) => {
            const d = new Date(r.recorded_at);
            return d.getHours() * 60 + d.getMinutes();
          });
        if (saidaMinutes.length >= 5) {
          const freq: Record<number, number> = {};
          saidaMinutes.forEach((m: number) => { freq[m] = (freq[m] || 0) + 1; });
          const maxFreq = Math.max(...Object.values(freq));
          if (maxFreq >= 5) {
            const minuto = Number(Object.keys(freq).find(k => freq[Number(k)] === maxFreq));
            alertas.push(`🤖 Saída sempre às ${String(Math.floor(minuto/60)).padStart(2,"0")}:${String(minuto%60).padStart(2,"0")} (${maxFreq}x)`);
          }
        }

        if (alertas.length > 0) comportSuspeitos.push({ id: emp.id, name: emp.name, alertas });
      });
      setComportamentos(comportSuspeitos);

      setStatuses(statusList);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    const interval = setInterval(() => fetch(true), 60000);
    const handleVisibility = () => { if (document.visibilityState === "visible") fetch(true); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", handleVisibility); };
  }, [fetch]);

  const presentes = statuses.filter(e => e.status === "presente" || e.status === "incompleto" || e.status === "atrasou");
  const faltas = statuses.filter(e => e.status === "falta");
  const atrasados = statuses.filter(e => e.status === "atrasou");
  const incompletos = statuses.filter(e => e.status === "incompleto");
  const trabalhando = statuses.filter(e => (e.status === "incompleto" || e.status === "atrasou") && e.lastType !== "saida" && e.lastType !== null);
  const comInconsistencias = statuses.filter(e => e.inconsistencias.length > 0);

  const inconsistenciaIcon: Record<string, string> = {
    esqueceu_retorno: "🍽️",
    jornada_longa: "⏰",
    duplicado: "📋",
    fora_turno: "🌙",
    sem_saida: "🚪",
  };

  if (error) return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <AlertTriangle className="w-8 h-8 text-destructive" />
      <p className="text-sm text-muted-foreground">{error}</p>
      <Button variant="outline" size="sm" onClick={() => fetch()}>Tentar novamente</Button>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

 return (
    <div className="space-y-4 text-sm">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">Dashboard</h2>
          {lastUpdated && (
            <p className="text-xs text-muted-foreground">
              Atualizado às {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => fetch(true)} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Banner de vista */}
      {role === "rh" && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 flex items-center gap-2">
          <span className="text-xs font-semibold text-blue-600">👔 Vista RH</span>
          <span className="text-xs text-muted-foreground">Foco em pessoas e documentos pendentes</span>
        </div>
      )}
      {role === "usuario" && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 flex items-center gap-2">
          <span className="text-xs font-semibold text-emerald-600">👁️ Vista Supervisor</span>
          <span className="text-xs text-muted-foreground">KPIs do dia em tempo real</span>
        </div>
      )}

     {/* Visão em tempo real */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Online</p>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <p className="text-2xl font-black text-emerald-600">{trabalhando.length}</p>
          <p className="text-[10px] text-emerald-500">Funcionários</p>
          <div className="flex -space-x-1.5 mt-1.5">
            {trabalhando.slice(0, 5).map((e) => (
              <div key={e.id} className="w-5 h-5 rounded-full bg-emerald-400 border-2 border-white flex items-center justify-center text-[8px] font-bold text-white" title={e.name}>
                {e.name.charAt(0)}
              </div>
            ))}
            {trabalhando.length > 5 && <div className="w-5 h-5 rounded-full bg-emerald-200 border-2 border-white flex items-center justify-center text-[8px] font-bold text-emerald-700">+{trabalhando.length - 5}</div>}
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Em Pausa</p>
            <span className="text-sm">⏸️</span>
          </div>
          <p className="text-2xl font-black text-amber-600">
            {statuses.filter(e => e.lastType === "intervalo" && !statuses.find(s => s.id === e.id && s.lastType === "retorno")).length}
          </p>
          <p className="text-[10px] text-amber-500">Funcionários</p>
          <div className="flex -space-x-1.5 mt-1.5">
            {statuses.filter(e => e.lastType === "intervalo").slice(0, 5).map((e) => (
              <div key={e.id} className="w-5 h-5 rounded-full bg-amber-400 border-2 border-white flex items-center justify-center text-[8px] font-bold text-white" title={e.name}>
                {e.name.charAt(0)}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600">Atrasados</p>
            <span className="text-sm">⏰</span>
          </div>
          <p className="text-2xl font-black text-rose-600">{atrasados.length}</p>
          <p className="text-[10px] text-rose-500">Funcionários</p>
          <div className="flex -space-x-1.5 mt-1.5">
            {atrasados.slice(0, 5).map((e) => (
              <div key={e.id} className="w-5 h-5 rounded-full bg-rose-400 border-2 border-white flex items-center justify-center text-[8px] font-bold text-white" title={e.name}>
                {e.name.charAt(0)}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Ausentes</p>
            <span className="text-sm">👤</span>
          </div>
          <p className="text-2xl font-black text-gray-500">{faltas.length}</p>
          <p className="text-[10px] text-gray-400">Funcionários</p>
          <div className="flex -space-x-1.5 mt-1.5">
            {faltas.slice(0, 5).map((e) => (
              <div key={e.id} className="w-5 h-5 rounded-full bg-gray-300 border-2 border-white flex items-center justify-center text-[8px] font-bold text-gray-600" title={e.name}>
                {e.name.charAt(0)}
              </div>
            ))}
            {faltas.length > 5 && <div className="w-5 h-5 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-[8px] font-bold text-gray-500">+{faltas.length - 5}</div>}
          </div>
        </div>
      </div>

      {/* Atividade agora — linha do tempo */}
      {statuses.filter(e => e.lastTime).length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Atividade agora</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {statuses
              .filter(e => e.lastTime)
              .sort((a, b) => new Date(b.lastTime!).getTime() - new Date(a.lastTime!).getTime())
              .slice(0, 8)
              .map((e) => {
                const colors: Record<string, string> = { entrada: "bg-emerald-500", intervalo: "bg-amber-400", retorno: "bg-blue-500", saida: "bg-rose-500" };
                const dotColor = colors[e.lastType || ""] || "bg-gray-400";
                return (
                  <div key={e.id} className="flex flex-col items-center gap-1.5 flex-shrink-0">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
                        {e.name.charAt(0)}
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${dotColor}`} />
                    </div>
                    <p className="text-[10px] font-semibold text-gray-700 text-center max-w-[52px] truncate">{e.name.split(" ")[0]}</p>
                    <p className="text-[10px] text-gray-400">{fmtTime(e.lastTime!)}</p>
                  </div>
                );
              })}
          </div>
        </div>
      )}

{(role === "admin" || !role) && (
  <>
    {/* COMPORTAMENTO SUSPEITO */}
    {comportamentos.length > 0 && (
      <div className="rounded-xl border-2 border-purple-500/50 bg-purple-500/5 p-3 space-y-2">
        <p className="font-bold text-purple-600 flex items-center gap-2">
          🔍 Comportamento atípico detectado ({comportamentos.length} funcionário{comportamentos.length > 1 ? "s" : ""})
        </p>
        {comportamentos.map(e => (
          <div key={e.id} className="bg-white/50 dark:bg-black/20 rounded-lg p-2.5 space-y-1">
            <p className="text-xs font-semibold text-foreground">{e.name}</p>
            {e.alertas.map((alerta, i) => (
              <p key={i} className="text-xs text-purple-700">{alerta}</p>
            ))}
          </div>
        ))}
      </div>
    )}

    {/* INCONSISTÊNCIAS — destaque máximo */}
    {comInconsistencias.length > 0 && (
      <div className="rounded-xl border-2 border-orange-500/50 bg-orange-500/5 p-3 space-y-2">
        <p className="font-bold text-orange-600 flex items-center gap-2">
          ⚠️ Inconsistências detectadas ({comInconsistencias.length} funcionário{comInconsistencias.length > 1 ? "s" : ""})
        </p>
        {comInconsistencias.map(e => (
          <div key={e.id} className="bg-white/50 dark:bg-black/20 rounded-lg p-2.5 space-y-1.5">
            <p className="text-xs font-semibold text-foreground">{e.name}</p>
            {e.inconsistencias.map((inc, ii) => (
              <div key={ii} className="flex items-center justify-between gap-2">
                <span className="text-xs text-orange-700 flex items-center gap-1.5">
                  {inconsistenciaIcon[inc.tipo]} {inc.mensagem}
                </span>
                <button
                  onClick={() => onNavigate?.("records")}
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-500 text-white hover:bg-orange-600 transition-colors whitespace-nowrap"
                >
                  Corrigir →
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    )}
  </>
)}


{/* Próximos feriados */}
      {(() => {
        const feriados = [
          { data: "2026-06-04", nome: "Corpus Christi", tipo: "Nacional" },
          { data: "2026-09-07", nome: "Independência do Brasil", tipo: "Nacional" },
          { data: "2026-10-12", nome: "Nossa Sra. Aparecida", tipo: "Nacional" },
          { data: "2026-11-02", nome: "Finados", tipo: "Nacional" },
          { data: "2026-11-15", nome: "Proclamação da República", tipo: "Nacional" },
          { data: "2026-11-20", nome: "Consciência Negra", tipo: "Nacional" },
          { data: "2026-12-25", nome: "Natal", tipo: "Nacional" },
          { data: "2027-01-01", nome: "Ano Novo", tipo: "Nacional" },
          { data: "2027-04-21", nome: "Tiradentes", tipo: "Nacional" },
          { data: "2027-05-01", nome: "Dia do Trabalho", tipo: "Nacional" },
        ];
        const hoje = new Date();
        const proximos = feriados
          .map(f => ({ ...f, date: new Date(f.data + "T12:00:00") }))
          .filter(f => f.date >= hoje)
          .slice(0, 4);
        if (proximos.length === 0) return null;
        return (
          <div className="rounded-2xl border border-blue-100 bg-white p-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">📅 Próximos Feriados</p>
            <div className="space-y-2">
              {proximos.map((f, i) => {
                const diffDays = Math.ceil((f.date.getTime() - hoje.getTime()) / 86400000);
                return (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0" style={{ background: "#eff6ff" }}>
                        <p className="text-[10px] font-bold text-blue-400 uppercase">{f.date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</p>
                        <p className="text-sm font-black text-blue-700 leading-none">{f.date.getDate()}</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-700">{f.nome}</p>
                        <p className="text-[10px] text-gray-400">{f.tipo}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-1 rounded-full" style={{ background: diffDays <= 7 ? "#fef3c7" : "#f1f5f9", color: diffDays <= 7 ? "#b45309" : "#64748b" }}>
                      {diffDays === 0 ? "Hoje!" : diffDays === 1 ? "Amanhã" : `em ${diffDays}d`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Linha do tempo operacional */}
      {statuses.filter(e => e.lastTime).length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">🕐 Linha do Tempo Operacional <span className="text-emerald-500 ml-1">● Tempo real</span></p>
          <div className="space-y-2">
            {statuses
              .filter(e => e.records.length > 0)
              .flatMap(e => e.records.map(r => ({ ...r, name: e.name, id: e.id })))
              .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
              .slice(0, 8)
              .map((r, i) => {
                const colors: Record<string, { bg: string; text: string; label: string }> = {
                  entrada: { bg: "#dcfce7", text: "#15803d", label: "Entrada" },
                  intervalo: { bg: "#fef3c7", text: "#b45309", label: "Saída p/ Almoço" },
                  retorno: { bg: "#dbeafe", text: "#1e40af", label: "Retorno" },
                  saida: { bg: "#fee2e2", text: "#dc2626", label: "Saída" },
                };
                const c = colors[r.type] || { bg: "#f1f5f9", text: "#64748b", label: r.type };
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
                      {r.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 truncate">{r.name}</p>
                      <p className="text-[10px] text-gray-400">{fmtTime(r.time)}</p>
                    </div>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: c.bg, color: c.text }}>
                      {c.label}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Pendências consolidadas */}
      {(() => {
        const pendencias = [];
        const semSaida = statuses.filter(e => {
          const hora = new Date().getHours();
          return e.lastType && e.lastType !== "saida" && hora >= 18;
        });
        if (semSaida.length > 0) pendencias.push({ icon: "🚪", label: `${semSaida.length} funcionário${semSaida.length > 1 ? "s" : ""} sem saída após 18h`, cor: "#dc2626", bg: "#fee2e2", action: "records" });
        if (atestadosPendentes > 0) pendencias.push({ icon: "📋", label: `${atestadosPendentes} atestado${atestadosPendentes > 1 ? "s" : ""} aguardando aprovação`, cor: "#7c3aed", bg: "#f5f3ff", action: "justifications" });
        if (bancoCriticos.length > 0) pendencias.push({ icon: "🏦", label: `${bancoCriticos.length} funcionário${bancoCriticos.length > 1 ? "s" : ""} com banco de horas crítico`, cor: "#b45309", bg: "#fef3c7", action: "banco-horas" });
        if (comInconsistencias.length > 0) pendencias.push({ icon: "⚠️", label: `${comInconsistencias.length} inconsistência${comInconsistencias.length > 1 ? "s" : ""} nos registros hoje`, cor: "#ea580c", bg: "#fff7ed", action: "records" });
        if (pendencias.length === 0) return null;
        return (
          <div className="rounded-2xl border border-gray-100 bg-white p-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">⚠️ Pendências</p>
            <div className="space-y-2">
              {pendencias.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl" style={{ background: p.bg }}>
                  <p className="text-sm font-semibold" style={{ color: p.cor }}>{p.icon} {p.label}</p>
                  <button onClick={() => onNavigate?.(p.action)} className="text-[11px] font-bold px-3 py-1 rounded-full text-white transition-all" style={{ background: p.cor }}>
                    Ver →
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Alertas */}
      <div className="space-y-2">
        {faltas.length > 0 && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
            <p className="font-semibold text-rose-600 mb-1.5">🔴 Faltas hoje ({faltas.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {faltas.map(e => (
                <span key={e.id} className="text-xs bg-rose-500/10 text-rose-700 px-2 py-0.5 rounded-full">{e.name}</span>
              ))}
            </div>
          </div>
        )}

        {atrasados.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="font-semibold text-amber-600 mb-1.5">⚠️ Atrasados ({atrasados.length})</p>
            <div className="space-y-1">
              {atrasados.map(e => (
                <div key={e.id} className="flex items-center justify-between text-xs">
                  <span className="text-amber-700">{e.name}</span>
                  <span className="text-muted-foreground">{e.lastTime ? fmtTime(e.lastTime) : "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {incompletos.filter(e => e.status !== "atrasou").length > 0 && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
            <p className="font-semibold text-blue-600 mb-1.5">🕐 Ponto incompleto ({incompletos.filter(e => e.status !== "atrasou").length})</p>
            <div className="space-y-1">
              {incompletos.filter(e => e.status !== "atrasou").map(e => (
                <div key={e.id} className="flex items-center justify-between text-xs">
                  <span className="text-blue-700">{e.name}</span>
                  <span className="text-muted-foreground">último: {e.lastType ? STEP_LABELS[e.lastType] : "—"} {e.lastTime ? fmtTime(e.lastTime) : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(role === "admin" || role === "rh" || !role) && bancoCriticos.length > 0 && (
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-3">
            <p className="font-semibold text-orange-600 mb-1.5">🏦 Banco de horas crítico ({bancoCriticos.length})</p>
            <div className="space-y-1">
              {bancoCriticos.map(e => (
                <div key={e.name} className="flex items-center justify-between text-xs">
                  <span className="text-orange-700">{e.name}</span>
                  <span className={`font-semibold ${e.saldo < 0 ? "text-rose-600" : "text-emerald-600"}`}>{fmtHoras(e.saldo)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(role === "admin" || role === "rh" || !role) && atestadosPendentes > 0 && (
          <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-3 flex items-center justify-between">
            <p className="font-semibold text-purple-600">📋 Atestados pendentes</p>
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-purple-600">{atestadosPendentes}</span>
              <button onClick={() => onNavigate?.("justifications")}
                className="text-xs font-semibold px-3 py-1 rounded-full bg-purple-500 text-white hover:bg-purple-600">
                Ver →
              </button>
            </div>
          </div>
        )}
      </div>

      {horaExtraTotal > 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center justify-between">
          <p className="font-semibold text-emerald-600">⏱️ Horas extras hoje</p>
          <span className="text-lg font-bold text-emerald-600">+{fmtHoras(horaExtraTotal)}</span>
        </div>
      )}

      {/* Tabela situação atual */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Situação atual</p>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-2 text-left font-medium text-muted-foreground">Funcionário</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Último registro</th>
                {role !== "usuario" && <th className="p-2 text-center font-medium text-muted-foreground">Horas</th>}
                <th className="p-2 text-center font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {statuses.map((e, i) => (
                <>
                  <tr key={e.id} className={`border-t border-border/50 ${i % 2 === 0 ? "" : "bg-muted/20"} cursor-pointer hover:bg-muted/40 transition-colors`}
                    onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
                    <td className="p-2 font-medium text-foreground">
                      <div className="flex items-center gap-1">
                        <span className={`text-muted-foreground text-xs transition-transform ${expandedId === e.id ? "rotate-90" : ""}`}>▶</span>
                        {e.name}
                        {e.inconsistencias.length > 0 && (
                          <span className="ml-1 w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" title={`${e.inconsistencias.length} inconsistência(s)`} />
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {e.lastType ? `${STEP_LABELS[e.lastType]} ${e.lastTime ? fmtTime(e.lastTime) : ""}` : "—"}
                    </td>
                    {role !== "usuario" && (
                      <td className="p-2 text-center tabular-nums">
                        {e.horasHoje > 0 ? fmtHoras(e.horasHoje) : "—"}
                      </td>
                    )}
                    <td className="p-2 text-center">
                      {e.status === "presente" && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[11px] font-bold">✓ OK</span>}
                      {e.status === "falta" && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[11px] font-bold">✕ Falta</span>}
                      {e.status === "atrasou" && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 text-amber-900 text-[11px] font-bold">⚠ Atrasou</span>}
                      {e.status === "incompleto" && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-800 text-white text-[11px] font-bold">🕐 Em curso</span>}
                    </td>
                  </tr>
                  {expandedId === e.id && (
                    <tr key={`${e.id}-detail`} className="border-t border-border/50 bg-muted/10">
                      <td colSpan={4} className="px-6 py-4">
                        {/* Inconsistências no detalhe */}
                        {e.inconsistencias.length > 0 && (
                          <div className="mb-3 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 space-y-1.5">
                            {e.inconsistencias.map((inc, ii) => (
                              <div key={ii} className="flex items-center justify-between gap-2">
                                <span className="text-xs text-orange-700">{inconsistenciaIcon[inc.tipo]} {inc.mensagem}</span>
                                <button
                                  onClick={(ev) => { ev.stopPropagation(); onNavigate?.("records"); }}
                                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-500 text-white hover:bg-orange-600 transition-colors whitespace-nowrap"
                                >
                                  Corrigir →
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Timeline */}
                        {e.records.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Nenhum registro hoje.</p>
                        ) : (
                          <div className="relative pl-4">
                            <div className="absolute left-1.5 top-0 bottom-0 w-0.5 bg-border" />
                            {e.records.map((r, ri) => {
                              const next = e.records[ri + 1];
                              const durMin = next
                                ? Math.round((new Date(next.time).getTime() - new Date(r.time).getTime()) / 60000)
                                : null;
                              const durStr = durMin !== null
                                ? durMin >= 60 ? `${Math.floor(durMin / 60)}h${String(durMin % 60).padStart(2, "0")}m` : `${durMin}min`
                                : null;
                              const colors: Record<string, string> = {
                                entrada: "bg-emerald-500",
                                intervalo: "bg-amber-400",
                                retorno: "bg-blue-500",
                                saida: "bg-rose-500",
                              };
                              return (
                                <div key={ri} className="relative flex items-start gap-3 mb-3">
                                  <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-0.5 ${colors[r.type] || "bg-gray-400"}`} />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-semibold text-foreground">{STEP_LABELS[r.type] || r.type}</span>
                                      <span className="text-xs font-mono text-muted-foreground">{fmtTime(r.time)}</span>
                                    </div>
                                    {durStr && <p className="text-[11px] text-muted-foreground mt-0.5">⏱ {durStr} até o próximo</p>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {statuses.length === 0 && (
        <p className="text-center text-muted-foreground py-8">Nenhum funcionário ativo encontrado.</p>
      )}
    </div>
  );
}