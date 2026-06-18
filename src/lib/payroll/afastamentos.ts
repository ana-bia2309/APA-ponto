import { supabase } from "@/integrations/supabase/client";

/**
 * Tipos de afastamento que, por lei (CLT), são remunerados e NÃO podem gerar
 * desconto de falta na folha. "suspensao" (medida disciplinar, sem remuneração
 * por natureza) e "outro" (genérico, sem garantia legal clara) ficam de fora
 * de propósito — continuam gerando desconto normalmente.
 */
export const TIPOS_AFASTAMENTO_SEM_DESCONTO = [
  "licenca_medica",
  "licenca_maternidade",
  "licenca_paternidade",
  "ferias",
  "acidente_trabalho",
  "abono_dia",
];

/**
 * Retorna o conjunto de datas (YYYY-MM-DD) dentro do período informado em que
 * o funcionário estava em algum afastamento protegido por lei (sem desconto).
 * Não filtra por dia da semana — quem chama decide se conta fim de semana ou não,
 * de acordo com a escala do funcionário (padrão vs 12x36).
 */
export async function getDatasAfastamentoSemDesconto(
  employeeId: string,
  primeiroDia: string, // YYYY-MM-DD
  ultimoDia: string,   // YYYY-MM-DD
): Promise<Set<string>> {
  const { data } = await supabase
    .from("afastamentos" as any)
    .select("tipo, data_inicio, data_fim")
    .eq("employee_id", employeeId)
    .lte("data_inicio", ultimoDia)
    .gte("data_fim", primeiroDia);

  const datas = new Set<string>();
  const inicioPeriodo = new Date(primeiroDia + "T12:00:00");
  const fimPeriodo = new Date(ultimoDia + "T12:00:00");

  for (const af of (data as any[]) || []) {
    if (!TIPOS_AFASTAMENTO_SEM_DESCONTO.includes(af.tipo)) continue;
    const inicioAf = new Date(af.data_inicio + "T12:00:00");
    const fimAf = new Date(af.data_fim + "T12:00:00");
    const inicio = inicioAf > inicioPeriodo ? inicioAf : inicioPeriodo;
    const fim = fimAf < fimPeriodo ? fimAf : fimPeriodo;
    for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
      datas.add(d.toISOString().slice(0, 10));
    }
  }
  return datas;
}