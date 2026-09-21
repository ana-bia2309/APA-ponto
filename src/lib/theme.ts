/**
 * Cores da marca APA, num lugar só.
 *
 * O app usa a mesma cor azul (#1e40af) e o mesmo gradiente em dezenas de
 * telas diferentes, espalhados como texto solto (`style={{ color: "#1e40af" }}`)
 * em cada arquivo. Isso funciona, mas se um dia quiser ajustar o tom da
 * marca, teria que caçar cada ocorrência manualmente.
 *
 * Com essas constantes, o valor fica definido uma vez só — os arquivos
 * passam a importar `BRAND.blue` em vez de escrever "#1e40af" de novo.
 * Essa migração está sendo feita aos poucos, tela por tela, sem pressa,
 * pra não arriscar mudar a aparência sem querer.
 */
export const BRAND = {
  /** Azul principal da marca APA — textos, ícones, bordas em destaque. */
  blue: "#1e40af",
  /** Ciano usado junto do azul nos gradientes de botão/destaque. */
  cyan: "#0ea5e9",
  /** Gradiente padrão de botões e elementos em destaque (diagonal). */
  gradient: "linear-gradient(135deg, #1e40af, #0ea5e9)",
  /** Mesmo gradiente, na vertical — usado em barras/gráficos. */
  gradientVertical: "linear-gradient(180deg, #1e40af, #0ea5e9)",
} as const;
