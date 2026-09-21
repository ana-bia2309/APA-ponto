import { toast } from "sonner";

/**
 * Ponte segura para chamadas do Supabase (from().select/insert/update/delete
 * ou .rpc()) que já checa o campo `error` sozinha.
 *
 * O motivo de existir: o supabase-js NÃO lança exceção quando uma consulta
 * falha — ele só devolve `{ data, error }`. Se o código esquecer de checar
 * `error`, a tela mostra "sucesso" mesmo quando nada foi salvo. Esse foi,
 * disparado, o tipo de bug mais repetido encontrado na auditoria do
 * APA Ponto (importação de banco de horas, ativar/desativar usuário,
 * fechamento de ponto em lote, avisos, etc.) — em todos os casos o erro
 * real do banco existia, só não estava sendo lido.
 *
 * Uso:
 *   const membros = await safeQuery(
 *     supabase.from("employees").select("*").eq("active", true),
 *     { errorMessage: "Erro ao carregar funcionários" }
 *   );
 *   if (membros === null) return; // já mostrou o toast de erro sozinho
 *
 * Ou, quando o call-site quer decidir o que fazer com o erro:
 *   const { data, error } = await safeQueryRaw(
 *     supabase.from("employees").update({ active: false }).eq("id", id)
 *   );
 *   if (error) { ...tratamento específico... }
 */

export interface SafeQueryOptions {
  /** Mensagem mostrada em toast.error quando a consulta falha. */
  errorMessage?: string;
  /** Mensagem mostrada em toast.success quando a consulta dá certo. */
  successMessage?: string;
  /** Se true (padrão), mostra toast.error automaticamente em caso de erro. */
  showErrorToast?: boolean;
}

interface SupabaseLikeResult<T> {
  data: T | null;
  error: { message?: string } | null;
}

/**
 * Aguarda a consulta, garante que o erro é checado, e devolve só os dados.
 * Retorna `null` se der erro (depois de já ter avisado com toast, por
 * padrão) — o chamador só precisa checar `if (resultado === null) return;`.
 */
export async function safeQuery<T>(
  queryPromise: PromiseLike<SupabaseLikeResult<T>>,
  options: SafeQueryOptions = {}
): Promise<T | null> {
  const { errorMessage = "Ocorreu um erro. Tente novamente.", successMessage, showErrorToast = true } = options;

  try {
    const { data, error } = await queryPromise;

    if (error) {
      console.error("[safeQuery] erro do Supabase:", error);
      if (showErrorToast) {
        toast.error(`${errorMessage}${error.message ? `: ${error.message}` : ""}`);
      }
      return null;
    }

    if (successMessage) {
      toast.success(successMessage);
    }

    return data;
  } catch (err: any) {
    console.error("[safeQuery] exceção inesperada:", err);
    if (showErrorToast) {
      toast.error(`${errorMessage}${err?.message ? `: ${err.message}` : ""}`);
    }
    return null;
  }
}

/**
 * Igual ao safeQuery, mas devolve { data, error } em vez de decidir sozinho
 * o que fazer com o erro — use quando o chamador precisa de uma lógica
 * própria (por exemplo, mensagens de erro diferentes por código de erro).
 * Ainda garante, pelo tipo de retorno, que quem chamar não esqueça de olhar
 * o campo error.
 */
export async function safeQueryRaw<T>(
  queryPromise: PromiseLike<SupabaseLikeResult<T>>
): Promise<SupabaseLikeResult<T>> {
  try {
    return await queryPromise;
  } catch (err: any) {
    console.error("[safeQueryRaw] exceção inesperada:", err);
    return { data: null, error: { message: err?.message || "Erro inesperado" } };
  }
}
