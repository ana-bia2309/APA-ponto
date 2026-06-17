import Decimal from "decimal.js";
import {
  INSS_TABLE_2025, INSS_TETO,
  IRRF_TABLE_2025, IRRF_DEDUCAO_DEPENDENTE, FGTS_ALIQUOTA,
} from "./tables";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

export type PayrollItem = {
  kind: "provento" | "desconto" | "informativo";
  code: string;
  description: string;
  reference?: string;
  amount: string; // decimal string
};

export type PayrollSettings = {
  salario_base: string | number;
  carga_horaria_mensal: string | number;
  vale_transporte: string | number;
  vale_alimentacao: string | number;
  dependentes_irrf: number;
  percentual_comissao: string | number;
  hora_extra_habilitada: boolean;
  adicional_noturno_percent: string | number;
  desconta_vt: boolean;
  gratificacao_fixa?: string | number;
  gratificacao_percentual?: string | number;
};

export type WorkSummary = {
  horas_trabalhadas: string | number;
  horas_extras_50: string | number;
  horas_extras_100: string | number;
  horas_noturnas: string | number;
  faltas_dias: string | number;
  atrasos_minutos: number;
  comissao_base?: string | number;
  bonificacoes?: string | number;
  custom_items?: PayrollItem[];
  dias_uteis_mes?: number;
  dias_trabalhados?: number;
};

export type PayrollResult = {
  items: PayrollItem[];
  total_proventos: string;
  total_descontos: string;
  liquido: string;
  base_inss: string;
  base_irrf: string;
  inss: string;
  irrf: string;
  fgts: string;
};

const D = (v: string | number | undefined | null) => new Decimal(v ?? 0);
const round2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toFixed(2);

export function calcINSS(baseSalary: string | number): { inss: string; base: string } {
  let base = D(baseSalary);
  if (base.gt(INSS_TETO)) base = D(INSS_TETO);
  let total = D(0);
  let prev = D(0);
  for (const faixa of INSS_TABLE_2025) {
    const teto = D(faixa.ate);
    if (base.gt(teto)) {
      total = total.plus(teto.minus(prev).mul(faixa.aliquota));
      prev = teto;
    } else {
      total = total.plus(base.minus(prev).mul(faixa.aliquota));
      prev = base;
      break;
    }
  }
  return { inss: round2(total), base: round2(base) };
}

export function calcIRRF(
  baseBruta: string | number,
  inss: string | number,
  dependentes: number,
): { irrf: string; base: string } {
  const deducaoDep = D(IRRF_DEDUCAO_DEPENDENTE).mul(dependentes);
  const base = D(baseBruta).minus(inss).minus(deducaoDep);
  if (base.lte(0)) return { irrf: "0.00", base: "0.00" };
  for (const faixa of IRRF_TABLE_2025) {
    if (base.lte(faixa.ate)) {
      const irrf = base.mul(faixa.aliquota).minus(faixa.deducao);
      return {
        irrf: irrf.lte(0) ? "0.00" : round2(irrf),
        base: round2(base),
      };
    }
  }
  return { irrf: "0.00", base: round2(base) };
}

