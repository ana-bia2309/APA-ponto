import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { TimeRecordRow } from "@/lib/time-records";
import { groupRecordsIntoJourneys } from "@/lib/group-journeys";

type Employee = Tables<"employees">;

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

/**
 * For overnight/12x36 employees, we fetch records with a lookback buffer
 * and group them into journeys so that a shift starting on day X and ending
 * on day X+1 appears entirely under day X.
 */
async function fetchAndGroupRecords(
  employee: Employee,
  year: number,
  month: number
): Promise<Record<number, Record<string, string>>> {
  const daysInMonth = getDaysInMonth(year, month);
  const isOvernight = (employee as any).shift === "noturno" || (employee as any).escala === "12x36";

  // For overnight workers, fetch from previous day to capture journeys starting before midnight
  const startDate = isOvernight
    ? `${year}-${String(month).padStart(2, "0")}-01T00:00:00`
    : `${year}-${String(month).padStart(2, "0")}-01T00:00:00`;
  
  // Fetch extra day before month start for overnight lookback
  const lookbackDate = new Date(year, month - 1, 0); // last day of previous month
  const fetchStart = isOvernight
    ? `${lookbackDate.getFullYear()}-${String(lookbackDate.getMonth() + 1).padStart(2, "0")}-${String(lookbackDate.getDate()).padStart(2, "0")}T00:00:00`
    : startDate;
  
  // Fetch extra day after month end for overnight shifts that end next day
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
    // Simple day-based grouping for daytime employees
    const byDay: Record<number, Record<string, string>> = {};
    for (const rec of recs) {
      const day = new Date(rec.recorded_at).getDate();
      const recMonth = new Date(rec.recorded_at).getMonth() + 1;
      if (recMonth !== month) continue;
      if (!byDay[day]) byDay[day] = {};
      byDay[day][rec.record_type] = formatTime(rec.recorded_at);
    }
    return byDay;
  }

  // Journey-based grouping for overnight/12x36
  const journeyRecords = recs.map((r) => ({
    id: r.id,
    employee_id: r.employee_id,
    step: r.record_type,
    punched_at: r.recorded_at,
  }));

  const journeys = groupRecordsIntoJourneys(journeyRecords);

  const byDay: Record<number, Record<string, string>> = {};
  for (const journey of journeys) {
    // Use the entrada record's date as the journey day
    const entradaRec = journey.records.find((r) => r.step === "entrada");
    const journeyDate = entradaRec
      ? new Date(entradaRec.punched_at)
      : new Date(journey.records[0].punched_at);

    const journeyMonth = journeyDate.getMonth() + 1;
    const journeyDay = journeyDate.getDate();

    // Only include journeys that belong to this month
    if (journeyMonth !== month) continue;

    if (!byDay[journeyDay]) byDay[journeyDay] = {};
    for (const rec of journey.records) {
      byDay[journeyDay][rec.step] = formatTime(rec.punched_at);
    }
  }

  return byDay;
}

export async function generateMonthlyReport(
  employee: Employee,
  year: number,
  month: number
) {
  const daysInMonth = getDaysInMonth(year, month);
  const byDay = await fetchAndGroupRecords(employee, year, month);

  const isSimple = employee.punch_mode === "simple";
  const steps = isSimple ? ["entrada", "saida"] : ["entrada", "intervalo", "retorno", "saida"];
  const stepHeaders = isSimple ? ["entrada", "saída"] : ["entrada", "pausa", "retorno", "saída"];

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("APA Ponto - Refrigeração e Climatização", pageWidth / 2, 15, { align: "center" });

  const monthLabel = `${MONTHS[month - 1]} ${year}`;
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(monthLabel, pageWidth / 2, 22, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(employee.name.toUpperCase(), pageWidth / 2, 32, { align: "center" });

  let infoY = 32;
  if ((employee as any).cpf) {
    infoY += 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`CPF: ${(employee as any).cpf}`, pageWidth / 2, infoY, { align: "center" });
  }

  // Show escala info
  const escala = (employee as any).escala;
  const shift = (employee as any).shift;
  const escalaLabel = escala === "12x36" ? "12×36" : "Padrão";
  const shiftLabel = shift === "noturno" ? "Noturno" : "Diurno";
  infoY += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Turno: ${shiftLabel} | Escala: ${escalaLabel}`, pageWidth / 2, infoY, { align: "center" });

  // Build table data
  const tableHead = [["dia", ...stepHeaders, "jornada"]];
  const tableBody: any[][] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayData = byDay[day];
    const cols = steps.map((s) => dayData?.[s] || "-");
    const hasAny = cols.some((c) => c !== "-");
    const jornada = hasAny ? "trab." : "folga";
    tableBody.push([String(day).padStart(2, "0"), ...cols, jornada]);
  }

  const startY = infoY + 6;

  autoTable(doc, {
    head: tableHead,
    body: tableBody,
    startY,
    theme: "grid",
    styles: {
      fontSize: 9,
      cellPadding: 2.5,
      halign: "center",
      valign: "middle",
      lineColor: [200, 200, 200],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: [30, 58, 95],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 14 },
    },
    didParseCell: (data) => {
      if (data.section === "body") {
        const lastColIndex = isSimple ? 3 : 5;
        if (data.column.index === lastColIndex) {
          const val = data.cell.raw as string;
          if (val === "trab.") {
            data.cell.styles.fillColor = [39, 174, 96];
            data.cell.styles.textColor = [255, 255, 255];
            data.cell.styles.fontStyle = "bold";
          } else if (val === "folga") {
            data.cell.styles.fillColor = [231, 76, 60];
            data.cell.styles.textColor = [255, 255, 255];
            data.cell.styles.fontStyle = "bold";
          }
        }
      }
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
  });

  doc.save(`ponto_${employee.name.replace(/\s+/g, "_")}_${MONTHS[month - 1]}_${year}.pdf`);
}

export async function generateMonthlyExcel(
  employee: Employee,
  year: number,
  month: number
) {
  const daysInMonth = getDaysInMonth(year, month);
  const byDay = await fetchAndGroupRecords(employee, year, month);

  const isSimple = employee.punch_mode === "simple";
  const steps = isSimple ? ["entrada", "saida"] : ["entrada", "intervalo", "retorno", "saida"];
  const stepHeaders = isSimple ? ["Entrada", "Saída"] : ["Entrada", "Pausa", "Retorno", "Saída"];

  const escala = (employee as any).escala;
  const shift = (employee as any).shift;
  const escalaLabel = escala === "12x36" ? "12×36" : "Padrão";
  const shiftLabel = shift === "noturno" ? "Noturno" : "Diurno";

  const monthLabel = `${MONTHS[month - 1]} ${year}`;
  const rows: string[][] = [];
  rows.push(["APA Ponto - Registro de Ponto"]);
  rows.push([`Colaborador: ${employee.name}`]);
  rows.push([`Período: ${monthLabel}`]);
  rows.push([`Turno: ${shiftLabel} | Escala: ${escalaLabel}`]);
  rows.push([]);
  rows.push(["Dia", ...stepHeaders, "Jornada"]);

  for (let day = 1; day <= daysInMonth; day++) {
    const dayData = byDay[day];
    const cols = steps.map((s) => dayData?.[s] || "-");
    const hasAny = cols.some((c) => c !== "-");
    rows.push([String(day).padStart(2, "0"), ...cols, hasAny ? "Trabalhado" : "Folga"]);
  }

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
