
Objetivo: corrigir a causa real do erro “CPF inválido ou colaborador inativo” no registro de ponto, sem recriar o app nem mudar o layout, deixando a validação estável para colaboradores atuais e futuros.

1. Diagnóstico confirmado
- O fluxo crítico está em `src/components/TimeClock.tsx`.
- Hoje a validação depende de vários estados separados (`pendingEmployee`, `selectedEmployee`, `validatedEmployee`, `cpfInput`, `validatedCpf`), o que abre espaço para estado antigo, esvaziado ou inconsistente.
- O insert final ainda depende de `validatedCpf` no cliente. Se esse estado estiver vazio, desatualizado ou divergente do colaborador validado, a RPC `insert_time_record_with_cpf` falha com exatamente a mensagem que você relatou.
- A aba de debug atual mostra apenas inserts já concluídos; ela não mostra o motivo do bloqueio antes do insert.

2. Correção principal que vou aplicar
- Transformar a validação em um fluxo com fonte única de verdade:
  - guardar um “contexto validado” único após confirmar CPF:
    - `employee_id`
    - `name`
    - `cpf_normalized`
    - `active`
    - `validated_at`
- Parar de depender de `selectedEmployee` e `validatedCpf` soltos para o insert final.
- No momento de registrar o ponto:
  - usar somente o contexto validado mais recente
  - revalidar consistência antes do insert
  - bloquear apenas se houver inconsistência real

3. Endurecimento da validação no cliente
- Normalizar CPF sempre com a mesma função central:
  - remover pontos, traços e qualquer caractere não numérico
- Usar essa função em:
  - input de CPF
  - validação online
  - validação offline
  - punch manual
  - justificativas
  - sincronização offline
- Ao validar CPF:
  - buscar colaborador ativo pelo CPF
  - comparar o `id` retornado com o colaborador escolhido visualmente
  - salvar esse resultado em um único estado confiável
- Ao trocar colaborador/equipe:
  - limpar integralmente o contexto validado antigo para evitar reaproveitamento indevido

4. Correção mais segura no backend
- Ajustar a RPC de gravação para validar também o colaborador esperado, e não só o CPF.
- Em vez de confiar apenas em `p_cpf`, a gravação deve confirmar:
  - CPF normalizado encontrado
  - colaborador ativo
  - `employee_id` encontrado = `employee_id` esperado do fluxo atual
- Se houver divergência, retornar erro explícito e rastreável.
- Isso garante estabilidade também para colaboradores futuros, sem depender de comportamento do front.

5. Compatibilidade com colaboradores futuros
- Garantir que novos colaboradores funcionem automaticamente se tiverem:
  - CPF preenchido
  - `active = true`
- A leitura da lista continuará vindo do banco, mas a validação final será baseada na normalização de CPF + checagem do `id` real encontrado.
- Também vou revisar o cadastro/admin para garantir que CPF salvo com máscara ou sem máscara continue compatível.

6. Offline sem quebrar o online
- Validar offline usando o cache já existente, mas com a mesma regra:
  - CPF normalizado
  - `id` do colaborador selecionado deve bater com o `id` encontrado no cache
- Salvar na fila offline o contexto validado correto:
  - `employee_id`
  - `cpf_normalized`
  - `record_type`
  - timestamps
- Na sincronização, revalidar antes de inserir para evitar enviar ponto para pessoa errada.

7. Logs temporários de diagnóstico
- Melhorar os logs temporários para mostrar, durante os testes:
  - CPF digitado
  - CPF normalizado
  - colaborador selecionado visualmente
  - colaborador encontrado no banco/cache
  - `active` retornado
  - `employee_id` esperado
  - `employee_id` efetivamente enviado
  - resultado do insert
  - motivo exato do bloqueio
- Esses logs devem aparecer de forma controlada no painel admin/debug e no console, sem expor CPF completo.

8. Arquivos que precisam ser ajustados
- `src/components/TimeClock.tsx`
  - consolidar estado de validação
  - corrigir fluxo de insert
  - reforçar limpeza de estado antigo
  - unificar normalização
  - melhorar logs
- `src/components/ManualPunch.tsx`
  - usar a mesma origem confiável de CPF/contexto validado
- `src/components/AbsenceJustification.tsx`
  - alinhar normalização e contexto validado
- `src/components/admin/DebugLogsTab.tsx`
  - ampliar debug temporário para falhas de validação/insert
- Migração/backend
  - ajustar ou substituir a RPC de insert para validar `employee_id` esperado + CPF normalizado + `active`

9. Validação final da correção
- Testar com:
  - colaboradores atuais
  - colaborador recém-cadastrado
  - CPF com máscara
  - CPF sem máscara
  - online
  - offline
  - sincronização posterior
- Critério de aceite:
  - colaborador ativo e válido nunca recebe o erro indevidamente
  - erro só aparece quando CPF realmente não corresponde ou colaborador realmente está inativo
  - sucesso só aparece após confirmação real de gravação

10. Resultado esperado
- Registro de ponto estável até o dia 31
- Sem bloqueio falso para colaboradores válidos
- Sem depender de estado antigo da interface
- Compatível com colaboradores novos sem ajuste manual adicional

Detalhes técnicos
- Hoje o maior risco está no acoplamento entre UI e persistência:
  - `verifyCpf()` valida uma coisa
  - `handlePunchWithPhoto()` grava usando outro conjunto de estados
- A correção vai centralizar a validação em um único objeto confiável e endurecer a RPC para impedir inconsistência entre:
  - colaborador exibido
  - CPF informado
  - `employee_id` inserido