export function calculatePayroll(
  settings: PayrollSettings,
  work: WorkSummary,
): PayrollResult {
  const items: PayrollItem[] = [];

  const salario = D(settings.salario_base);
  const cargaMensal = D(settings.carga_horaria_mensal);
  const valorHora = cargaMensal.gt(0) ? salario.div(cargaMensal) : D(0);

  // 1. Salário base (proporcional a faltas/atrasos)
  const faltasValor = valorHora.mul(8).mul(work.faltas_dias); // 8h por dia faltado
  const atrasosValor = valorHora.div(60).mul(work.atrasos_minutos);
  const salarioLiquidoMes = salario.minus(faltasValor).minus(atrasosValor);
  items.push({
    kind: "provento", code: "001", description: "Salário Base",
    reference: `${cargaMensal.toFixed(0)}h`, amount: round2(salario),
  });

  // 2. Horas extras 50%
  if (settings.hora_extra_habilitada && D(work.horas_extras_50).gt(0)) {
    const valor = valorHora.mul("1.5").mul(work.horas_extras_50);
    items.push({
      kind: "provento", code: "002", description: "Horas Extras 50%",
      reference: `${D(work.horas_extras_50).toFixed(2)}h`, amount: round2(valor),
    });
  }

  // 3. Horas extras 100%
  if (settings.hora_extra_habilitada && D(work.horas_extras_100).gt(0)) {
    const valor = valorHora.mul(2).mul(work.horas_extras_100);
    items.push({
      kind: "provento", code: "003", description: "Horas Extras 100%",
      reference: `${D(work.horas_extras_100).toFixed(2)}h`, amount: round2(valor),
    });
  }

  // 4. Adicional noturno
  if (D(work.horas_noturnas).gt(0)) {
    const adic = D(settings.adicional_noturno_percent).div(100);
    const valor = valorHora.mul(adic).mul(work.horas_noturnas);
    items.push({
      kind: "provento", code: "004", description: "Adicional Noturno",
      reference: `${D(work.horas_noturnas).toFixed(2)}h`, amount: round2(valor),
    });
  }

  // 5. DSR (descanso semanal remunerado) — proporcional sobre extras
  const extrasTotal = items
    .filter((i) => i.code === "002" || i.code === "003" || i.code === "004")
    .reduce((acc, i) => acc.plus(i.amount), D(0));
  if (extrasTotal.gt(0)) {
    const dsr = extrasTotal.mul(D(1).div(6)); // 1/6 padrão CLT
    items.push({
      kind: "provento", code: "005", description: "DSR sobre Variáveis",
      amount: round2(dsr),
    });
  }

  // 6. Comissões
  if (D(settings.percentual_comissao).gt(0) && D(work.comissao_base ?? 0).gt(0)) {
    const valor = D(work.comissao_base).mul(D(settings.percentual_comissao).div(100));
    items.push({
      kind: "provento", code: "006", description: "Comissões",
      reference: `${settings.percentual_comissao}%`, amount: round2(valor),
    });
  }

  // 7. Bonificações
  if (D(work.bonificacoes ?? 0).gt(0)) {
    items.push({
      kind: "provento", code: "007", description: "Bonificação",
      amount: round2(D(work.bonificacoes)),
    });
  }
  // 7b. Gratificação
  const gratFixa = D(settings.gratificacao_fixa ?? 0);
  const gratPct = D(settings.gratificacao_percentual ?? 0);
  const gratPctValor = gratPct.gt(0) ? salario.mul(gratPct.div(100)) : D(0);
  const gratTotal = gratFixa.plus(gratPctValor);
  if (gratTotal.gt(0)) {
    const ref = gratFixa.gt(0) && gratPct.gt(0)
      ? `R$ ${round2(gratFixa)} + ${gratPct.toFixed(2)}%`
      : gratPct.gt(0) ? `${gratPct.toFixed(2)}% do salário` : "Valor fixo";
    items.push({
      kind: "provento", code: "008b", description: "Gratificação",
      reference: ref, amount: round2(gratTotal),
    });
  }

  // 8. Vale alimentação — proporcional a dias úteis trabalhados
  if (D(settings.vale_alimentacao).gt(0)) {
    const diasUteis = D(work.dias_uteis_mes ?? 22);
    const diasTrab = D(work.dias_trabalhados ?? diasUteis.toNumber());
    const vaProporcional = diasUteis.gt(0)
      ? D(settings.vale_alimentacao).div(diasUteis).mul(diasTrab)
      : D(settings.vale_alimentacao);
    items.push({
      kind: "provento", code: "008", description: "Vale Alimentação",
      reference: `${diasTrab.toFixed(0)}/${diasUteis.toFixed(0)} dias úteis`,
      amount: round2(vaProporcional),
    });
  }

  // 9. Custom items
  for (const ci of work.custom_items ?? []) items.push(ci);

  // 10. Faltas/atrasos como descontos visíveis
  if (faltasValor.gt(0)) {
    items.push({
      kind: "desconto", code: "100", description: "Faltas",
      reference: `${D(work.faltas_dias).toFixed(1)} dia(s)`, amount: round2(faltasValor),
    });
  }
  if (atrasosValor.gt(0)) {
    items.push({
      kind: "desconto", code: "101", description: "Atrasos",
      reference: `${work.atrasos_minutos} min`, amount: round2(atrasosValor),
    });
  }

  // Base bruta (somente proventos tributáveis: exclui VA)
  const proventosTributaveis = items
    .filter((i) => i.kind === "provento" && i.code !== "008")
    .reduce((acc, i) => acc.plus(i.amount), D(0))
    .minus(faltasValor).minus(atrasosValor);

  // 11. INSS
  const { inss, base: baseInss } = calcINSS(proventosTributaveis.toString());
  items.push({
    kind: "desconto", code: "200", description: "INSS",
    reference: "Tabela Progressiva", amount: inss,
  });

  // 12. IRRF
  const { irrf, base: baseIrrf } = calcIRRF(
    proventosTributaveis.toString(), inss, settings.dependentes_irrf,
  );
  if (D(irrf).gt(0)) {
    items.push({
      kind: "desconto", code: "201", description: "IRRF",
      reference: `${settings.dependentes_irrf} dep.`, amount: irrf,
    });
  }

  // 13. Vale transporte — proporcional descontando faltas, limite 6%
  if (settings.desconta_vt && D(settings.vale_transporte).gt(0)) {
    const diasUteis = D(work.dias_uteis_mes ?? 22);
    const faltas = D(work.faltas_dias ?? 0);
    const diasVt = Decimal.max(diasUteis.minus(faltas), D(0));
    const vtProporcional = diasUteis.gt(0)
      ? D(settings.vale_transporte).div(diasUteis).mul(diasVt)
      : D(settings.vale_transporte);
    const limite = salario.mul("0.06");
    const vtMin = Decimal.min(vtProporcional, limite);
    const vt = new Decimal(vtMin.toString());
    items.push({
      kind: "desconto", code: "202", description: "Vale Transporte",
      reference: `${diasVt.toFixed(0)} dias · 6% máx.`,
      amount: round2(vt),
    });
  }

  // 14. FGTS — informativo (não desconta do líquido)
  const fgts = proventosTributaveis.mul(FGTS_ALIQUOTA);
  items.push({
    kind: "informativo", code: "900", description: "FGTS do Mês",
    reference: "8%", amount: round2(fgts),
  });
  items.push({
    kind: "informativo", code: "901", description: "Base INSS",
    amount: baseInss,
  });
  items.push({
    kind: "informativo", code: "902", description: "Base IRRF",
    amount: baseIrrf,
  });

  // Totais
  const totalProv = items
    .filter((i) => i.kind === "provento")
    .reduce((acc, i) => acc.plus(i.amount), D(0))
    .minus(faltasValor).minus(atrasosValor);
  const totalDesc = items
    .filter((i) => i.kind === "desconto")
    .reduce((acc, i) => acc.plus(i.amount), D(0));
  const liquido = totalProv.minus(
    items
      .filter((i) => i.kind === "desconto" && (i.code === "200" || i.code === "201" || i.code === "202"))
      .reduce((acc, i) => acc.plus(i.amount), D(0)),
  );

  return {
    items,
    total_proventos: round2(totalProv),
    total_descontos: round2(totalDesc),
    liquido: round2(liquido),
    base_inss: baseInss,
    base_irrf: baseIrrf,
    inss,
    irrf,
    fgts: round2(fgts),
  };
}

