// src/lib/escala12x36.ts
import { supabase } from "@/integrations/supabase/client";

export type DiaEscala = "trabalha" | "descansa" | "indefinido";

/**
 * Calcula se um funcionário em escala 12x36 deveria trabalhar ou descansar
 * em uma data específica, com base na data de referência (um dia conhecido
 * em que ele trabalhou). A rotação é sempre 1 dia trabalha / 1 dia descansa.
 *
 * Retorna "indefinido" se o funcionário não tem escala 12x36 configurada
 * corretamente (sem escala_referencia_data) — nesses casos, quem chama
 * deve tratar como "não sabemos, não aplicar regra de falta automática".
 */
export function calcularDiaEscala12x36(
  escalaReferenciaData: string | null | undefined,
  dataAlvo: string, // formato YYYY-MM-DD
): DiaEscala {
  if (!escalaReferenciaData) return "indefinido";

  const ref = new Date(escalaReferenciaData + "T12:00:00");
  const alvo = new Date(dataAlvo + "T12:00:00");

  const diffDias = Math.round((alvo.getTime() - ref.getTime()) / 86400000);

  // diferença par (incluindo 0) = mesma "fase" da referência = trabalha
  // diferença ímpar = fase oposta = descansa
  return diffDias % 2 === 0 ? "trabalha" : "descansa";
}

/**
 * Busca todas as exceções manuais de um funcionário num intervalo de datas.
 * Retorna um mapa data -> tipo ("trabalha" | "descansa") para lookup rápido.
 */
export async function buscarExcecoesEscala(
  employeeId: string,
  dataInicio: string,
  dataFim: string,
): Promise<Record<string, "trabalha" | "descansa">> {
  const { data, error } = await (supabase as any)
    .from("escala_excecoes")
    .select("data, tipo")
    .eq("employee_id", employeeId)
    .gte("data", dataInicio)
    .lte("data", dataFim);

  if (error || !data) return {};

  const mapa: Record<string, "trabalha" | "descansa"> = {};
  data.forEach((e: any) => { mapa[e.data] = e.tipo; });
  return mapa;
}

/**
 * Versão "completa": considera exceção manual primeiro, senão cai no cálculo
 * automático pela data de referência. Use esta função no lugar das duas
 * anteriores sempre que já tiver o mapa de exceções carregado (evita N
 * chamadas ao banco quando processando várias datas de uma vez).
 */
export function getDiaEscalaComExcecoes(
  escalaReferenciaData: string | null | undefined,
  dataAlvo: string,
  excecoes: Record<string, "trabalha" | "descansa">,
): DiaEscala {
  if (excecoes[dataAlvo]) return excecoes[dataAlvo];
  return calcularDiaEscala12x36(escalaReferenciaData, dataAlvo);
}

/**
 * Gera a lista de datas (YYYY-MM-DD) em que um funcionário 12x36 era
 * ESPERADO trabalhar dentro de um intervalo, já considerando exceções manuais.
 * Útil para calcular faltas reais (dia esperado de trabalho sem nenhum
 * registro de ponto).
 */
export function getDiasEsperadosTrabalho(
  escalaReferenciaData: string | null | undefined,
  dataInicio: string,
  dataFim: string,
  excecoes: Record<string, "trabalha" | "descansa">,
): string[] {
  const dias: string[] = [];
  let cursor = new Date(dataInicio + "T12:00:00");
  const fim = new Date(dataFim + "T12:00:00");

  while (cursor <= fim) {
    const dataStr = cursor.toISOString().slice(0, 10);
    const dia = getDiaEscalaComExcecoes(escalaReferenciaData, dataStr, excecoes);
    if (dia === "trabalha") dias.push(dataStr);
    cursor.setDate(cursor.getDate() + 1);
  }

  return dias;
}