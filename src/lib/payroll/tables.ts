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
  ]
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