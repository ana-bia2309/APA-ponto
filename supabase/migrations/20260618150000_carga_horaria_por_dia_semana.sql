ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS carga_horaria_diaria_padrao numeric NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS carga_horaria_diaria_sexta numeric NOT NULL DEFAULT 8;

COMMENT ON COLUMN public.employees.carga_horaria_diaria_padrao IS
  'Horas líquidas esperadas por dia, de segunda a quinta (já com intervalo descontado). Usado para calcular hora extra de funcionários de escala padrão/diurna.';
COMMENT ON COLUMN public.employees.carga_horaria_diaria_sexta IS
  'Horas líquidas esperadas na sexta-feira (já com intervalo descontado). Geralmente menor que seg-qui, para compensar o sábado livre.';