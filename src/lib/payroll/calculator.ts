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
};

export type WorkSummary = {
  horas_trabalhadas: string | number;
  horas_extras_50: string | number;
  horas_extras_100: string | number;
  horas_noturnas: string | number;
  faltas_dias: string | number;
  atrasos_minutos: number;
  comissao_base?: string | number; // valor sobre o qual se aplica comissão
  bonificacoes?: string | number;
  custom_items?: PayrollItem[];
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

  // 8. Vale alimentação (provento informativo se for benefício)
  if (D(settings.vale_alimentacao).gt(0)) {
    items.push({
      kind: "provento", code: "008", description: "Vale Alimentação",
      amount: round2(D(settings.vale_alimentacao)),
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
  const { inss, base: baseInss } = calcINSS(round2(proventosTributaveis));
  items.push({
    kind: "desconto", code: "200", description: "INSS",
    reference: "Tabela Progressiva", amount: inss,
  });

  // 12. IRRF
  const { irrf, base: baseIrrf } = calcIRRF(
    round2(proventosTributaveis), inss, settings.dependentes_irrf,
  );
  if (D(irrf).gt(0)) {
    items.push({
      kind: "desconto", code: "201", description: "IRRF",
      reference: `${settings.dependentes_irrf} dep.`, amount: irrf,
    });
  }

  // 13. Vale transporte (limite 6%)
  if (settings.desconta_vt && D(settings.vale_transporte).gt(0)) {
    const limite = salario.mul("0.06");
    const vt = Decimal.min(D(settings.vale_transporte), limite);
    items.push({
      kind: "desconto", code: "202", description: "Vale Transporte",
      reference: "6% máx.", amount: round2(vt),
    });
  }

  // 14. FGTS — informativo (não desconta do líquido)
  const fgts = D(proventosTributaveis).mul(FGTS_ALIQUOTA);
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

// Resumo de horas a partir de time_records do mês
export function summarizeWorkFromRecords(
  records: Array<{ record_type: string; recorded_at: string }>,
  cargaHorariaDiaria = 8,
): Pick<WorkSummary,"horas_trabalhadas"|"horas_extras_50"|"horas_noturnas"|"faltas_dias"|"atrasos_minutos"|"horas_extras_100"> {
  // Agrupa por dia, soma intervalos entrada→saida descontando intervalo→retorno
  const byDay = new Map<string, Array<{ t: string; at: Date }>>();
  for (const r of records) {
    const at = new Date(r.recorded_at);
    const key = at.toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push({ t: r.record_type, at });
  }
  let totalMin = 0;
  let noturnasMin = 0;
  for (const [, evs] of byDay) {
    evs.sort((a, b) => a.at.getTime() - b.at.getTime());
    let entrada: Date | null = null;
    let intervaloIni: Date | null = null;
    let intervaloMin = 0;
    for (const e of evs) {
      if (e.t === "entrada") entrada = e.at;
      else if (e.t === "intervalo") intervaloIni = e.at;
      else if (e.t === "retorno" && intervaloIni) {
        intervaloMin += (e.at.getTime() - intervaloIni.getTime()) / 60000;
        intervaloIni = null;
      } else if (e.t === "saida" && entrada) {
        const diff = (e.at.getTime() - entrada.getTime()) / 60000 - intervaloMin;
        totalMin += Math.max(0, diff);
        // noturnas: 22h-05h
        const start = entrada.getHours();
        const end = e.at.getHours();
        if (start >= 22 || end <= 5) noturnasMin += Math.min(diff, 7 * 60);
        entrada = null;
        intervaloMin = 0;
      }
    }
  }
  const horas = totalMin / 60;
  const previstas = byDay.size * cargaHorariaDiaria;
  const extras = Math.max(0, horas - previstas);
  return {
    horas_trabalhadas: horas.toFixed(2),
    horas_extras_50: extras.toFixed(2),
    horas_extras_100: "0",
    horas_noturnas: (noturnasMin / 60).toFixed(2),
    faltas_dias: "0",
    atrasos_minutos: 0,
  };
}
