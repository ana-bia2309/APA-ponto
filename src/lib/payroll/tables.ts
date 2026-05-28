// Tabelas oficiais 2025/2026 — atualizar anualmente
// Valores em reais. INSS: faixas progressivas. IRRF: dedução por dependente.

export const INSS_TABLE_2025 = [
  { ate: "1518.00", aliquota: "0.075" },
  { ate: "2793.88", aliquota: "0.09" },
  { ate: "4190.83", aliquota: "0.12" },
  { ate: "8157.41", aliquota: "0.14" },
];
export const INSS_TETO = "8157.41";

export const IRRF_TABLE_2025 = [
  { ate: "2259.20", aliquota: "0", deducao: "0" },
  { ate: "2826.65", aliquota: "0.075", deducao: "169.44" },
  { ate: "3751.05", aliquota: "0.15", deducao: "381.44" },
  { ate: "4664.68", aliquota: "0.225", deducao: "662.77" },
  { ate: "999999999", aliquota: "0.275", deducao: "896.00" },
];
export const IRRF_DEDUCAO_DEPENDENTE = "189.59";

export const FGTS_ALIQUOTA = "0.08";

// Feriados nacionais fixos
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