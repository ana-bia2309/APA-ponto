// Tabelas oficiais 2025/2026 — atualizar anualmente
// Valores em reais. INSS: faixas progressivas. IRRF: dedução por dependente.

// Atualizado para 2026 em 17/06/2026 — próxima revisão recomendada: janeiro/2027
export const INSS_TABLE_2025 = [
  { ate: "1621.00", aliquota: "0.075" },
  { ate: "2902.84", aliquota: "0.09" },
  { ate: "4354.27", aliquota: "0.12" },
  { ate: "8475.55", aliquota: "0.14" },
];
export const INSS_TETO = "8475.55";

export const IRRF_TABLE_2025 = [
  { ate: "2428.80", aliquota: "0", deducao: "0" },
  { ate: "2826.65", aliquota: "0.075", deducao: "169.44" },
  { ate: "3751.05", aliquota: "0.15", deducao: "381.44" },
  { ate: "4664.68", aliquota: "0.225", deducao: "662.77" },
  { ate: "999999999", aliquota: "0.275", deducao: "908.73" },
];
export const IRRF_DEDUCAO_DEPENDENTE = "189.59";

// Redutor do IRRF — Lei 15.270/2025, vigente desde jan/2026
// Zera o imposto até R$5.000 de base e reduz gradualmente até R$7.350
export const IRRF_REDUTOR_LIMITE_ISENCAO = "5000.00";
export const IRRF_REDUTOR_LIMITE_REDUCAO = "7350.00";
export const IRRF_REDUTOR_CONSTANTE = "978.62";
export const IRRF_REDUTOR_COEFICIENTE = "0.133145";

export const FGTS_ALIQUOTA = "0.08";

// --- Feriados móveis ---------------------------------------------------

// Calcula o Domingo de Páscoa para um ano (algoritmo de Gauss/Meeus,
// válido para o calendário gregoriano)
function calcularPascoa(year: number): Date {
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
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function formatarDataISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function somarDias(date: Date, dias: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + dias);
  return result;
}

// Feriados móveis calculados a partir da Páscoa:
// - Sexta-feira Santa: feriado nacional (Páscoa - 2 dias)
// - Carnaval (segunda e terça): ponto facultativo, tratado como feriado
//   pela prática da empresa (Páscoa - 48 e - 47 dias)
// - Corpus Christi: ponto facultativo nacional, tratado como feriado
//   pela prática da empresa (Páscoa + 60 dias)
function getFeriadosMoveis(year: number): string[] {
  const pascoa = calcularPascoa(year);
  return [
    formatarDataISO(somarDias(pascoa, -48)), // Segunda de Carnaval
    formatarDataISO(somarDias(pascoa, -47)), // Terça de Carnaval
    formatarDataISO(somarDias(pascoa, -2)),  // Sexta-feira Santa
    formatarDataISO(somarDias(pascoa, 60)),  // Corpus Christi
  ];
}

// Feriados nacionais (fixos + móveis)
export function getFeriadosNacionais(year: number): string[] {
  return [
    `${year}-01-01`, // Confraternização Universal
    `${year}-04-21`, // Tiradentes
    `${year}-05-01`, // Dia do Trabalho
    `${year}-09-07`, // Independência
    `${year}-10-12`, // Nossa Sra. Aparecida
    `${year}-11-02`, // Finados
    `${year}-11-15`, // Proclamação da República
    `${year}-12-25`, // Natal
    ...getFeriadosMoveis(year),
  ];
}

export function getDiasUteisNoMes(year: number, month: number): number {
  const feriados = getFeriadosNacionais(year);
  let count = 0;
  const days = new Date(year, month, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    if (dow !== 0 && dow !== 6 && !feriados.includes(dateStr)) count++;
  }
  return count;
}