/**
 * Calcula minutos no intervalo noturno (22h–5h horário local) entre dois instantes.
 * Cobre jornadas que cruzam a meia-noite (12x36, escala noturna).
 */
function minutosNoturnos(ini: Date, fim: Date): number {
  let total = 0;
  const passo = 60_000; // 1 min
  for (let t = ini.getTime(); t < fim.getTime(); t += passo) {
    const h = new Date(t).getHours();
    if (h >= 22 || h < 5) total++;
  }
  return total;
}

/**
 * Resumo de horas no mês a partir de time_records.
 * Agrupa por JORNADA (entrada→saida), suportando jornadas que cruzam meia-noite.
 * Calcula horas extras 50% (seg-sáb), 100% (domingo), adicional noturno e faltas.
 */
export function summarizeWorkFromRecords(
  records: Array<{ record_type: string; recorded_at: string }>,
  opts: {
    cargaHorariaDiaria?: number;
    diasUteisPrevistos?: number; // dias esperados de trabalho no mês
  } = {},
): Pick<WorkSummary,"horas_trabalhadas"|"horas_extras_50"|"horas_noturnas"|"faltas_dias"|"atrasos_minutos"|"horas_extras_100"|"dias_uteis_mes"|"dias_trabalhados"> {
  const cargaDiaria = opts.cargaHorariaDiaria ?? 8;

  // Ordena cronologicamente e separa em jornadas (cada jornada inicia em "entrada") 
  const sorted = [...records]
    .map((r) => ({ t: r.record_type, at: new Date(r.recorded_at) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  type Jornada = { entrada?: Date; saida?: Date; intervaloMin: number };
  const jornadas: Jornada[] = [];
  let cur: Jornada | null = null;
  let intervaloIni: Date | null = null;

  for (const e of sorted) {
    if (e.t === "entrada") {
      if (cur) jornadas.push(cur);
      cur = { entrada: e.at, intervaloMin: 0 };
      intervaloIni = null;
    } else if (e.t === "intervalo" && cur) {
      intervaloIni = e.at;
    } else if (e.t === "retorno" && cur && intervaloIni) {
      cur.intervaloMin += (e.at.getTime() - intervaloIni.getTime()) / 60000;
      intervaloIni = null;
    } else if (e.t === "saida" && cur) {
      cur.saida = e.at;
      jornadas.push(cur);
      cur = null;
    }
  }
  if (cur) jornadas.push(cur);

  let totalMin = 0;
  let extras50Min = 0;
  let extras100Min = 0;
  let noturnasMin = 0;
  let diasTrabalhados = 0;

  for (const j of jornadas) {
    if (!j.entrada || !j.saida) continue;
    const bruto = (j.saida.getTime() - j.entrada.getTime()) / 60000 - j.intervaloMin;
    if (bruto <= 0) continue;
    diasTrabalhados++;
    totalMin += bruto;

    const previstoMin = cargaDiaria * 60;
    const extra = Math.max(0, bruto - previstoMin);
    // Domingo (0) → 100%; demais → 50%
    if (j.entrada.getDay() === 0) extras100Min += extra;
    else extras50Min += extra;

    noturnasMin += minutosNoturnos(j.entrada, j.saida);
  }

  const previstos = opts.diasUteisPrevistos ?? jornadas.length;
  const faltas = Math.max(0, previstos - diasTrabalhados);

  return {
    horas_trabalhadas: (totalMin / 60).toFixed(2),
    horas_extras_50: (extras50Min / 60).toFixed(2),
    horas_extras_100: (extras100Min / 60).toFixed(2),
    horas_noturnas: (noturnasMin / 60).toFixed(2),
    faltas_dias: faltas.toFixed(0),
    atrasos_minutos: 0,
  };

return {
    horas_trabalhadas: (totalMin / 60).toFixed(2),
    horas_extras_50: (extras50Min / 60).toFixed(2),
    horas_extras_100: (extras100Min / 60).toFixed(2),
    horas_noturnas: (noturnasMin / 60).toFixed(2),
    faltas_dias: faltas.toFixed(0),
    atrasos_minutos: 0,
  };
}

/**
 * Calcula o 13º salário de um funcionário com base no salário e meses trabalhados no ano.
 * 1ª parcela: metade do valor total, sem desconto de INSS/IRRF.
 * 2ª parcela: o restante, com INSS e IRRF descontados sobre o valor da parcela.
 */
export function calcular13Salario(
  salarioBase: string | number,
  mesesTrabalhados: number,
  dependentesIrrf: number,
): {
  valor_total: string;
  primeira_parcela: string;
  segunda_parcela_bruta: string;
  inss: string;
  irrf: string;
  segunda_parcela_liquida: string;
} {
  const valorTotal = D(salarioBase).div(12).mul(mesesTrabalhados);
  const primeiraParcela = valorTotal.div(2);
  const segundaParcelaBruta = valorTotal.minus(primeiraParcela);

  const { inss } = calcINSS(segundaParcelaBruta.toString());
  const { irrf } = calcIRRF(segundaParcelaBruta.toString(), inss, dependentesIrrf);

  const segundaParcelaLiquida = segundaParcelaBruta.minus(inss).minus(D(irrf));

  return {
    valor_total: round2(valorTotal),
    primeira_parcela: round2(primeiraParcela),
    segunda_parcela_bruta: round2(segundaParcelaBruta),
    inss,
    irrf,
    segunda_parcela_liquida: round2(segundaParcelaLiquida),
  };
}

