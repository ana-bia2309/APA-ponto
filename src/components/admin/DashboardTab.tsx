import { Fragment, useEffect, useState, useCallback } from "react";
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
  todayStr: string,
  isNoturno: boolean = false
): Inconsistencia[] {
  const inconsistencias: Inconsistencia[] = [];
  const nowH = now.getHours() + now.getMinutes() / 60;

  const entrada = empRecords.find(r => r.record_type === "entrada");
  const intervalo = empRecords.find(r => r.record_type === "intervalo");
  const retorno = empRecords.find(r => r.record_type === "retorno");
  const saida = empRecords.find(r => r.record_type === "saida");

  // 1. Esqueceu retorno do almoço — só diurnos (plantonista pausa de madrugada)
  if (!isNoturno && intervalo && !retorno && !saida && nowH >= 14) {
    const intervaloH = new Date(intervalo.recorded_at).getHours() + new Date(intervalo.recorded_at).getMinutes() / 60;
    const diffMin = Math.round((nowH - intervaloH) * 60);
    inconsistencias.push({
      tipo: "esqueceu_retorno",
      mensagem: `Saiu para almoço há ${diffMin >= 60 ? Math.floor(diffMin / 60) + "h" + String(diffMin % 60).padStart(2, "0") + "m" : diffMin + "min"} e não retornou`,
    });
  }

  // 2. Jornada excedeu o limite — 10h diurno, 12h30 plantão
  if (entrada && saida) {
    const diffH = (new Date(saida.recorded_at).getTime() - new Date(entrada.recorded_at).getTime()) / 3600000;
    const limite = isNoturno ? 12.5 : 10;
    if (diffH > limite) {
      inconsistencias.push({
        tipo: "jornada_longa",
        mensagem: `Jornada de ${fmtHoras(diffH)} excede o limite de ${isNoturno ? "12h30" : "10h"}`,
      });
    }
  }

  // 3. Ponto duplicado (vale para todos)
  const tipos = empRecords.map(r => r.record_type);
  const duplicados = tipos.filter((t, i) => tipos.indexOf(t) !== i);
  if (duplicados.length > 0) {
    const uniq = [...new Set(duplicados)];
    inconsistencias.push({
      tipo: "duplicado",
      mensagem: `Registro duplicado: ${uniq.map(t => STEP_LABELS[t] || t).join(", ")}`,
    });
  }

  // 4. Entrada fora do turno — só diurnos
  if (!isNoturno && entrada) {
    const entradaH = new Date(entrada.recorded_at).getHours();
    if (entradaH < 5 || entradaH >= 22) {
      inconsistencias.push({
        tipo: "fora_turno",
        mensagem: `Entrada às ${fmtTime(entrada.recorded_at)} fora do horário normal`,
      });
    }
  }

  // 5. Sem saída após 20h — não se aplica a plantonista (jornada vira a noite)
  if (!isNoturno && entrada && !saida && nowH >= 20) {
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
  const [comportamentos, setComportamentos] = useState<{ id: string; name: string; alertas: string[] }[]>([]);
  const [aniversariantes, setAniversariantes] = useState<{ name: string; dia: number; cargo: string | null }[]>([]);
  const [riscosTrabalhistas, setRiscosTrabalhistas] = useState<{ name: string; alertas: string[] }[]>([]);
  const [sobrecargaIA, setSobrecargaIA] = useState<{ name: string; score: number; alertas: string[] }[]>([]);
  const [previsaoAtrasos, setPrevisaoAtrasos] = useState<{ name: string; probabilidade: number; motivo: string }[]>([]);
  const [afastamentosHoje, setAfastamentosHoje] = useState<Set<string>>(new Set());
  const [afastamentoInfo, setAfastamentoInfo] = useState<Record<string, string>>({});
  const [retornandoEmBreve, setRetornandoEmBreve] = useState<{ name: string; tipo: string; dataFim: string; diasRestantes: number }[]>([]);
  const [trocasPendentes, setTrocasPendentes] = useState<{ id: string; name: string; dataOriginal: string; dataCompensacao: string | null }[]>([]);
  const [decimoTerceiroAlerta, setDecimoTerceiroAlerta] = useState<{ parcela: "primeira" | "segunda"; dias: number; pendentes: number } | null>(null);
  const [marcandoTroca, setMarcandoTroca] = useState<string | null>(null);
  const [feriasVencidas, setFeriasVencidas] = useState<{ name: string; diasDisponiveis: number }[]>([]);
  const [comparativo, setComparativo] = useState<{
    presencaMes: number; presencaMesAnterior: number;
    atrasosMes: number; atrasosMesAnterior: number;
    horasExtrasMes: number; horasExtrasMesAnterior: number;
  } | null>(null);

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

      const todayForAfastamento = new Date().toISOString().slice(0, 10);
      const [empRes, recordsRes, bancoRes, justRes, afastRes] = await Promise.all([
        supabase.from("employees").select("id, name, shift, escala").eq("active", true).order("name"),
        (supabase as any).from("time_records")
          .select("id, employee_id, record_type, recorded_at")
          .gte("recorded_at", startOfDay)
          .lte("recorded_at", endOfDay)
          .order("recorded_at", { ascending: true }),
        (supabase as any).rpc("get_saldos_banco_horas"),
        supabase.from("absence_justifications").select("id", { count: "exact", head: true }).eq("status", "pendente"),
        (supabase as any).from("afastamentos").select("employee_id, tipo, data_inicio, data_fim")
          .lte("data_inicio", todayForAfastamento)
          .gte("data_fim", todayForAfastamento),
      ]);

      const employees = empRes.data || [];
      const records = recordsRes.data || [];
      const afastSet = new Set<string>(
        (afastRes.data || []).map((a: any) => a.employee_id)
      );
      const afastInfo: Record<string, string> = {};
      (afastRes.data || []).forEach((a: any) => {
        const labels: Record<string, string> = {
          licenca_medica: "Licença Médica",
          licenca_maternidade: "Lic. Maternidade",
          licenca_paternidade: "Lic. Paternidade",
          ferias: "Férias",
          acidente_trabalho: "Acidente de Trabalho",
          suspensao: "Suspenso",
          outro: "Afastado",
        };
        afastInfo[a.employee_id] = labels[a.tipo] || "Afastado";
      });
      setAfastamentosHoje(afastSet);
      setAfastamentoInfo(afastInfo);

      // Afastamentos terminando nos próximos 2 dias
      const em2dias = new Date();
      em2dias.setDate(em2dias.getDate() + 2);
      const em2diasStr = em2dias.toISOString().slice(0, 10);

      const { data: retornando } = await (supabase as any)
        .from("afastamentos")
        .select("employee_id, tipo, data_fim")
        .gte("data_fim", todayForAfastamento)
        .lte("data_fim", em2diasStr);

      const labels: Record<string, string> = {
        licenca_medica: "Licença Médica", licenca_maternidade: "Maternidade",
        licenca_paternidade: "Paternidade", ferias: "Férias",
        acidente_trabalho: "Acidente", suspensao: "Suspensão", outro: "Afastado",
      };

      const retornandoList = (retornando || []).map((a: any) => {
        const emp = (empRes.data || []).find((e: any) => e.id === a.employee_id);
        const dataFim = new Date(a.data_fim + "T12:00:00");
        const hoje2 = new Date();
        hoje2.setHours(0, 0, 0, 0);
        const diasRestantes = Math.ceil((dataFim.getTime() - hoje2.getTime()) / 86400000);
        return {
          name: emp?.name || "Funcionário",
          tipo: labels[a.tipo] || "Afastado",
          dataFim: dataFim.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          diasRestantes,
        };
      }).sort((a: any, b: any) => a.diasRestantes - b.diasRestantes);

      setRetornandoEmBreve(retornandoList);

      // Trocas sem compensação ou ainda não compensadas
      const { data: trocas } = await (supabase as any)
        .from("trocas_plantao")
        .select("id, employee_id, data_original, data_compensacao, status")
        .eq("status", "registrado")
        .order("data_original", { ascending: true });

      const trocasList = (trocas || []).map((t: any) => {
        const emp = (empRes.data || []).find((e: any) => e.id === t.employee_id);
        return {
          id: t.id,
          name: emp?.name || "Funcionário",
          dataOriginal: new Date(t.data_original + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          dataCompensacao: t.data_compensacao
            ? new Date(t.data_compensacao + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
            : null,
        };
      });
      setTrocasPendentes(trocasList);

      // Férias vencidas ou próximas do vencimento
      try {
        const vencidas: { name: string; diasDisponiveis: number }[] = [];
        await Promise.all(
          employees.map(async (emp: any) => {
            const { data: saldoData } = await (supabase as any).rpc("get_saldo_ferias", { p_employee_id: emp.id });
            if (saldoData && saldoData.length > 0) {
              const s = saldoData[0];
              if (s.vencido && s.dias_disponiveis > 0) {
                vencidas.push({ name: emp.name, diasDisponiveis: s.dias_disponiveis });
              }
            }
          })
        );
        setFeriasVencidas(vencidas);
      } catch { }

      // Alerta de 13º salário — só nos últimos 15 dias antes de cada parcela
      try {
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const data30Nov = new Date(anoAtual, 10, 30);
        const data20Dez = new Date(anoAtual, 11, 20);
        const diasPara1a = Math.ceil((data30Nov.getTime() - hoje.getTime()) / 86400000);
        const diasPara2a = Math.ceil((data20Dez.getTime() - hoje.getTime()) / 86400000);

        let parcela: "primeira" | "segunda" | null = null;
        let dias = 0;
        if (diasPara1a >= 0 && diasPara1a <= 15) { parcela = "primeira"; dias = diasPara1a; }
        else if (diasPara2a >= 0 && diasPara2a <= 15) { parcela = "segunda"; dias = diasPara2a; }

        if (parcela) {
          const { data: registros } = await (supabase as any)
            .from("decimo_terceiro")
            .select("primeira_paga, segunda_paga")
            .eq("ano", anoAtual);
          const campo = parcela === "primeira" ? "primeira_paga" : "segunda_paga";
          const pendentes = (registros || []).filter((r: any) => !r[campo]).length;
          if (pendentes > 0) {
            setDecimoTerceiroAlerta({ parcela, dias, pendentes });
          } else {
            setDecimoTerceiroAlerta(null);
          }
        } else {
          setDecimoTerceiroAlerta(null);
        }
      } catch { }

      const bancoMap: Record<string, number> = {};
      (bancoRes.data || []).forEach((e: any) => {
        bancoMap[e.employee_id] = Number(e.saldo) || 0;
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
        const isNoturno = (emp as any).shift === "noturno" || ((emp as any).escala || "").toLowerCase().includes("12x36");
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
        if (afastSet.has(emp.id)) status = "presente";
        else if (!isWorkDay) status = "presente";
        else if (saida) status = "presente";
        else if (entrada) {
          const limite = new Date(`${todayStr}T${isNoturno ? "19:15" : "08:15"}:00-03:00`);
          status = new Date(entrada.recorded_at) > limite ? "atrasou" : "incompleto";
        } else if (isNoturno) {
          status = "presente";
        }

        const inconsistencias = detectarInconsistencias(empRecords, now, todayStr, isNoturno);

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

      const comportSuspeitos: { id: string; name: string; alertas: string[] }[] = [];

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
            alertas.push(`🤖 Saída sempre às ${String(Math.floor(minuto / 60)).padStart(2, "0")}:${String(minuto % 60).padStart(2, "0")} (${maxFreq}x)`);
          }
        }

        if (alertas.length > 0) comportSuspeitos.push({ id: emp.id, name: emp.name, alertas });
      });
      setComportamentos(comportSuspeitos);

      // Aniversariantes do mês
      try {
        const mesAtual = new Date().getMonth() + 1;
        const { data: anivData } = await (supabase as any)
          .from("employees")
          .select("name, data_nascimento, cargo")
          .eq("active", true)
          .not("data_nascimento", "is", null);

        const anivMes = (anivData || [])
          .filter((e: any) => parseInt(e.data_nascimento?.slice(5, 7)) === mesAtual)
          .map((e: any) => ({
            name: e.name,
            dia: parseInt(e.data_nascimento.slice(8, 10)),
            cargo: e.cargo,
          }))
          .sort((a: any, b: any) => a.dia - b.dia);
        setAniversariantes(anivMes);
      } catch { }

      // Detector de risco trabalhista
      try {
        const riscos: { name: string; alertas: string[] }[] = [];
        const ultimos7 = new Date();
        ultimos7.setDate(ultimos7.getDate() - 7);
        const { data: recSemana } = await (supabase as any)
          .from("time_records")
          .select("employee_id, record_type, recorded_at")
          .gte("recorded_at", ultimos7.toISOString())
          .order("recorded_at", { ascending: true });

        employees.forEach(emp => {
          const alertas: string[] = [];
          const empRecs = (recSemana || []).filter((r: any) => r.employee_id === emp.id);

          // Por dia
          const porDia: Record<string, any[]> = {};
          empRecs.forEach((r: any) => {
            const dia = r.recorded_at.slice(0, 10);
            if (!porDia[dia]) porDia[dia] = [];
            porDia[dia].push(r);
          });

          let diasSemIntervalo = 0;
          let diasComHoraExtra = 0;
          let totalHorasSemana = 0;

          Object.entries(porDia).forEach(([, recs]) => {
            const entrada = recs.find((r: any) => r.record_type === "entrada");
            const intervalo = recs.find((r: any) => r.record_type === "intervalo");
            const saida = recs.find((r: any) => r.record_type === "saida");

            if (entrada && saida && !intervalo) diasSemIntervalo++;

            if (entrada && saida) {
              const horas = (new Date(saida.recorded_at).getTime() - new Date(entrada.recorded_at).getTime()) / 3600000;
              totalHorasSemana += horas;
              if (horas > 10) diasComHoraExtra++;
            }
          });

          if (diasSemIntervalo >= 2) alertas.push(`🍽️ ${diasSemIntervalo} dias sem intervalo de almoço esta semana`);
          if (diasComHoraExtra >= 3) alertas.push(`⏰ ${diasComHoraExtra} dias com jornada acima de 10h esta semana`);
          if (totalHorasSemana > 44) alertas.push(`📋 ${Math.round(totalHorasSemana)}h trabalhadas esta semana (limite CLT: 44h)`);

          if (alertas.length > 0) riscos.push({ name: emp.name, alertas });
        });

        setRiscosTrabalhistas(riscos);
      } catch { }

      // Detector de sobrecarga IA
      try {
        const sobrecarga: { name: string; score: number; alertas: string[] }[] = [];

        employees.forEach(emp => {
          const alertas: string[] = [];
          let score = 0;
          const empMonth = (monthRecords || []).filter((r: any) => r.employee_id === emp.id);

          const porDia: Record<string, any[]> = {};
          empMonth.forEach((r: any) => {
            const dia = r.recorded_at.slice(0, 10);
            if (!porDia[dia]) porDia[dia] = [];
            porDia[dia].push(r);
          });

          let totalHorasMes = 0;
          let diasTrabalhadosMes = 0;
          let diasComHoraExtra = 0;
          let diasSemIntervalo = 0;
          let maxHorasDia = 0;

          Object.values(porDia).forEach(recs => {
            const entrada = recs.find((r: any) => r.record_type === "entrada");
            const saida = recs.find((r: any) => r.record_type === "saida");
            const intervalo = recs.find((r: any) => r.record_type === "intervalo");
            if (entrada && saida) {
              const horas = (new Date(saida.recorded_at).getTime() - new Date(entrada.recorded_at).getTime()) / 3600000;
              totalHorasMes += horas;
              diasTrabalhadosMes++;
              if (horas > maxHorasDia) maxHorasDia = horas;
              if (horas > 9) diasComHoraExtra++;
              if (!intervalo && horas > 6) diasSemIntervalo++;
            }
          });

          const mediaHorasDia = diasTrabalhadosMes > 0 ? totalHorasMes / diasTrabalhadosMes : 0;

          // Critérios de sobrecarga
          if (totalHorasMes > 200) {
            score += 35;
            alertas.push(`⏱️ ${Math.round(totalHorasMes)}h trabalhadas no mês (limite saudável: 180h)`);
          }
          if (mediaHorasDia > 9.5) {
            score += 25;
            alertas.push(`📊 Média de ${mediaHorasDia.toFixed(1)}h/dia nos últimos 30 dias`);
          }
          if (diasComHoraExtra >= 10) {
            score += 20;
            alertas.push(`🔴 ${diasComHoraExtra} dias com jornada acima de 9h no mês`);
          }
          if (diasSemIntervalo >= 5) {
            score += 15;
            alertas.push(`🍽️ ${diasSemIntervalo} dias sem intervalo de almoço`);
          }
          if (maxHorasDia > 12) {
            score += 15;
            alertas.push(`⚡ Jornada máxima de ${maxHorasDia.toFixed(1)}h em um único dia`);
          }
          // Fim de semana trabalhado
          const finsSemana = Object.keys(porDia).filter(dia => {
            const dow = new Date(dia + "T12:00:00").getDay();
            return dow === 0 || dow === 6;
          });
          if (finsSemana.length >= 3) {
            score += 20;
            alertas.push(`📅 Trabalhou ${finsSemana.length} fins de semana no mês`);
          }

          if (score >= 35 && alertas.length > 0) {
            sobrecarga.push({ name: emp.name, score: Math.min(score, 100), alertas });
          }
        });

        setSobrecargaIA(sobrecarga.sort((a, b) => b.score - a.score));
      } catch { }

      // Comparativo mês anterior
      try {
        const mesAtual = new Date();
        const mesAnterior = new Date(mesAtual.getFullYear(), mesAtual.getMonth() - 1, 1);
        const inicioMesAtual = new Date(mesAtual.getFullYear(), mesAtual.getMonth(), 1).toISOString();
        const inicioMesAnterior = mesAnterior.toISOString();
        const fimMesAnterior = new Date(mesAtual.getFullYear(), mesAtual.getMonth(), 0, 23, 59, 59).toISOString();

        const [recMesAtual, recMesAnterior] = await Promise.all([
          (supabase as any).from("time_records").select("employee_id, record_type, recorded_at")
            .gte("recorded_at", inicioMesAtual).lte("recorded_at", endOfDay),
          (supabase as any).from("time_records").select("employee_id, record_type, recorded_at")
            .gte("recorded_at", inicioMesAnterior).lte("recorded_at", fimMesAnterior),
        ]);

        const calcStats = (recs: any[]) => {
          const porDia: Record<string, Set<string>> = {};
          const atrasos: Set<string> = new Set();
          let horasExtras = 0;
          recs.forEach((r: any) => {
            const dia = r.recorded_at.slice(0, 10);
            if (!porDia[dia]) porDia[dia] = new Set();
            porDia[dia].add(r.employee_id);
            if (r.record_type === "entrada") {
              const h = new Date(r.recorded_at).getHours();
              const m = new Date(r.recorded_at).getMinutes();
              if (h > 8 || (h === 8 && m > 15)) atrasos.add(`${r.employee_id}_${dia}`);
            }
          });
          const diasComPresenca = Object.values(porDia).reduce((acc, s) => acc + s.size, 0);
          return { presenca: diasComPresenca, atrasos: atrasos.size, horasExtras };
        };

        const statsMes = calcStats(recMesAtual.data || []);
        const statsAnterior = calcStats(recMesAnterior.data || []);
        setComparativo({
          presencaMes: statsMes.presenca,
          presencaMesAnterior: statsAnterior.presenca,
          atrasosMes: statsMes.atrasos,
          atrasosMesAnterior: statsAnterior.atrasos,
          horasExtrasMes: horaExtraTotal,
          horasExtrasMesAnterior: 0,
        });
      } catch { }
      // IA de previsão de atrasos
      try {
        const amanha = new Date();
        amanha.setDate(amanha.getDate() + 1);
        const diaSemanaAmanha = amanha.getDay();
        const previsoes: { name: string; probabilidade: number; motivo: string }[] = [];

        employees.forEach(emp => {
          const empMonth = (monthRecords || []).filter((r: any) => r.employee_id === emp.id);
          const porDia: Record<string, any[]> = {};
          empMonth.forEach((r: any) => {
            const dia = r.recorded_at.slice(0, 10);
            if (!porDia[dia]) porDia[dia] = [];
            porDia[dia].push(r);
          });

          let score = 0;
          const motivos: string[] = [];

          // 1. Taxa de atraso histórica
          const diasComEntrada = Object.entries(porDia).filter(([, recs]) => recs.some((r: any) => r.record_type === "entrada"));
          const diasAtrasados = diasComEntrada.filter(([, recs]) => {
            const entrada = recs.find((r: any) => r.record_type === "entrada");
            if (!entrada) return false;
            const h = new Date(entrada.recorded_at).getHours();
            const m = new Date(entrada.recorded_at).getMinutes();
            return h > 8 || (h === 8 && m > 15);
          });
          const taxaAtraso = diasComEntrada.length > 0 ? diasAtrasados.length / diasComEntrada.length : 0;
          if (taxaAtraso > 0.3) { score += 40; motivos.push(`${Math.round(taxaAtraso * 100)}% de atrasos no mês`); }

          // 2. Padrão de atraso no mesmo dia da semana
          const mesmoDia = diasAtrasados.filter(([dia]) => new Date(dia + "T12:00:00").getDay() === diaSemanaAmanha);
          const totalMesmoDia = diasComEntrada.filter(([dia]) => new Date(dia + "T12:00:00").getDay() === diaSemanaAmanha);
          if (totalMesmoDia.length >= 2 && mesmoDia.length / totalMesmoDia.length > 0.5) {
            score += 30;
            const nomes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
            motivos.push(`Costuma atrasar às ${nomes[diaSemanaAmanha]}feiras`);
          }

          // 3. Saída muito tarde ontem (cansaço)
          const ontemStr = todayStr;
          const ontemRecs = porDia[ontemStr] || [];
          const saidaOntem = ontemRecs.find((r: any) => r.record_type === "saida");
          if (saidaOntem) {
            const h = new Date(saidaOntem.recorded_at).getHours();
            if (h >= 20) { score += 20; motivos.push(`Saiu tarde hoje (${h}h)`); }
          }

          // 4. Últimos 3 dias com atraso consecutivo
          const ultimos3 = Object.keys(porDia).sort().slice(-3);
          const atrasos3 = ultimos3.filter(dia => {
            const recs = porDia[dia];
            const entrada = recs?.find((r: any) => r.record_type === "entrada");
            if (!entrada) return false;
            const h = new Date(entrada.recorded_at).getHours();
            const m = new Date(entrada.recorded_at).getMinutes();
            return h > 8 || (h === 8 && m > 15);
          });
          if (atrasos3.length >= 2) { score += 25; motivos.push(`${atrasos3.length} atrasos nos últimos 3 dias`); }

          if (score >= 40) {
            previsoes.push({
              name: emp.name,
              probabilidade: Math.min(score, 95),
              motivo: motivos.slice(0, 2).join(" • "),
            });
          }
        });

        setPrevisaoAtrasos(previsoes.sort((a, b) => b.probabilidade - a.probabilidade).slice(0, 5));
      } catch { }

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
  const marcarTrocaCompensada = async (id: string) => {
    setMarcandoTroca(id);
    await (supabase as any)
      .from("trocas_plantao")
      .update({ status: "compensado" })
      .eq("id", id);
    setTrocasPendentes(prev => prev.filter(t => t.id !== id));
    setMarcandoTroca(null);
  };
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

      {/* Alerta de 13º salário */}
      {decimoTerceiroAlerta && (role === "admin" || role === "rh" || !role) && (
        <div className="rounded-xl border-2 border-blue-400/50 bg-blue-50 dark:bg-blue-950/20 p-3 space-y-1">
          <p className="font-bold text-blue-700 flex items-center gap-2 text-sm">
            🎁 {decimoTerceiroAlerta.parcela === "primeira" ? "1ª" : "2ª"} parcela do 13º — vence em {decimoTerceiroAlerta.dias === 0 ? "hoje" : `${decimoTerceiroAlerta.dias} dia(s)`}
          </p>
          <p className="text-xs text-blue-600">
            {decimoTerceiroAlerta.pendentes} funcionário{decimoTerceiroAlerta.pendentes > 1 ? "s" : ""} ainda sem pagamento registrado
          </p>
          <button
            onClick={() => onNavigate?.("decimo-terceiro")}
            className="text-[11px] font-semibold px-3 py-1 rounded-full text-white transition-all"
            style={{ background: "#2563eb" }}
          >
            Ver 13º Salário →
          </button>
        </div>
      )}

      {/* Férias vencidas */}
      {feriasVencidas.length > 0 && (role === "admin" || role === "rh" || !role) && (
        <div className="rounded-xl border-2 border-rose-500/50 bg-rose-50 dark:bg-rose-950/20 p-3 space-y-2">
          <p className="font-bold text-rose-700 flex items-center gap-2 text-sm">
            🌴 Férias vencidas ({feriasVencidas.length} funcionário{feriasVencidas.length > 1 ? "s" : ""})
          </p>
          <div className="space-y-1.5">
            {feriasVencidas.map((f, i) => (
              <div key={i} className="flex items-center justify-between bg-white/60 dark:bg-black/20 rounded-lg px-3 py-2">
                <p className="text-xs font-bold text-rose-800">{f.name}</p>
                <span className="text-xs font-black text-rose-600">{f.diasDisponiveis}d acumulado(s)</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-rose-500">⚖️ Período aquisitivo encerrado sem férias programadas — risco de pagamento em dobro (CLT Art. 137)</p>
        </div>
      )}

      {/* Trocas de plantão pendentes */}
      {trocasPendentes.length > 0 && (role === "admin" || role === "rh" || !role) && (
        <div className="rounded-xl border-2 border-violet-400/50 bg-violet-50 dark:bg-violet-950/20 p-3 space-y-2">
          <p className="font-bold text-violet-700 flex items-center gap-2 text-sm">
            🔄 Trocas pendentes ({trocasPendentes.length})
          </p>
          {trocasPendentes.map((t) => (
            <div key={t.id}
              className="flex items-center justify-between bg-white/60 dark:bg-black/20 rounded-lg px-3 py-2 gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-violet-800 truncate">{t.name}</p>
                <p className="text-[10px] text-violet-600">
                  Plantão {t.dataOriginal}
                  {t.dataCompensacao
                    ? <span className="ml-1 text-emerald-600">· Compensa {t.dataCompensacao}</span>
                    : <span className="ml-1 text-amber-600">· Sem data de compensação</span>
                  }
                </p>
              </div>
              <button
                onClick={() => marcarTrocaCompensada(t.id)}
                disabled={marcandoTroca === t.id}
                className="flex-shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full text-white transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}
              >
                {marcandoTroca === t.id ? "..." : "✓ Compensada"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Retornando em breve */}
      {retornandoEmBreve.length > 0 && (
        <div className="rounded-xl border-2 border-amber-400/50 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
          <p className="font-bold text-amber-700 flex items-center gap-2 text-sm">
            🔔 Retorno em breve ({retornandoEmBreve.length} funcionário{retornandoEmBreve.length > 1 ? "s" : ""})
          </p>
          {retornandoEmBreve.map((r, i) => (
            <div key={i} className="flex items-center justify-between bg-white/60 dark:bg-black/20 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs font-bold text-amber-800">{r.name}</p>
                <p className="text-[10px] text-amber-600">{r.tipo}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-black text-amber-700">
                  {r.diasRestantes === 0 ? "Retorna hoje" : r.diasRestantes === 1 ? "Retorna amanhã" : `Retorna em ${r.diasRestantes} dias`}
                </p>
                <p className="text-[10px] text-amber-500">até {r.dataFim}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Aniversariantes do mês */}
      {aniversariantes.length > 0 && (
        <div className="rounded-2xl border border-amber-100 bg-white p-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
            🎂 Aniversariantes de {new Date().toLocaleDateString("pt-BR", { month: "long" })}
          </p>
          <div className="space-y-2">
            {aniversariantes.map((a, i) => {
              const hoje = new Date().getDate();
              const isHoje = a.dia === hoje;
              const jaPassou = a.dia < hoje;
              return (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl"
                  style={{ background: isHoje ? "#fffbeb" : "#f8fafc" }}>
                  <span className="text-lg">{isHoje ? "🎉" : "🎂"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-800">{a.name}</p>
                    {a.cargo && <p className="text-[10px] text-gray-400">{a.cargo}</p>}
                  </div>
                  <p className="text-xs font-black flex-shrink-0"
                    style={{ color: isHoje ? "#b45309" : jaPassou ? "#94a3b8" : "#1e40af" }}>
                    {isHoje ? "Hoje! 🥳" : `dia ${a.dia}`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Comparativo mês anterior */}
      {comparativo && (role === "admin" || role === "rh" || !role) && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
            📊 Comparativo com Mês Anterior
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Presenças",
                atual: comparativo.presencaMes,
                anterior: comparativo.presencaMesAnterior,
                icon: "✅",
                positivo: true,
              },
              {
                label: "Atrasos",
                atual: comparativo.atrasosMes,
                anterior: comparativo.atrasosMesAnterior,
                icon: "⏰",
                positivo: false,
              },
              {
                label: "Horas Extras",
                atual: Math.round(horaExtraTotal * 10) / 10,
                anterior: comparativo.horasExtrasMesAnterior,
                icon: "⏱️",
                positivo: true,
                sufixo: "h",
              },
            ].map((item) => {
              const diff = item.anterior > 0
                ? Math.round(((item.atual - item.anterior) / item.anterior) * 100)
                : 0;
              const subiu = diff > 0;
              const cor = (item.positivo ? subiu : !subiu) ? "#15803d" : "#dc2626";
              const bg = (item.positivo ? subiu : !subiu) ? "#f0fdf4" : "#fff1f2";
              return (
                <div key={item.label} className="rounded-xl p-3 text-center" style={{ background: "#f8fafc" }}>
                  <p className="text-base mb-1">{item.icon}</p>
                  <p className="text-lg font-black text-gray-800">{item.atual}{item.sufixo || ""}</p>
                  <p className="text-[10px] text-gray-400 mb-1">{item.label}</p>
                  {diff !== 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: bg, color: cor }}>
                      {subiu ? "▲" : "▼"} {Math.abs(diff)}%
                    </span>
                  )}
                  {diff === 0 && <span className="text-[10px] text-gray-400">= igual</span>}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-2 text-center">
            Comparado com {new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </p>
        </div>
      )}
      {/* Detector de risco trabalhista */}
      {riscosTrabalhistas.length > 0 && (role === "admin" || role === "rh" || !role) && (
        <div className="rounded-2xl border-2 border-red-200 bg-white p-4" style={{ boxShadow: "0 2px 8px rgba(220,38,38,0.08)" }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: "#dc2626" }}>
            🛡️ Risco Trabalhista Detectado
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "#fff1f2", color: "#dc2626" }}>
              {riscosTrabalhistas.length} funcionário{riscosTrabalhistas.length > 1 ? "s" : ""}
            </span>
          </p>
          <div className="space-y-2">
            {riscosTrabalhistas.map((r, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: "#fff1f2" }}>
                <p className="text-xs font-bold text-red-700 mb-1">{r.name}</p>
                {r.alertas.map((alerta, ii) => (
                  <p key={ii} className="text-xs text-red-600 flex items-center gap-1">{alerta}</p>
                ))}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">⚖️ Baseado nos registros dos últimos 7 dias</p>
        </div>
      )}

      {/* Detector de sobrecarga IA */}
      {sobrecargaIA.length > 0 && (role === "admin" || role === "rh" || !role) && (
        <div className="rounded-2xl border border-red-100 bg-white p-4" style={{ boxShadow: "0 2px 8px rgba(220,38,38,0.06)" }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2 text-red-600">
            🔥 IA — Detector de Sobrecarga
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "#fff1f2", color: "#dc2626" }}>
              {sobrecargaIA.length} em alerta
            </span>
          </p>
          <p className="text-[10px] text-gray-400 mb-3">Baseado nos últimos 30 dias de trabalho</p>
          <div className="space-y-3">
            {sobrecargaIA.map((e, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: "#fff1f2" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)" }}>
                      {e.name.charAt(0)}
                    </div>
                    <p className="text-xs font-bold text-red-700">{e.name}</p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-sm font-black text-red-600">{e.score}%</span>
                    <div className="w-16 h-1.5 bg-red-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-red-500" style={{ width: `${e.score}%` }} />
                    </div>
                  </div>
                </div>
                <div className="space-y-0.5">
                  {e.alertas.map((alerta, ii) => (
                    <p key={ii} className="text-[11px] text-red-600">{alerta}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* IA de previsão de atrasos */}
      {previsaoAtrasos.length > 0 && (role === "admin" || role === "rh" || !role) && (
        <div className="rounded-2xl border border-purple-100 bg-white p-4" style={{ boxShadow: "0 2px 8px rgba(124,58,237,0.08)" }}>
          <p className="text-xs font-bold uppercase tracking-widest text-purple-600 mb-1 flex items-center gap-2">
            🤖 IA — Previsão de Atrasos Amanhã
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "#f5f3ff", color: "#7c3aed" }}>
              {previsaoAtrasos.length} em risco
            </span>
          </p>
          <p className="text-[10px] text-gray-400 mb-3">Baseado no histórico dos últimos 30 dias</p>
          <div className="space-y-2">
            {previsaoAtrasos.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}>
                  {p.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-700">{p.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">{p.motivo}</p>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="text-sm font-black" style={{ color: p.probabilidade >= 70 ? "#dc2626" : p.probabilidade >= 50 ? "#d97706" : "#7c3aed" }}>
                    {p.probabilidade}%
                  </span>
                  <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden mt-0.5">
                    <div className="h-full rounded-full"
                      style={{
                        width: `${p.probabilidade}%`,
                        background: p.probabilidade >= 70 ? "#dc2626" : p.probabilidade >= 50 ? "#d97706" : "#7c3aed"
                      }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
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
                <Fragment key={e.id}>
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
                      {afastamentosHoje.has(e.id)
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 font-medium">{afastamentoInfo[e.id] || "Afastado"}</span>
                        : e.lastType ? `${STEP_LABELS[e.lastType]} ${e.lastTime ? fmtTime(e.lastTime) : ""}` : "—"}
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
                </Fragment>
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