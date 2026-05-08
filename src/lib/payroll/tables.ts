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
