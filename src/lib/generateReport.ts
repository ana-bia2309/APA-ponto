import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;

const STEP_ORDER = ["entrada", "intervalo", "retorno", "saida"];
const STEP_LABELS: Record<string, string> = {
  entrada: "entrada",
  intervalo: "pausa",
  retorno: "retorno",
  saida: "saída",
};

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

  // Group records by day
  const byDay: Record<number, Record<string, string>> = {};
  for (const rec of records || []) {
    const day = new Date(rec.punched_at).getDate();
    if (!byDay[day]) byDay[day] = {};
    byDay[day][rec.step] = formatTime(rec.punched_at);
  }

  const isSimple = employee.punch_mode === "simple";
  const steps = isSimple
    ? ["entrada", "saida"]
    : ["entrada", "intervalo", "retorno", "saida"];
  const stepHeaders = isSimple
    ? ["entrada", "saída"]
    : ["entrada", "pausa", "retorno", "saída"];

  // Build CSV
  const lines: string[] = [];
  lines.push(`Relatório de Ponto - ${MONTHS[month - 1]} ${year}`);
  lines.push(`Funcionário: ${employee.name}`);
  if ((employee as any).cpf) lines.push(`CPF: ${(employee as any).cpf}`);
  lines.push("");
  lines.push(["dia", ...stepHeaders, "jornada"].join(","));

  for (let day = 1; day <= daysInMonth; day++) {
    const dayData = byDay[day];
    const cols = steps.map((s) => dayData?.[s] || "-");
    const hasAny = cols.some((c) => c !== "-");
    const jornada = hasAny ? "trab." : "folga";
    lines.push([String(day).padStart(2, "0"), ...cols, jornada].join(","));
  }

  // Download
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ponto_${employee.name.replace(/\s+/g, "_")}_${MONTHS[month - 1]}_${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
