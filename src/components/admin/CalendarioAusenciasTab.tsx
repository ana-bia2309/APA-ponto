import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RefreshCw, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;

// ── Tipos de evento ────────────────────────────────────────────────────────
interface DiaEvento {
  tipo: "afastamento" | "troca" | "ferias" | "feriado" | "plantao" | "incompleto";
  label: string;
  employeeId?: string;
  employeeName?: string;
  cor: string;
  bg: string;
}

interface DiaMapa {
  [dia: string]: DiaEvento[]; // dia = "YYYY-MM-DD"
}

// ── Feriados nacionais 2026/2027 ───────────────────────────────────────────
const FERIADOS: Record<string, string> = {
  "2026-01-01": "Ano Novo",
  "2026-04-21": "Tiradentes",
  "2026-05-01": "Dia do Trabalho",
  "2026-06-04": "Corpus Christi",
  "2026-09-07": "Independência",
  "2026-10-12": "N. Sra. Aparecida",
  "2026-11-02": "Finados",
  "2026-11-15": "Proclamação da República",
  "2026-11-20": "Consciência Negra",
  "2026-12-25": "Natal",
  "2027-01-01": "Ano Novo",
  "2027-04-21": "Tiradentes",
  "2027-05-01": "Dia do Trabalho",
};

const TIPO_CORES: Record<DiaEvento["tipo"], { cor: string; bg: string; emoji: string }> = {
  afastamento: { cor: "#b45309", bg: "#fef3c7", emoji: "🏥" },
  ferias:      { cor: "#1e40af", bg: "#dbeafe", emoji: "🏖️" },
  troca:       { cor: "#7c3aed", bg: "#ede9fe", emoji: "🔄" },
  feriado:     { cor: "#15803d", bg: "#dcfce7", emoji: "🎉" },
  plantao:     { cor: "#0e7490", bg: "#cffafe", emoji: "🌙" },
  incompleto:  { cor: "#dc2626", bg: "#fee2e2", emoji: "⚠️" },
};

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

function toLocalDate(iso: string) {
  return new Date(iso + "T12:00:00");
}

