import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { TimeRecordRow } from "@/lib/time-records";
import { groupRecordsIntoJourneys } from "@/lib/group-journeys";

type Employee = Tables<"employees">;

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Brazilian national holidays (fixed dates)
function getBrazilianHolidays(year: number): Set<string> {
  const holidays = new Set<string>();
  const fixed = [
    [1, 1],   // Confraternização Universal
    [4, 21],  // Tiradentes
    [5, 1],   // Dia do Trabalho
    [9, 7],   // Independência
    [10, 12], // Nossa Sra. AMRrecida
    [11, 2],  // Finados
    [11, 15], // Proclamação da República
    [12, 25], // Natal
  ];
  for (const [m, d] of fixed) {
    holidays.add(`${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }

  // Easter-based movable holidays
  const easter = getEasterDate(year);
  const addDays = (date: Date, days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  };
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  holidays.add(fmt(addDays(easter, -47))); // Carnaval (terça)
  holidays.add(fmt(addDays(easter, -48))); // Carnaval (segunda)
  holidays.add(fmt(addDays(easter, -2)));  // Sexta-feira Santa
  holidays.add(fmt(easter));               // Páscoa
  holidays.add(fmt(addDays(easter, 60)));  // Corpus Christi

  return holidays;
}

function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

interface DayData {
  times: Record<string, string>;       // step → formatted time
  timestamps: Record<string, string>;  // step → ISO string
}

/**
 * Fetch records and group by journey for overnight employees.
 * Returns both formatted times and raw timestamps for hours calculation.
 */
async function fetchAndGroupRecords(
  employee: Employee,
  year: number,
  month: number
): Promise<Record<number, DayData>> {
  const daysInMonth = getDaysInMonth(year, month);
  const isOvernight = (employee as any).shift === "noturno" || (employee as any).escala === "12x36";

  const startDate = `${year}-${String(month).padStart(2, "0")}-01T00:00:00`;

  // Lookback for overnight
  const lookbackDate = new Date(year, month - 1, 0);
  const fetchStart = isOvernight
    ? `${lookbackDate.getFullYear()}-${String(lookbackDate.getMonth() + 1).padStart(2, "0")}-${String(lookbackDate.getDate()).padStart(2, "0")}T00:00:00`
    : startDate;

  const nextDay = new Date(year, month, 1);
  const fetchEnd = isOvernight
    ? `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, "0")}-${String(nextDay.getDate()).padStart(2, "0")}T23:59:59`
    : `${year}-${String(month).padStart(2, "0")}-${daysInMonth}T23:59:59`;

  const { data: records } = await (supabase as any)
    .from("time_records")
    .select("*")
    .eq("employee_id", employee.id)
    .gte("recorded_at", fetchStart)
    .lte("recorded_at", fetchEnd)
    .order("recorded_at");

  const recs = (records as TimeRecordRow[]) || [];

  if (!isOvernight) {
    const byDay: Record<number, DayData> = {};
    for (const rec of recs) {
      const d = new Date(rec.recorded_at);
      const day = d.getDate();
      const recMonth = d.getMonth() + 1;
      if (recMonth !== month) continue;
      if (!byDay[day]) byDay[day] = { times: {}, timestamps: {} };
      byDay[day].times[rec.record_type] = formatTime(rec.recorded_at);
      byDay[day].timestamps[rec.record_type] = rec.recorded_at;
    }
    return byDay;
  }

  // Journey-based grouping
  const journeyRecords = recs.map((r) => ({
    id: r.id,
    employee_id: r.employee_id,
    step: r.record_type,
    punched_at: r.recorded_at,
  }));

  const journeys = groupRecordsIntoJourneys(journeyRecords);
  const byDay: Record<number, DayData> = {};

  for (const journey of journeys) {
    const entradaRec = journey.records.find((r) => r.step === "entrada");
    const journeyDate = entradaRec
      ? new Date(entradaRec.punched_at)
      : new Date(journey.records[0].punched_at);

    const journeyMonth = journeyDate.getMonth() + 1;
    const journeyDay = journeyDate.getDate();

    if (journeyMonth !== month) continue;

    if (!byDay[journeyDay]) byDay[journeyDay] = { times: {}, timestamps: {} };
    for (const rec of journey.records) {
      byDay[journeyDay].times[rec.step] = formatTime(rec.punched_at);
      byDay[journeyDay].timestamps[rec.step] = rec.punched_at;
    }
  }

  return byDay;
}

/**
 * Calculate worked hours from timestamps.
 * For full mode: (intervalo - entrada) + (saida - retorno)
 * For simple mode: (saida - entrada)
 */
function calculateWorkedHours(
  timestamps: Record<string, string>,
  isSimple: boolean
): { hours: number; minutes: number; totalMinutes: number } | null {
  if (isSimple) {
    if (!timestamps.entrada || !timestamps.saida) return null;
    const diff = new Date(timestamps.saida).getTime() - new Date(timestamps.entrada).getTime();
    const totalMinutes = Math.round(diff / 60000);
    return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60, totalMinutes };
  }

  // Full mode
  const e = timestamps.entrada ? new Date(timestamps.entrada).getTime() : null;
  const i = timestamps.intervalo ? new Date(timestamps.intervalo).getTime() : null;
  const r = timestamps.retorno ? new Date(timestamps.retorno).getTime() : null;
  const s = timestamps.saida ? new Date(timestamps.saida).getTime() : null;

  let totalMs = 0;
  if (e && i) totalMs += i - e;
  if (r && s) totalMs += s - r;
  // If only entrada and saida (no break)
  if (e && s && !i && !r) totalMs = s - e;
  // Partial: entrada without saida yet
  if (totalMs <= 0 && e && s) totalMs = s - e;

  if (totalMs <= 0) return null;

  const totalMinutes = Math.round(totalMs / 60000);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60, totalMinutes };
}

function formatHours(h: { hours: number; minutes: number } | null): string {
  if (!h) return "-";
  return `${String(h.hours).padStart(2, "0")}:${String(h.minutes).padStart(2, "0")}`;
}

// ─── Colors ───
const C = {
  headerBg: [15, 32, 55] as [number, number, number],          // dark navy
  headerText: [255, 255, 255] as [number, number, number],
  weekendBg: [235, 238, 245] as [number, number, number],      // light blue-gray
  holidayBg: [255, 243, 224] as [number, number, number],      // warm cream
  workedBg: [39, 174, 96] as [number, number, number],         // green
  folgaBg: [231, 76, 60] as [number, number, number],          // red
  holidayText: [180, 120, 40] as [number, number, number],     // warm brown
  white: [255, 255, 255] as [number, number, number],
  lightRow: [250, 251, 253] as [number, number, number],
  gridLine: [210, 215, 220] as [number, number, number],
  subtleText: [120, 130, 140] as [number, number, number],
  darkText: [30, 30, 30] as [number, number, number],
  accentBlue: [41, 98, 170] as [number, number, number],
};

export async function generateMonthlyReport(
  employee: Employee,
  year: number,
  month: number
) {
  const daysInMonth = getDaysInMonth(year, month);
  const byDay = await fetchAndGroupRecords(employee, year, month);
  const holidays = getBrazilianHolidays(year);

  // Buscar afastamentos do período
  const primeiroDia = `${year}-${String(month).padStart(2, "0")}-01`;
  const ultimoDia = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const { data: afasts } = await (supabase as any)
    .from("afastamentos")
    .select("tipo, data_inicio, data_fim")
    .eq("employee_id", employee.id)
    .lte("data_inicio", ultimoDia)
    .gte("data_fim", primeiroDia);

  const tipoLabels: Record<string, string> = {
    licenca_medica: "Lic. Médica", licenca_maternidade: "Maternidade",
    licenca_paternidade: "Paternidade", ferias: "Férias",
    acidente_trabalho: "Acidente", suspensao: "Suspenso", outro: "Afastado",
  };
  const diasAfastados: Record<string, string> = {};
  (afasts || []).forEach((a: any) => {
    let d = a.data_inicio < primeiroDia ? primeiroDia : a.data_inicio;
    const fim = a.data_fim > ultimoDia ? ultimoDia : a.data_fim;
    while (d <= fim) {
      diasAfastados[d] = tipoLabels[a.tipo] || "Afastado";
      const dt = new Date(d + "T12:00:00");
      dt.setDate(dt.getDate() + 1);
      d = dt.toISOString().slice(0, 10);
    }
  });

  const isSimple = employee.punch_mode === "simple";
  const steps = isSimple ? ["entrada", "saida"] : ["entrada", "intervalo", "retorno", "saida"];
  const stepHeaders = isSimple ? ["Entrada", "Saída"] : ["Entrada", "Pausa", "Retorno", "Saída"];

  const escala = (employee as any).escala;
  const shift = (employee as any).shift;
  const escalaLabel = escala === "12x36" ? "12×36" : "Padrão";
  const shiftLabel = shift === "noturno" ? "Noturno" : "Diurno";

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;

  // Cores premium
  const navy = [15, 32, 55] as [number, number, number];
  const blue = [30, 64, 175] as [number, number, number];
  const lightBlue = [239, 246, 255] as [number, number, number];
  const green = [21, 128, 61] as [number, number, number];
  const lightGreen = [240, 253, 244] as [number, number, number];
  const red = [220, 38, 38] as [number, number, number];
  const lightRed = [255, 241, 242] as [number, number, number];
  const amber = [180, 83, 9] as [number, number, number];
  const lightAmber = [255, 251, 235] as [number, number, number];
  const gray = [100, 116, 139] as [number, number, number];
  const lightGray = [248, 250, 252] as [number, number, number];
  const white = [255, 255, 255] as [number, number, number];
  const dark = [15, 23, 42] as [number, number, number];

  // ── CABEÇALHO EXECUTIVO ──
  doc.setFillColor(...navy);
  doc.rect(0, 0, W, 38, "F");

  // Faixa azul lateral esquerda
  doc.setFillColor(...blue);
  doc.rect(0, 0, 3, 38, "F");

  const docCode = `DOC-${year}${String(month).padStart(2,"0")}-${employee.id.slice(0,6).toUpperCase()}`;
  const colLeft = M + 2;
  const colCenter = W / 2;
  const colRight = W - M;

  // Coluna esquerda — empresa
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...white);
  doc.text("APA Refrigeração e Climatização", colLeft, 12);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 200, 230);
  doc.text("Sistema de Registro de Ponto", colLeft, 20);

  // Coluna centro — título
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...white);
  doc.text("RELATÓRIO DE REGISTRO DE PONTO", colCenter, 10, { align: "center" });

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.3);
  doc.line(colCenter - 45, 12, colCenter + 45, 12);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 200, 230);
  doc.text(`Competência: ${MONTHS[month - 1].toUpperCase()} / ${year}`, colCenter, 17, { align: "center" });

  doc.setFontSize(7);
  doc.text(`Nº ${docCode}`, colCenter, 22, { align: "center" });

  // Coluna direita — emissão
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 200, 230);
  doc.text(`Emitido em:`, colRight, 10, { align: "right" });
  doc.text(`${new Date().toLocaleString("pt-BR")}`, colRight, 15, { align: "right" });
  doc.text(`Página 1 de 1  |  v2.0`, colRight, 20, { align: "right" });
  doc.text(`Sistema APA Ponto`, colRight, 25, { align: "right" });

  // ── CARD COLABORADOR ──
  let y = 42;
  doc.setFillColor(...lightBlue);
  doc.roundedRect(M, y, W - M * 2, 30, 2, 2, "F");
  doc.setDrawColor(...blue);
  doc.setLineWidth(0.5);
  doc.roundedRect(M, y, W - M * 2, 30, 2, 2, "S");

  // Faixa azul topo do card
  doc.setFillColor(...blue);
  doc.roundedRect(M, y, W - M * 2, 7, 2, 2, "F");
  doc.rect(M, y + 3, W - M * 2, 4, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...white);
  doc.text("IDENTIFICAÇÃO DO COLABORADOR", M + 4, y + 5);

  y += 10;
  // Coluna 1
  const col1 = M + 4;
  const col2 = M + (W - M * 2) / 2 + 4;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...dark);
  doc.text(employee.name.toUpperCase(), col1, y);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...gray);

  const infoCol1 = [
    `Matrícula: ${(employee as any).matricula || "—"}`,
    `CPF: ${(employee as any).cpf || "—"}`,
    `Cargo: ${(employee as any).cargo || "—"}`,
    `Departamento: ${(employee as any).departamento || "—"}`,
  ];
  const infoCol2 = [
    `Admissão: ${(employee as any).data_admissao ? new Date((employee as any).data_admissao + "T12:00:00").toLocaleDateString("pt-BR") : "—"}`,
    `Escala: ${escalaLabel}  |  Turno: ${shiftLabel}`,
    `Jornada: ${isSimple ? "2 batidas" : "4 batidas"}`,
    `Status: Ativo`,
  ];

  infoCol1.forEach((txt, i) => { doc.text(txt, col1, y + 5 + i * 5); });
  infoCol2.forEach((txt, i) => { doc.text(txt, col2, y + 5 + i * 5); });

  y += 34;

  // ── PAINEL RESUMO MENSAL ──
  let totalWorkedMinutes = 0;
  let workedDays = 0;
  let folgaDays = 0;
  let atrasoDays = 0;
  let faltaDays = 0;
  let feriadoDays = 0;
  let extraMinutes = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const date = new Date(year, month - 1, day);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isHoliday = holidays.has(dateStr);
    const dayData = byDay[day];
    const worked = dayData ? calculateWorkedHours(dayData.timestamps, isSimple) : null;

    if (worked) {
      totalWorkedMinutes += worked.totalMinutes;
      workedDays++;
      if (worked.totalMinutes > 480) extraMinutes += worked.totalMinutes - 480;
      // Verifica atraso (entrada após 08:15)
      if (dayData?.timestamps?.entrada) {
        const h = new Date(dayData.timestamps.entrada).getHours();
        const m = new Date(dayData.timestamps.entrada).getMinutes();
        if (h > 8 || (h === 8 && m > 15)) atrasoDays++;
      }
    } else if (isHoliday) {
      feriadoDays++;
    } else if (!isWeekend) {
      faltaDays++;
    } else {
      folgaDays++;
    }
  }

  const totalH = Math.floor(totalWorkedMinutes / 60);
  const totalMin = totalWorkedMinutes % 60;
  const extraH = Math.floor(extraMinutes / 60);
  const extraMin = extraMinutes % 60;
  const bancoH = extraH;
  const bancoMin = extraMin;

  const kpis = [
    { label: "Horas Trabalhadas", value: `${String(totalH).padStart(2,"0")}:${String(totalMin).padStart(2,"0")}`, icon: "⏱", bg: lightGreen, text: green },
    { label: "Horas Extras", value: `${String(extraH).padStart(2,"0")}:${String(extraMin).padStart(2,"0")}`, icon: "🔥", bg: lightAmber, text: amber },
    { label: "Banco de Horas", value: `+${bancoH}h${String(bancoMin).padStart(2,"0")}`, icon: "🏦", bg: lightBlue, text: blue },
    { label: "Dias Trabalhados", value: String(workedDays), icon: "📅", bg: lightGreen, text: green },
    { label: "Atrasos", value: String(atrasoDays), icon: "⚠️", bg: lightAmber, text: amber },
    { label: "Faltas", value: String(faltaDays), icon: "❌", bg: lightRed, text: red },
    { label: "Folgas", value: String(folgaDays), icon: "🌙", bg: lightGray, text: gray },
    { label: "Feriados", value: String(feriadoDays), icon: "🎉", bg: lightAmber, text: amber },
  ];

  const kpiW = (W - M * 2) / kpis.length;
  kpis.forEach((k, i) => {
    const kx = M + i * kpiW;
    doc.setFillColor(...k.bg);
    doc.roundedRect(kx, y, kpiW - 1, 16, 1, 1, "F");
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...k.text);
    doc.text(k.value, kx + kpiW / 2 - 0.5, y + 7, { align: "center" });
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...gray);
    doc.text(k.label, kx + kpiW / 2 - 0.5, y + 12, { align: "center" });
  });

  y += 19;

  // ── TABELA DE REGISTROS ──
  const tableHead = [["Dia", "Sem.", "Data", ...stepHeaders, "H. Prev.", "H. Real.", "Diferença", "Status", "Obs."]];
  const tableBody: any[][] = [];
  const rowMeta2: any[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const date = new Date(year, month - 1, day);
    const weekday = WEEKDAYS_SHORT[date.getDay()];
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isHoliday = holidays.has(dateStr);
    const dayData = byDay[day];
    const cols = steps.map((s) => dayData?.times[s] || "—");
    const hasWork = cols.some((c) => c !== "—");
    const worked = dayData ? calculateWorkedHours(dayData.timestamps, isSimple) : null;
    const hoursReal = formatHours(worked);
    const hoursPrev = isWeekend || isHoliday ? "—" : isSimple ? "08:00" : "08:48";
    let diff = "—";
    let obs = "";

    if (worked && !isWeekend && !isHoliday) {
      const prevMin = isSimple ? 480 : 528;
      const diffMin = worked.totalMinutes - prevMin;
      diff = `${diffMin >= 0 ? "+" : ""}${Math.floor(Math.abs(diffMin)/60)}:${String(Math.abs(diffMin)%60).padStart(2,"0")}`;
      if (diffMin < -10) obs = "Atraso";
      if (diffMin > 60) obs = "HE";
    }

    const dateStr2 = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const labelAfast = diasAfastados[dateStr2];
    let status = hasWork ? "Trabalhado" : labelAfast ? labelAfast : isHoliday ? "Feriado" : isWeekend ? "Folga" : "Falta";

    rowMeta2.push({ isWeekend, isHoliday, hasWork, status, isAfastado: !!labelAfast });
    tableBody.push([
      String(day).padStart(2, "0"),
      weekday,
      `${String(day).padStart(2,"0")}/${String(month).padStart(2,"0")}`,
      ...cols,
      hoursPrev,
      hoursReal,
      diff,
      status,
      obs,
    ]);
  }

  // Linha totais
  tableBody.push([
    "TOT", "", "",
    ...steps.map(() => ""),
    `${String(Math.floor(workedDays * (isSimple ? 480 : 528) / 60)).padStart(2,"0")}:00`,
    `${String(totalH).padStart(2,"0")}:${String(totalMin).padStart(2,"0")}`,
    `${extraH > 0 ? "+" : ""}${String(extraH).padStart(2,"0")}:${String(extraMin).padStart(2,"0")}`,
    `${workedDays} dias`, "",
  ]);
  rowMeta2.push({ isWeekend: false, isHoliday: false, hasWork: false, status: "total" });

  autoTable(doc, {
    head: tableHead,
    body: tableBody,
    startY: y,
    theme: "grid",
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      halign: "center",
      valign: "middle",
      lineColor: [220, 225, 235],
      lineWidth: 0.2,
      textColor: dark,
    },
    headStyles: {
      fillColor: navy,
      textColor: white,
      fontStyle: "bold",
      fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 8, fontStyle: "bold" },
      1: { cellWidth: 10 },
      2: { cellWidth: 16 },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const ri = data.row.index;
      const meta = rowMeta2[ri];
      if (!meta) return;

      if (meta.status === "total") {
        data.cell.styles.fillColor = navy;
        data.cell.styles.textColor = white;
        data.cell.styles.fontStyle = "bold";
        return;
      }
      if (meta.isWeekend) data.cell.styles.fillColor = [235, 238, 245];
      if (meta.isHoliday) data.cell.styles.fillColor = [255, 243, 224];
      if (!meta.isWeekend && !meta.isHoliday && ri % 2 === 1) data.cell.styles.fillColor = lightGray;

      // Status col
      const statusColIdx = isSimple ? 7 : 9;
      const diffColIdx = isSimple ? 6 : 8;

      if (data.column.index === statusColIdx) {
        const v = data.cell.raw as string;
        if (v === "Trabalhado") { data.cell.styles.fillColor = lightGreen; data.cell.styles.textColor = green; data.cell.styles.fontStyle = "bold"; }
        if (v === "Falta") { data.cell.styles.fillColor = lightRed; data.cell.styles.textColor = red; data.cell.styles.fontStyle = "bold"; }
        if (v === "Feriado") { data.cell.styles.fillColor = lightAmber; data.cell.styles.textColor = amber; data.cell.styles.fontStyle = "bold"; }
        if (v === "Folga") { data.cell.styles.fillColor = lightGray; data.cell.styles.textColor = gray; data.cell.styles.fontStyle = "bold"; }
        // Afastamentos — laranja
        const afastLabels = ["Lic. Médica","Maternidade","Paternidade","Férias","Acidente","Suspenso","Afastado"];
        if (afastLabels.includes(v)) {
          data.cell.styles.fillColor = [255, 237, 213];
          data.cell.styles.textColor = [194, 65, 12];
          data.cell.styles.fontStyle = "bold";
        }
      }
      if (data.column.index === diffColIdx) {
        const v = data.cell.raw as string;
        if (v.startsWith("+")) { data.cell.styles.textColor = green; data.cell.styles.fontStyle = "bold"; }
        if (v.startsWith("-")) { data.cell.styles.textColor = red; data.cell.styles.fontStyle = "bold"; }
      }
    },
  });

  // ── ASSINATURAS ──
  const finalY2 = (doc as any).lastAutoTable?.finalY || H - 40;
  let sigY = finalY2 + 6;

  if (sigY > H - 30) { doc.addPage(); sigY = 15; }

  const sigW = (W - M * 2) / 3 - 4;
  const sigs = [
    { label: "Assinatura do Colaborador", nome: employee.name, cargo: (employee as any).cargo || "Colaborador" },
    { label: "Assinatura do Gestor", nome: "________________________________", cargo: "Gestor Responsável" },
    { label: "Assinatura do RH", nome: "________________________________", cargo: "Recursos Humanos" },
  ];

  sigs.forEach((sig, i) => {
    const sx = M + i * (sigW + 4);
    doc.setFillColor(...lightGray);
    doc.roundedRect(sx, sigY, sigW, 20, 1, 1, "F");
    doc.setDrawColor(...gray);
    doc.setLineWidth(0.3);
    doc.line(sx + 4, sigY + 13, sx + sigW - 4, sigY + 13);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...dark);
    doc.text(sig.label, sx + sigW / 2, sigY + 4, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...gray);
    doc.text(sig.nome, sx + sigW / 2, sigY + 16, { align: "center" });
    doc.text(sig.cargo, sx + sigW / 2, sigY + 19, { align: "center" });
  });

  // ── RODAPÉ ──
  const footY = H - 8;
  doc.setFillColor(...navy);
  doc.rect(0, footY - 4, W, 12, "F");
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 200, 230);
  doc.text(`APA Ponto v2.0  |  Documento: ${docCode}  |  Emitido em: ${new Date().toLocaleString("pt-BR")}  |  Este documento é válido apenas com assinatura.`, W / 2, footY, { align: "center" });

  doc.save(`Ponto_${employee.name.replace(/\s+/g, "_")}_${MONTHS[month - 1]}_${year}.pdf`);
}

export async function generateMonthlyExcel(
  employee: Employee,
  year: number,
  month: number
) {
  const daysInMonth = getDaysInMonth(year, month);
  const byDay = await fetchAndGroupRecords(employee, year, month);
  const holidays = getBrazilianHolidays(year);

  const isSimple = employee.punch_mode === "simple";
  const steps = isSimple ? ["entrada", "saida"] : ["entrada", "intervalo", "retorno", "saida"];
  const stepHeaders = isSimple ? ["Entrada", "Saída"] : ["Entrada", "Pausa", "Retorno", "Saída"];

  const escala = (employee as any).escala;
  const shift = (employee as any).shift;
  const escalaLabel = escala === "12x36" ? "12×36" : "Padrão";
  const shiftLabel = shift === "noturno" ? "Noturno" : "Diurno";

  const monthLabel = `${MONTHS[month - 1]} ${year}`;
  const rows: string[][] = [];
  rows.push(["APA Ponto - Folha de Ponto"]);
  rows.push([`Colaborador: ${employee.name}`]);
  rows.push([`Período: ${monthLabel}`]);
  rows.push([`Turno: ${shiftLabel} | Escala: ${escalaLabel}`]);
  rows.push([]);
  rows.push(["Dia", "Sem.", ...stepHeaders, "Horas", "Status"]);

  let totalMinutes = 0;
  let workedDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const date = new Date(year, month - 1, day);
    const weekday = WEEKDAYS_SHORT[date.getDay()];
    const isHoliday = holidays.has(dateStr);

    const dayData = byDay[day];
    const cols = steps.map((s) => dayData?.times[s] || "-");
    const hasWork = cols.some((c) => c !== "-");

    const worked = dayData ? calculateWorkedHours(dayData.timestamps, isSimple) : null;
    const hoursStr = formatHours(worked);

    if (worked) {
      totalMinutes += worked.totalMinutes;
      workedDays++;
    }

    let status = hasWork ? "Trabalhado" : "Folga";
    if (isHoliday && !hasWork) status = "Feriado";

    rows.push([String(day).padStart(2, "0"), weekday, ...cols, hoursStr, status]);
  }

  const totalH = Math.floor(totalMinutes / 60);
  const totalM = totalMinutes % 60;
  rows.push([]);
  rows.push(["TOTAL", "", ...steps.map(() => ""), `${String(totalH).padStart(2, "0")}:${String(totalM).padStart(2, "0")}`, `${workedDays} dias`]);

  const csvContent = rows.map((row) => row.map((cell) => `"${cell}"`).join(";")).join("\n");
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ponto_${employee.name.replace(/\s+/g, "_")}_${MONTHS[month - 1]}_${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
export async function generatePayrollReport(
  year: number,
  month: number,
): Promise<void> {
  const { data: period } = await supabase
    .from("payroll_periods" as any)
    .select("id, status")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (!period) {
    throw new Error("Nenhuma folha calculada para este período.");
  }

  const { data: payslips } = await supabase
    .from("payslips" as any)
    .select("*, employees(name, cargo, departamento)")
    .eq("period_id", (period as any).id)
    .order("employees(name)");

  const ps = (payslips as any[]) || [];
  if (ps.length === 0) throw new Error("Nenhum holerite encontrado.");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const mesNome = MONTHS[month - 1];

  // Cabeçalho
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("AMR Refrigeração e Climatização", 14, 15);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Folha de Pagamento — ${mesNome}/${year}`, 14, 22);
  doc.text(`Status: ${(period as any).status?.toUpperCase() ?? "ABERTO"}`, 14, 28);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 34);

  // Tabela principal
  const rows = ps.map((p: any) => {
    const emp = Array.isArray(p.employees) ? p.employees[0] : p.employees;
    return [
      emp?.name ?? "—",
      emp?.cargo ?? "—",
      emp?.departamento ?? "—",
      `${Number(p.horas_trabalhadas || 0).toFixed(1)}h`,
      `${Number(p.horas_extras_50 || 0).toFixed(1)}h`,
      `${Number(p.faltas_dias || 0)} dia(s)`,
      `R$ ${Number(p.total_proventos || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      `R$ ${Number(p.total_descontos || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      `R$ ${Number(p.liquido || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      `R$ ${Number(p.fgts_mes || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    ];
  });

  // Totais
  const totais = ps.reduce((acc: any, p: any) => ({
    proventos: acc.proventos + Number(p.total_proventos || 0),
    descontos: acc.descontos + Number(p.total_descontos || 0),
    liquido: acc.liquido + Number(p.liquido || 0),
    fgts: acc.fgts + Number(p.fgts_mes || 0),
  }), { proventos: 0, descontos: 0, liquido: 0, fgts: 0 });

  rows.push([
    "TOTAL", "", "", "", "", "",
    `R$ ${totais.proventos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    `R$ ${totais.descontos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    `R$ ${totais.liquido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    `R$ ${totais.fgts.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
  ]);

  autoTable(doc, {
    startY: 40,
    head: [["Funcionário", "Cargo", "Depto", "H. Trab.", "H. Extra", "Faltas", "Proventos", "Descontos", "Líquido", "FGTS"]],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [240, 240, 240], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    didParseCell: (data) => {
      if (data.row.index === rows.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [220, 220, 220];
      }
    },
  });

  doc.save(`folha_pagamento_${mesNome}_${year}.pdf`);
}
