import Decimal from "decimal.js";
import {
  INSS_TABLE_2025, INSS_TETO,
  IRRF_TABLE_2025, IRRF_DEDUCAO_DEPENDENTE, FGTS_ALIQUOTA,
  IRRF_REDUTOR_LIMITE_ISENCAO, IRRF_REDUTOR_LIMITE_REDUCAO,
  IRRF_REDUTOR_CONSTANTE, IRRF_REDUTOR_COEFICIENTE,
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
   horas_falta_dia?: number;
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

/**
 * Calcula o IRRF já aplicando o redutor da Lei 15.270/2025 (vigente desde jan/2026).
 * Zera o imposto para base tributável até R$5.000 e reduz gradualmente até R$7.350.
 * Acima de R$7.350, segue só a tabela progressiva tradicional (sem redutor).
 *
 * IMPORTANTE: o "rendimento tributável" usado para decidir a faixa do redutor é a
 * base bruta ANTES dos descontos de INSS/dependentes (conforme exemplos oficiais da
 * Receita Federal), enquanto o cálculo do imposto pela tabela progressiva continua
 * usando a base líquida (depois de INSS/dependentes), exatamente como já era feito.
 */
export function calcIRRFComRedutor2026(
  baseBruta: string | number,
  inss: string | number,
  dependentes: number,
): { irrf: string; base: string; redutor_aplicado: string } {
  const { irrf: irrfSemRedutor, base } = calcIRRF(baseBruta, inss, dependentes);
  const rendimentoTributavel = D(baseBruta);

  // Acima do limite de redução: sem benefício, comportamento igual ao de antes
  if (rendimentoTributavel.gt(IRRF_REDUTOR_LIMITE_REDUCAO)) {
    return { irrf: irrfSemRedutor, base, redutor_aplicado: "0.00" };
  }

  // Até R$5.000 de rendimento tributável: isenção total
  if (rendimentoTributavel.lte(IRRF_REDUTOR_LIMITE_ISENCAO)) {
    return { irrf: "0.00", base, redutor_aplicado: irrfSemRedutor };
  }

  // Entre R$5.000,01 e R$7.350,00: redutor parcial
  // Fórmula oficial: R$978,62 − (0,133145 × rendimento tributável)
  const redutor = D(IRRF_REDUTOR_CONSTANTE).minus(
    D(IRRF_REDUTOR_COEFICIENTE).mul(rendimentoTributavel),
  );
  const redutorPositivo = Decimal.max(redutor, D(0));
  const irrfFinal = Decimal.max(D(irrfSemRedutor).minus(redutorPositivo), D(0));

  return {
    irrf: round2(irrfFinal),
    base,
    redutor_aplicado: round2(Decimal.min(redutorPositivo, D(irrfSemRedutor))),
  };
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
  const horasPorFalta = work.horas_falta_dia ?? 8;
  const faltasValor = valorHora.mul(horasPorFalta).mul(work.faltas_dias);
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

  // 12. IRRF (com redutor da Lei 15.270/2025)
  const { irrf, base: baseIrrf } = calcIRRFComRedutor2026(
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
): Pick<WorkSummary,"horas_trabalhadas"|"horas_extras_50"|"horas_noturnas"|"faltas_dias"|"atrasos_minutos"|"horas_extras_100"|"dias_uteis_mes"|"dias_trabalhados"|"horas_falta_dia"> {
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
  const { irrf } = calcIRRFComRedutor2026(segundaParcelaBruta.toString(), inss, dependentesIrrf);

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

export type TipoRescisao = "sem_justa_causa" | "pedido_demissao" | "justa_causa" | "acordo_mutuo";

export type RescisaoResult = {
  saldo_salario: string;
  aviso_previo_dias: number;
  aviso_previo_valor: string;
  aviso_previo_tipo: "indenizado" | "descontado" | "nenhum";
  ferias_vencidas_dias: number;
  ferias_vencidas_valor: string;
  ferias_proporcionais_dias: number;
  ferias_proporcionais_valor: string;
  decimo_terceiro_proporcional: string;
  multa_fgts_percentual: number;
  multa_fgts_valor: string;
  fgts_liberado_percentual: number;
  fgts_liberado_valor: string;
  total_proventos: string;
  total_descontos: string;
  liquido: string;
  items: PayrollItem[];
};

/**
 * Calcula os dias de aviso prévio com base no tempo de empresa.
 * 30 dias base + 3 dias por ano completo trabalhado, máximo 90 dias (Lei 12.506/2011).
 */
export function calcularDiasAvisoPrevio(anosCompletos: number): number {
  const dias = 30 + anosCompletos * 3;
  return Math.min(dias, 90);
}

/**
 * Calcula as verbas rescisórias com base no tipo de rescisão.
 */
export function calcularRescisao(params: {
  tipo: TipoRescisao;
  salarioBase: string | number;
  dataAdmissao: string; // YYYY-MM-DD
  dataRescisao: string; // YYYY-MM-DD
  cumpriuAvisoPrevio: boolean; // se o funcionário/empresa cumpriu o aviso trabalhando
  feriasVencidasDias: number; // dias de férias vencidas não gozadas (vem do get_saldo_ferias)
  mesesTrabalhadosAnoAtual: number; // para 13º e férias proporcionais
  saldoFgts: string | number;
  dependentesIrrf: number;
}): RescisaoResult {
  const items: PayrollItem[] = [];
  const salario = D(params.salarioBase);
  const admissao = new Date(params.dataAdmissao + "T12:00:00");
  const rescisao = new Date(params.dataRescisao + "T12:00:00");

  const anosCompletos = Math.floor(
    (rescisao.getTime() - admissao.getTime()) / (365.25 * 86400000),
  );

  // 1. Saldo de salário (dias trabalhados no mês da rescisão)
  const diasNoMes = new Date(rescisao.getFullYear(), rescisao.getMonth() + 1, 0).getDate();
  const diaRescisao = rescisao.getDate();
  const valorDia = salario.div(30);
  const saldoSalario = valorDia.mul(diaRescisao);
  items.push({
    kind: "provento", code: "300", description: "Saldo de Salário",
    reference: `${diaRescisao} dia(s)`, amount: round2(saldoSalario),
  });

  // 2. Aviso prévio
  const diasAviso = calcularDiasAvisoPrevio(anosCompletos);
  let avisoPrevioValor = D(0);
  let avisoPrevioTipo: "indenizado" | "descontado" | "nenhum" = "nenhum";

  if (params.tipo === "sem_justa_causa") {
    if (!params.cumpriuAvisoPrevio) {
      avisoPrevioValor = valorDia.mul(diasAviso);
      avisoPrevioTipo = "indenizado";
      items.push({
        kind: "provento", code: "301", description: "Aviso Prévio Indenizado",
        reference: `${diasAviso} dia(s)`, amount: round2(avisoPrevioValor),
      });
    }
  } else if (params.tipo === "pedido_demissao") {
    if (!params.cumpriuAvisoPrevio) {
      avisoPrevioValor = valorDia.mul(30); // desconto é sempre 30 dias, sem o adicional
      avisoPrevioTipo = "descontado";
      items.push({
        kind: "desconto", code: "302", description: "Aviso Prévio Não Cumprido (desconto)",
        reference: "30 dia(s)", amount: round2(avisoPrevioValor),
      });
    }
  } else if (params.tipo === "acordo_mutuo") {
    if (!params.cumpriuAvisoPrevio) {
      avisoPrevioValor = valorDia.mul(diasAviso).div(2); // 50% do valor
      avisoPrevioTipo = "indenizado";
      items.push({
        kind: "provento", code: "301", description: "Aviso Prévio Indenizado (50% — Acordo)",
        reference: `${diasAviso} dia(s)`, amount: round2(avisoPrevioValor),
      });
    }
  }
  // justa_causa: sem aviso prévio

  // 3. Férias vencidas (todos os tipos exceto sem direito específico têm direito se já venceram)
  let feriasVencidasValor = D(0);
  if (params.feriasVencidasDias > 0) {
    const valorFeriasVencidas = salario.div(30).mul(params.feriasVencidasDias);
    const tercoFeriasVencidas = valorFeriasVencidas.div(3);
    feriasVencidasValor = valorFeriasVencidas.plus(tercoFeriasVencidas);
    items.push({
      kind: "provento", code: "303", description: "Férias Vencidas + 1/3",
      reference: `${params.feriasVencidasDias} dia(s)`, amount: round2(feriasVencidasValor),
    });
  }

  // 4. Férias proporcionais — não há em justa causa
  let feriasProporcionaisValor = D(0);
  let feriasProporcionaisDias = 0;
  if (params.tipo !== "justa_causa") {
    feriasProporcionaisDias = Math.round((params.mesesTrabalhadosAnoAtual / 12) * 30);
    const valorFeriasProp = salario.div(30).mul(feriasProporcionaisDias);
    const tercoFeriasProp = valorFeriasProp.div(3);
    feriasProporcionaisValor = valorFeriasProp.plus(tercoFeriasProp);
    items.push({
      kind: "provento", code: "304", description: "Férias Proporcionais + 1/3",
      reference: `${params.mesesTrabalhadosAnoAtual}/12 avos`, amount: round2(feriasProporcionaisValor),
    });
  }

  // 5. 13º proporcional — não há em justa causa
  let decimoTerceiro = D(0);
  if (params.tipo !== "justa_causa") {
    decimoTerceiro = salario.div(12).mul(params.mesesTrabalhadosAnoAtual);
    items.push({
      kind: "provento", code: "305", description: "13º Salário Proporcional",
      reference: `${params.mesesTrabalhadosAnoAtual}/12 avos`, amount: round2(decimoTerceiro),
    });
  }

  // 6. Multa de FGTS e liberação
  let multaFgtsPercentual = 0;
  let fgtsLiberadoPercentual = 0;
  const saldoFgts = D(params.saldoFgts);

  if (params.tipo === "sem_justa_causa") {
    multaFgtsPercentual = 40;
    fgtsLiberadoPercentual = 100;
  } else if (params.tipo === "acordo_mutuo") {
    multaFgtsPercentual = 20;
    fgtsLiberadoPercentual = 80;
  }
  // pedido_demissao e justa_causa: 0% multa, 0% liberado

  const multaFgtsValor = saldoFgts.mul(multaFgtsPercentual).div(100);
  const fgtsLiberadoValor = saldoFgts.mul(fgtsLiberadoPercentual).div(100);

  if (multaFgtsValor.gt(0)) {
    items.push({
      kind: "provento", code: "306", description: `Multa FGTS (${multaFgtsPercentual}%)`,
      reference: "Sobre saldo FGTS", amount: round2(multaFgtsValor),
    });
  }
  items.push({
    kind: "informativo", code: "950", description: "FGTS Liberado para Saque",
    reference: `${fgtsLiberadoPercentual}%`, amount: round2(fgtsLiberadoValor),
  });

  // 7. INSS e IRRF sobre saldo de salário + 13º (férias e aviso prévio indenizado são isentos)
  const baseTributavel = saldoSalario.plus(decimoTerceiro);
  const { inss } = calcINSS(baseTributavel.toString());
  const { irrf } = calcIRRFComRedutor2026(baseTributavel.toString(), inss, params.dependentesIrrf);

  if (D(inss).gt(0)) {
    items.push({
      kind: "desconto", code: "400", description: "INSS",
      reference: "Sobre saldo + 13º", amount: inss,
    });
  }
  if (D(irrf).gt(0)) {
    items.push({
      kind: "desconto", code: "401", description: "IRRF",
      reference: "Sobre saldo + 13º", amount: irrf,
    });
  }

  // Totais
  const totalProventos = items
    .filter(i => i.kind === "provento")
    .reduce((acc, i) => acc.plus(i.amount), D(0));
  const totalDescontos = items
    .filter(i => i.kind === "desconto")
    .reduce((acc, i) => acc.plus(i.amount), D(0));
  const liquido = totalProventos.minus(totalDescontos);

  return {
    saldo_salario: round2(saldoSalario),
    aviso_previo_dias: diasAviso,
    aviso_previo_valor: round2(avisoPrevioValor),
    aviso_previo_tipo: avisoPrevioTipo,
    ferias_vencidas_dias: params.feriasVencidasDias,
    ferias_vencidas_valor: round2(feriasVencidasValor),
    ferias_proporcionais_dias: feriasProporcionaisDias,
    ferias_proporcionais_valor: round2(feriasProporcionaisValor),
    decimo_terceiro_proporcional: round2(decimoTerceiro),
    multa_fgts_percentual: multaFgtsPercentual,
    multa_fgts_valor: round2(multaFgtsValor),
    fgts_liberado_percentual: fgtsLiberadoPercentual,
    fgts_liberado_valor: round2(fgtsLiberadoValor),
    total_proventos: round2(totalProventos),
    total_descontos: round2(totalDescontos),
    liquido: round2(liquido),
    items,
  };
}