function fmtDia(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDias(base: string, n: number): string {
  const d = toLocalDate(base);
  d.setDate(d.getDate() + n);
  return fmtDia(d);
}

export default function CalendarioAusenciasTab({ employees }: { employees: Employee[] }) {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth());
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mapa, setMapa] = useState<DiaMapa>({});
  const [loading, setLoading] = useState(false);
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);
  const [filtroEmp, setFiltroEmp] = useState<string>("");

  // Legenda visível
  const [legendaVisiveis, setLegendaVisiveis] = useState<Set<DiaEvento["tipo"]>>(
    new Set(["afastamento", "ferias", "troca", "feriado", "plantao", "incompleto"])
  );

  const toggleLegenda = (tipo: DiaEvento["tipo"]) => {
    setLegendaVisiveis(prev => {
      const next = new Set(prev);
      next.has(tipo) ? next.delete(tipo) : next.add(tipo);
      return next;
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    const primeiroDia = `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
    const ultimoDia = fmtDia(new Date(ano, mes + 1, 0));
    // Janela ampliada para capturar plantões noturnos que cruzam mês
    const inicio = addDias(primeiroDia, -2);
    const fim = addDias(ultimoDia, 2);

    const novomapa: DiaMapa = {};
    const add = (dia: string, ev: DiaEvento) => {
      if (!novomapa[dia]) novomapa[dia] = [];
      novomapa[dia].push(ev);
    };

    // 1. Feriados
    Object.entries(FERIADOS).forEach(([dia, nome]) => {
      if (dia >= primeiroDia && dia <= ultimoDia) {
        add(dia, { tipo: "feriado", label: nome, cor: TIPO_CORES.feriado.cor, bg: TIPO_CORES.feriado.bg });
      }
    });

    // 2. Afastamentos e férias
    const { data: afastamentos } = await (supabase as any)
      .from("afastamentos")
      .select("employee_id, tipo, data_inicio, data_fim, motivo")
      .lte("data_inicio", ultimoDia)
      .gte("data_fim", primeiroDia);

    (afastamentos || []).forEach((a: any) => {
      const emp = employees.find(e => e.id === a.employee_id);
      const nome = emp?.name || "Funcionário";
      const tipo: DiaEvento["tipo"] = a.tipo === "ferias" ? "ferias" : "afastamento";
      const labels: Record<string, string> = {
        licenca_medica: "Lic. Médica", licenca_maternidade: "Maternidade",
        licenca_paternidade: "Paternidade", ferias: "Férias",
        acidente_trabalho: "Acidente", suspensao: "Suspensão", outro: "Afastado",
      };
      let d = a.data_inicio > primeiroDia ? a.data_inicio : primeiroDia;
      const fim2 = a.data_fim < ultimoDia ? a.data_fim : ultimoDia;
      while (d <= fim2) {
        add(d, {
          tipo, label: `${labels[a.tipo] || "Afastado"} — ${nome}`,
          employeeId: a.employee_id, employeeName: nome,
          cor: TIPO_CORES[tipo].cor, bg: TIPO_CORES[tipo].bg,
        });
        d = addDias(d, 1);
      }
    });

    // 3. Trocas de plantão
    const { data: trocas } = await (supabase as any)
      .from("trocas_plantao")
      .select("employee_id, data_original, data_compensacao, motivo, status")
      .gte("data_original", primeiroDia)
      .lte("data_original", ultimoDia);

    (trocas || []).forEach((t: any) => {
      const emp = employees.find(e => e.id === t.employee_id);
      const nome = emp?.name || "Funcionário";
      add(t.data_original, {
        tipo: "troca", label: `Troca — ${nome}`,
        employeeId: t.employee_id, employeeName: nome,
        cor: TIPO_CORES.troca.cor, bg: TIPO_CORES.troca.bg,
      });
      if (t.data_compensacao && t.data_compensacao >= primeiroDia && t.data_compensacao <= ultimoDia) {
        add(t.data_compensacao, {
          tipo: "troca", label: `Compensação — ${nome}`,
          employeeId: t.employee_id, employeeName: nome,
          cor: TIPO_CORES.troca.cor, bg: TIPO_CORES.troca.bg,
        });
      }
    });

    // 4. Plantões noturnos / 12x36
    const noturnos = employees.filter(e =>
      (e as any).shift === "noturno" ||
      ((e as any).escala || "").toLowerCase().includes("12x36")
    );
    if (noturnos.length > 0) {
      const { data: pontosNoturnos } = await (supabase as any)
        .from("time_records")
        .select("employee_id, record_type, recorded_at")
        .eq("record_type", "entrada")
        .gte("recorded_at", `${primeiroDia}T00:00:00-03:00`)
        .lte("recorded_at", `${ultimoDia}T23:59:59-03:00`)
        .in("employee_id", noturnos.map(e => e.id));

      (pontosNoturnos || []).forEach((r: any) => {
        const dia = r.recorded_at.slice(0, 10);
        if (dia < primeiroDia || dia > ultimoDia) return;
        const emp = employees.find(e => e.id === r.employee_id);
        add(dia, {
          tipo: "plantao", label: `Plantão — ${emp?.name || ""}`,
          employeeId: r.employee_id, employeeName: emp?.name,
          cor: TIPO_CORES.plantao.cor, bg: TIPO_CORES.plantao.bg,
        });
      });
    }

    // 5. Pontos incompletos do mês (entrada sem saída em dias passados)
    const ontemStr = fmtDia(new Date(hoje.getTime() - 86400000));
    const { data: registros } = await (supabase as any)
      .from("time_records")
      .select("employee_id, record_type, recorded_at")
      .gte("recorded_at", `${primeiroDia}T00:00:00-03:00`)
      .lte("recorded_at", `${ontemStr}T23:59:59-03:00`);

    if (registros) {
      const porEmpDia: Record<string, Record<string, Set<string>>> = {};
      (registros as any[]).forEach((r: any) => {
        const dia = r.recorded_at.slice(0, 10);
        if (!porEmpDia[r.employee_id]) porEmpDia[r.employee_id] = {};
        if (!porEmpDia[r.employee_id][dia]) porEmpDia[r.employee_id][dia] = new Set();
        porEmpDia[r.employee_id][dia].add(r.record_type);
      });
      Object.entries(porEmpDia).forEach(([empId, dias]) => {
        const emp = employees.find(e => e.id === empId);
        const isNoturno = (emp as any)?.shift === "noturno" ||
          ((emp as any)?.escala || "").toLowerCase().includes("12x36");
        Object.entries(dias).forEach(([dia, tipos]) => {
          if (dia > ontemStr) return;
          const temEntrada = tipos.has("entrada");
          const temSaida = tipos.has("saida");
          if (temEntrada && !temSaida && !isNoturno) {
            add(dia, {
              tipo: "incompleto", label: `Ponto incompleto — ${emp?.name || ""}`,
              employeeId: empId, employeeName: emp?.name,
              cor: TIPO_CORES.incompleto.cor, bg: TIPO_CORES.incompleto.bg,
            });
          }
        });
      });
    }

    setMapa(novomapa);
    setLoading(false);
  }, [mes, ano, employees]);

  useEffect(() => { load(); }, [load]);

  // Grade do mês
  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const diasGrid: (number | null)[] = [
    ...Array(primeiroDiaSemana).fill(null),
    ...Array.from({ length: diasNoMes }, (_, i) => i + 1),
  ];
  // Completar última semana
  while (diasGrid.length % 7 !== 0) diasGrid.push(null);

  const navMes = (delta: number) => {
    setDiaSelecionado(null);
    let m = mes + delta;
    let a = ano;
    if (m < 0) { m = 11; a--; }
    if (m > 11) { m = 0; a++; }
    setMes(m); setAno(a);
  };

  const diaStr = (n: number) =>
    `${ano}-${String(mes + 1).padStart(2, "0")}-${String(n).padStart(2, "0")}`;

  const eventosVisiveis = (dia: string) =>
    (mapa[dia] || []).filter(ev =>
      legendaVisiveis.has(ev.tipo) &&
      (!filtroEmp || ev.employeeId === filtroEmp || !ev.employeeId)
    );

  const totalEventosDia = (dia: string) => eventosVisiveis(dia).length;
  const isHoje = (n: number) =>
    diaStr(n) === fmtDia(hoje);

  // Eventos do dia selecionado
  const eventosSelecionados = diaSelecionado ? eventosVisiveis(diaSelecionado) : [];

  // Resumo do mês
  const totalAfastamentos = Object.values(mapa).flat().filter(e => e.tipo === "afastamento" || e.tipo === "ferias").length;
  const totalTrocas = Object.values(mapa).flat().filter(e => e.tipo === "troca").length;
  const totalIncompletos = new Set(
    Object.entries(mapa).flatMap(([, evs]) =>
      evs.filter(e => e.tipo === "incompleto").map(e => e.employeeId)
    ).filter(Boolean)
  ).size;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h2 className="text-base font-bold text-foreground">Calendário de Ausências</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro por funcionário */}
          <select
            value={filtroEmp}
            onChange={e => setFiltroEmp(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Todos os funcionários</option>
            {employees.filter(e => e.active).map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Resumo rápido */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Afastamentos/Férias", valor: totalAfastamentos, cor: "#b45309", bg: "#fef3c7", emoji: "🏥" },
          { label: "Trocas de Plantão", valor: totalTrocas, cor: "#7c3aed", bg: "#ede9fe", emoji: "🔄" },
          { label: "Pontos Incompletos", valor: totalIncompletos, cor: "#dc2626", bg: "#fee2e2", emoji: "⚠️" },
        ].map(item => (
          <div key={item.label} className="rounded-xl p-3 border border-border"
            style={{ background: item.bg }}>
            <p className="text-lg font-black" style={{ color: item.cor }}>
              {item.emoji} {item.valor}
            </p>
            <p className="text-[10px] font-medium text-gray-500 mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Navegação de mês */}
      <div className="flex items-center justify-between bg-card rounded-xl border border-border p-3">
        <Button variant="ghost" size="sm" onClick={() => navMes(-1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="text-center">
          <p className="text-base font-bold text-foreground">
            {MESES[mes]} {ano}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navMes(1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Legenda filtrável */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(TIPO_CORES) as [DiaEvento["tipo"], typeof TIPO_CORES[keyof typeof TIPO_CORES]][]).map(([tipo, c]) => {
          const labels: Record<DiaEvento["tipo"], string> = {
            afastamento: "Afastamento", ferias: "Férias", troca: "Troca de Plantão",
            feriado: "Feriado", plantao: "Plantão Noturno", incompleto: "Ponto Incompleto",
          };
          const ativo = legendaVisiveis.has(tipo);
          return (
            <button
              key={tipo}
              onClick={() => toggleLegenda(tipo)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                ativo ? "border-transparent" : "border-border opacity-40"
              }`}
              style={ativo ? { background: c.bg, color: c.cor } : { background: "transparent", color: "#94a3b8" }}
            >
              <span>{c.emoji}</span>
              {labels[tipo]}
            </button>
          );
        })}
      </div>

      {/* Grade do calendário */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {/* Cabeçalho dos dias da semana */}
        <div className="grid grid-cols-7 border-b border-border">
          {DIAS_SEMANA.map(d => (
            <div key={d} className="p-2 text-center text-[11px] font-bold text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Células */}
        <div className="grid grid-cols-7">
          {diasGrid.map((dia, idx) => {
            if (!dia) return (
              <div key={`empty-${idx}`}
                className="min-h-[72px] border-r border-b border-border/40 bg-muted/10" />
            );

            const dStr = diaStr(dia);
            const eventos = eventosVisiveis(dStr);
            const eHoje = isHoje(dia);
            const eSelecionado = diaSelecionado === dStr;
            const dow = new Date(ano, mes, dia).getDay();
            const eFimDeSemana = dow === 0 || dow === 6;
            const eFeriado = !!FERIADOS[dStr];

            return (
              <div
                key={dStr}
                onClick={() => setDiaSelecionado(eSelecionado ? null : dStr)}
                className={`min-h-[72px] border-r border-b border-border/40 p-1 cursor-pointer transition-colors relative
                  ${eSelecionado ? "ring-2 ring-inset ring-primary" : ""}
                  ${eFimDeSemana && !eFeriado ? "bg-muted/20" : ""}
                  ${eFeriado ? "bg-emerald-50 dark:bg-emerald-950/20" : ""}
                  hover:bg-muted/40
                `}
              >
                {/* Número do dia */}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${
                  eHoje
                    ? "bg-primary text-primary-foreground"
                    : eFimDeSemana
                    ? "text-muted-foreground"
                    : "text-foreground"
                }`}>
                  {dia}
                </div>

                {/* Eventos (máx 2 + contador) */}
                <div className="space-y-0.5">
                  {eventos.slice(0, 2).map((ev, i) => (
                    <div key={i}
                      className="truncate text-[9px] font-semibold px-1 py-0.5 rounded"
                      style={{ background: ev.bg, color: ev.cor }}
                      title={ev.label}
                    >
                      {TIPO_CORES[ev.tipo].emoji} {ev.label.split(" — ")[1] || ev.label}
                    </div>
                  ))}
                  {eventos.length > 2 && (
                    <div className="text-[9px] font-bold text-muted-foreground px-1">
                      +{eventos.length - 2} mais
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Painel de detalhes do dia selecionado */}
      {diaSelecionado && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-foreground">
              {toLocalDate(diaSelecionado).toLocaleDateString("pt-BR", {
                weekday: "long", day: "2-digit", month: "long", year: "numeric"
              })}
            </p>
            <button onClick={() => setDiaSelecionado(null)}
              className="text-xs text-muted-foreground hover:text-foreground">
              fechar ✕
            </button>
          </div>

          {eventosSelecionados.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum evento neste dia.</p>
          ) : (
            <div className="space-y-2">
              {eventosSelecionados.map((ev, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg"
                  style={{ background: ev.bg }}>
                  <span className="text-base flex-shrink-0">
                    {TIPO_CORES[ev.tipo].emoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: ev.cor }}>
                      {ev.label}
                    </p>
                    <p className="text-[10px] text-gray-400 capitalize">
                      {{
                        afastamento: "Afastamento",
                        ferias: "Férias",
                        troca: "Troca de plantão",
                        feriado: "Feriado nacional",
                        plantao: "Plantão noturno",
                        incompleto: "Ponto incompleto",
                      }[ev.tipo]}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Visão por funcionário (lista compacta do mês) */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-3 border-b border-border bg-muted/30">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Resumo por funcionário — {MESES[mes]}
          </p>
        </div>
        <div className="divide-y divide-border/50">
          {employees.filter(e => e.active).map(emp => {
            const eventosDessaEmp = Object.entries(mapa).flatMap(([dia, evs]) =>
              evs
                .filter(ev => ev.employeeId === emp.id && legendaVisiveis.has(ev.tipo))
                .map(ev => ({ dia, ev }))
            ).sort((a, b) => a.dia.localeCompare(b.dia));

            const diasAfastado = new Set(
              eventosDessaEmp.filter(x => x.ev.tipo === "afastamento" || x.ev.tipo === "ferias").map(x => x.dia)
            ).size;
            const diasPlantao = new Set(
              eventosDessaEmp.filter(x => x.ev.tipo === "plantao").map(x => x.dia)
            ).size;
            const diasIncompleto = new Set(
              eventosDessaEmp.filter(x => x.ev.tipo === "incompleto").map(x => x.dia)
            ).size;

            return (
              <div key={emp.id} className="flex items-center gap-3 p-3 hover:bg-muted/20 transition-colors">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                  {emp.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{emp.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {(emp as any).shift === "noturno" ? "🌙 Noturno" : "☀️ Diurno"}
                    {((emp as any).escala || "").includes("12x36") ? " · 12×36" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {diasAfastado > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: "#fef3c7", color: "#b45309" }}>
                      🏥 {diasAfastado}d
                    </span>
                  )}
                  {diasPlantao > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: "#cffafe", color: "#0e7490" }}>
                      🌙 {diasPlantao}d
                    </span>
                  )}
                  {diasIncompleto > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: "#fee2e2", color: "#dc2626" }}>
                      ⚠️ {diasIncompleto}d
                    </span>
                  )}
                  {diasAfastado === 0 && diasPlantao === 0 && diasIncompleto === 0 && (
                    <span className="text-[10px] text-muted-foreground">sem eventos</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}