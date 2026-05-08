
# Módulo de Folha de Pagamento e Contracheque — APA Ponto

Esse é um módulo grande. Proponho entregar em **3 fases** para garantir qualidade, ao invés de tudo de uma vez (o que comprometeria precisão contábil e testes).

---

## Visão Geral

Um novo módulo no Painel Admin chamado **"Folha de Pagamento"**, com submenus:
- **Configurações Salariais** (cadastro por funcionário)
- **Fechamento de Competência** (mensal)
- **Holerites** (geração e histórico)
- **Relatórios Financeiros**

Integração direta com `time_records`, `absence_justifications` e banco de horas calculado a partir da jornada.

---

## Fase 1 — Fundação (entrega imediata)

### Banco de dados (novas tabelas)
- `payroll_settings` — configuração salarial por funcionário (salário base, carga horária, vale transporte, vale alimentação, dependentes IRRF, % comissão, hora-extra habilitada)
- `payroll_periods` — competências mensais (mês/ano, status: aberto/fechado, data fechamento, admin responsável)
- `payslips` — holerite consolidado por funcionário/competência (totais + JSON com itens detalhados)
- `payslip_items` — linhas do holerite (tipo: provento/desconto, descrição, referência, valor — usando `numeric(14,2)` para precisão decimal)
- `payroll_custom_items` — adicionais e descontos personalizados recorrentes por funcionário

Todas com RLS restrita a admin (`is_admin(auth.uid())`).

### Engine de cálculo (Edge Function `calculate-payroll`)
Função server-side em Deno que, dado `employee_id` e competência:
1. Busca `payroll_settings` do funcionário
2. Lê `time_records` do mês → calcula horas trabalhadas, extras 50%/100%, adicional noturno (22h–5h), atrasos, faltas
3. Lê `absence_justifications` aprovadas → desconta ou abona
4. Calcula DSR proporcional
5. Aplica tabelas oficiais 2026 de **INSS** (faixas progressivas) e **IRRF** (com dedução de dependentes)
6. Calcula FGTS (8% — informativo, não desconta)
7. Aplica vale-transporte (limite 6%), vale-alimentação, bonificações, comissões
8. Aplica `payroll_custom_items` ativos
9. Persiste em `payslips` + `payslip_items`

Toda matemática usa **strings decimais + `BigDecimal` polyfill** (lib `decimal.js`) — nunca `number` JS.

### UI Admin
- Aba **Configurações Salariais**: tabela de funcionários com edição inline dos parâmetros salariais
- Aba **Fechamento**: seletor de competência, botão "Calcular folha do mês", lista de holerites gerados com totais
- Aba **Holerites**: visualização individual (preview HTML do contracheque)

---

## Fase 2 — Holerite PDF + Distribuição

- Geração de **PDF profissional** (jsPDF) com layout padrão CLT: cabeçalho da empresa, dados do funcionário, tabela de proventos/descontos, totalizadores, FGTS do mês, base INSS/IRRF, assinatura
- **Assinatura digital** do funcionário (canvas, reaproveitando `SignaturePad` já existente) — colaborador assina ao visualizar pelo app
- **Envio por email** via Lovable Emails (após configurar domínio)
- **Envio por WhatsApp** — exige conector externo (ex.: Twilio WhatsApp Business). Pergunto antes de configurar.

### Tela do Funcionário
Nova rota `/holerite` (acesso via CPF, igual ponto) onde colaborador vê histórico, baixa PDF e assina.

---

## Fase 3 — Relatórios e Banco de Horas Avançado

- Banco de horas com saldo acumulado mensal (compensação 6 meses CLT)
- Relatórios: total folha por mês, custo por departamento, evolução salarial, encargos
- Exportação CSV/Excel para contabilidade
- Integração com SEFIP/eSocial (apenas exportação de layout — não envio)

---

## Detalhes Técnicos

### Precisão Financeira
```ts
import Decimal from "decimal.js";
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });
const inss = new Decimal(salario).mul("0.075"); // nunca number puro
```

### Tabelas oficiais embutidas
INSS 2026 e IRRF 2026 versionadas em `src/lib/payroll/tables.ts` para fácil atualização anual.

### Estrutura de pastas
```
src/
  components/admin/payroll/
    PayrollSettingsTab.tsx
    PayrollClosingTab.tsx
    PayslipsTab.tsx
    PayslipPreview.tsx
  lib/payroll/
    calculator.ts      // pure functions, testáveis
    tables.ts          // INSS/IRRF 2026
    decimal.ts         // wrapper Decimal.js
supabase/functions/
  calculate-payroll/index.ts
```

---

## Perguntas antes de começar

Preciso confirmar 3 pontos para não retrabalhar:
