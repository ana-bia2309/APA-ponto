import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

export async function generateMonthlyReport(
  employee: Employee,
  year: number,
  month: number
) {
  const daysInMonth = getDaysInMonth(year, month);
  const startDate = `${year}-${String(month).padStart(2, "0")}-01T00:00:00`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${daysInMonth}T23:59:59`;

  const { data: records } = await supabase
    .from("punch_records")
    .select("*")
    .eq("employee_id", employee.id)
    .gte("punched_at", startDate)
    .lte("punched_at", endDate)
    .order("punched_at");

  const byDay: Record<number, Record<string, string>> = {};
  for (const rec of records || []) {
    const day = new Date(rec.punched_at).getDate();
    if (!byDay[day]) byDay[day] = {};
    byDay[day][rec.step] = formatTime(rec.punched_at);
  }

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

  if ((employee as any).cpf) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`CPF: ${(employee as any).cpf}`, pageWidth / 2, 38, { align: "center" });
  }

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

  const startY = (employee as any).cpf ? 44 : 38;

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
  const startDate = `${year}-${String(month).padStart(2, "0")}-01T00:00:00`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${daysInMonth}T23:59:59`;

  const { data: records } = await supabase
    .from("punch_records")
    .select("*")
    .eq("employee_id", employee.id)
    .gte("punched_at", startDate)
    .lte("punched_at", endDate)
    .order("punched_at");

  const byDay: Record<number, Record<string, string>> = {};
  for (const rec of records || []) {
    const day = new Date(rec.punched_at).getDate();
    if (!byDay[day]) byDay[day] = {};
    byDay[day][rec.step] = formatTime(rec.punched_at);
  }

  const isSimple = employee.punch_mode === "simple";
  const steps = isSimple ? ["entrada", "saida"] : ["entrada", "intervalo", "retorno", "saida"];
  const stepHeaders = isSimple ? ["Entrada", "Saída"] : ["Entrada", "Pausa", "Retorno", "Saída"];

  const monthLabel = `${MONTHS[month - 1]} ${year}`;
  const rows: string[][] = [];
  rows.push(["APA Ponto - Registro de Ponto"]);
  rows.push([`Colaborador: ${employee.name}`]);
  rows.push([`Período: ${monthLabel}`]);
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
