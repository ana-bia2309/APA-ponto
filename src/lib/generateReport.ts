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
    [10, 12], // Nossa Sra. Aparecida
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

  const isSimple = employee.punch_mode === "simple";
  const steps = isSimple ? ["entrada", "saida"] : ["entrada", "intervalo", "retorno", "saida"];
  const stepHeaders = isSimple ? ["Entrada", "Saída"] : ["Entrada", "Pausa", "Retorno", "Saída"];

  const escala = (employee as any).escala;
  const shift = (employee as any).shift;
  const escalaLabel = escala === "12x36" ? "12×36" : "Padrão";
  const shiftLabel = shift === "noturno" ? "Noturno" : "Diurno";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;

  // ─── Header band ───
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, pageWidth, 42, "F");

  // Company name
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.white);
  doc.text("APA Ponto", margin, 14);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Refrigeração e Climatização", margin, 20);

  // Month/Year right-aligned
  const monthLabel = `${MONTHS[month - 1]} ${year}`;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(monthLabel, pageWidth - margin, 14, { align: "right" });

  // Folha de Ponto subtitle
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Folha de Ponto Individual", pageWidth - margin, 20, { align: "right" });

  // Employee info row
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(employee.name.toUpperCase(), margin, 30);

  const infoItems: string[] = [];
  if ((employee as any).cpf) infoItems.push(`CPF: ${(employee as any).cpf}`);
  if ((employee as any).matricula) infoItems.push(`Mat: ${(employee as any).matricula}`);
  infoItems.push(`Turno: ${shiftLabel}`);
  infoItems.push(`Escala: ${escalaLabel}`);
  if ((employee as any).cargo) infoItems.push(`Cargo: ${(employee as any).cargo}`);
  if ((employee as any).departamento) infoItems.push(`Depto: ${(employee as any).departamento}`);
  if ((employee as any).data_admissao) {
    const admDate = new Date((employee as any).data_admissao + "T12:00:00");
    infoItems.push(`Admissão: ${admDate.toLocaleDateString("pt-BR")}`);
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(infoItems.join("  |  "), margin, 36);

  // ─── Table ───
  const tableHead = [["Dia", "Sem.", ...stepHeaders, "Horas", "Status"]];
  const tableBody: any[][] = [];

  // Track metadata per row for styling
  const rowMeta: { isWeekend: boolean; isHoliday: boolean; hasWork: boolean; holidayName?: string }[] = [];

  let totalWorkedMinutes = 0;
  let workedDays = 0;
  let folgaDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const date = new Date(year, month - 1, day);
    const weekday = WEEKDAYS_SHORT[date.getDay()];
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isHoliday = holidays.has(dateStr);

    const dayData = byDay[day];
    const cols = steps.map((s) => dayData?.times[s] || "-");
    const hasWork = cols.some((c) => c !== "-");

    // Calculate hours
    const worked = dayData ? calculateWorkedHours(dayData.timestamps, isSimple) : null;
    const hoursStr = formatHours(worked);

    if (worked) {
      totalWorkedMinutes += worked.totalMinutes;
      workedDays++;
    } else {
      folgaDays++;
    }

    let status = hasWork ? "Trab." : "Folga";
    if (isHoliday && !hasWork) status = "Feriado";

    rowMeta.push({ isWeekend, isHoliday, hasWork });
    tableBody.push([String(day).padStart(2, "0"), weekday, ...cols, hoursStr, status]);
  }

  // Summary row
  const totalHours = Math.floor(totalWorkedMinutes / 60);
  const totalMins = totalWorkedMinutes % 60;
  const summaryColSpan = isSimple ? 4 : 6;
  const summaryRow = new Array(summaryColSpan + 3).fill("");
  summaryRow[0] = "TOTAL";
  summaryRow[summaryColSpan + 1] = `${String(totalHours).padStart(2, "0")}:${String(totalMins).padStart(2, "0")}`;
  summaryRow[summaryColSpan + 2] = `${workedDays} dias`;
  tableBody.push(summaryRow);
  rowMeta.push({ isWeekend: false, isHoliday: false, hasWork: false });

  const startY = 46;

  autoTable(doc, {
    head: tableHead,
    body: tableBody,
    startY,
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 2,
      halign: "center",
      valign: "middle",
      lineColor: C.gridLine,
      lineWidth: 0.25,
      textColor: C.darkText,
    },
    headStyles: {
      fillColor: C.headerBg,
      textColor: C.white,
      fontStyle: "bold",
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 10, fontStyle: "bold" },  // Dia
      1: { cellWidth: 12 },                     // Sem.
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const rowIndex = data.row.index;
      const isSummary = rowIndex === tableBody.length - 1;
      const lastCol = isSimple ? 5 : 7;        // Status column
      const hoursCol = isSimple ? 4 : 6;        // Hours column

      if (isSummary) {
        data.cell.styles.fillColor = C.headerBg;
        data.cell.styles.textColor = C.white;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 9;
        return;
      }

      const meta = rowMeta[rowIndex];
      if (!meta) return;

      // Weekend background
      if (meta.isWeekend) {
        data.cell.styles.fillColor = C.weekendBg;
      }
      // Holiday background
      if (meta.isHoliday) {
        data.cell.styles.fillColor = C.holidayBg;
      }
      // Alternating rows (only if not weekend/holiday)
      if (!meta.isWeekend && !meta.isHoliday && rowIndex % 2 === 1) {
        data.cell.styles.fillColor = C.lightRow;
      }

      // Status column
      if (data.column.index === lastCol) {
        const val = data.cell.raw as string;
        if (val === "Trab.") {
          data.cell.styles.fillColor = C.workedBg;
          data.cell.styles.textColor = C.white;
          data.cell.styles.fontStyle = "bold";
        } else if (val === "Folga") {
          data.cell.styles.fillColor = C.folgaBg;
          data.cell.styles.textColor = C.white;
          data.cell.styles.fontStyle = "bold";
        } else if (val === "Feriado") {
          data.cell.styles.fillColor = C.holidayBg;
          data.cell.styles.textColor = C.holidayText;
          data.cell.styles.fontStyle = "bold";
        }
      }

      // Hours column - subtle accent
      if (data.column.index === hoursCol && data.cell.raw !== "-" && data.cell.raw !== "") {
        data.cell.styles.textColor = C.accentBlue;
        data.cell.styles.fontStyle = "bold";
      }

      // Weekday column (Sem.) - subtle
      if (data.column.index === 1) {
        data.cell.styles.textColor = meta.isWeekend ? C.folgaBg : C.subtleText;
        data.cell.styles.fontSize = 7;
      }
    },
  });

  // ─── Footer ───
  const finalY = (doc as any).lastAutoTable?.finalY || 280;
  const footerY = Math.min(finalY + 10, doc.internal.pageSize.getHeight() - 20);

  doc.setFontSize(7);
  doc.setTextColor(...C.subtleText);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Documento gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} — APA Ponto`,
    pageWidth / 2,
    footerY,
    { align: "center" }
  );

  // Legend
  doc.setFontSize(6.5);
  const legendY = footerY + 5;
  const legends = [
    { color: C.workedBg, label: "Trabalhado" },
    { color: C.folgaBg, label: "Folga" },
    { color: C.holidayBg, label: "Feriado" },
    { color: C.weekendBg, label: "Fim de semana" },
  ];
  let legendX = margin;
  for (const leg of legends) {
    doc.setFillColor(...leg.color);
    doc.rect(legendX, legendY - 2.5, 4, 3, "F");
    doc.setTextColor(...C.subtleText);
    doc.text(leg.label, legendX + 5.5, legendY);
    legendX += doc.getTextWidth(leg.label) + 10;
  }

  // Signature line
  const sigY = doc.internal.pageSize.getHeight() - 12;
  doc.setDrawColor(...C.gridLine);
  doc.line(margin + 20, sigY, pageWidth / 2 - 5, sigY);
  doc.line(pageWidth / 2 + 5, sigY, pageWidth - margin - 20, sigY);
  doc.setFontSize(7);
  doc.setTextColor(...C.subtleText);
  doc.text("Assinatura do Colaborador", (margin + 20 + pageWidth / 2 - 5) / 2, sigY + 4, { align: "center" });
  doc.text("Assinatura do Responsável", (pageWidth / 2 + 5 + pageWidth - margin - 20) / 2, sigY + 4, { align: "center" });

  doc.save(`ponto_${employee.name.replace(/\s+/g, "_")}_${MONTHS[month - 1]}_${year}.pdf`);
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
