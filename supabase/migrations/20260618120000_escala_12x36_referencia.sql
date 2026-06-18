ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS escala_referencia_data date,
  ADD COLUMN IF NOT EXISTS carga_horaria_turno numeric DEFAULT 11;

COMMENT ON COLUMN public.employees.escala_referencia_data IS
  'Uma data conhecida em que o funcionário TRABALHOU. Usada como ponto de partida para calcular automaticamente a rotação 1 dia trabalha / 1 dia descansa da escala 12x36.';
COMMENT ON COLUMN public.employees.carga_horaria_turno IS
  'Horas líquidas esperadas por turno (já descontando intervalo). Usado no cálculo de hora extra para quem é 12x36. Padrão 11h.';

CREATE TABLE IF NOT EXISTS public.escala_excecoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  data date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('trabalha', 'descansa')),
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  UNIQUE (employee_id, data)
);

ALTER TABLE public.escala_excecoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY escala_excecoes_allow_all ON public.escala_excecoes
  FOR ALL USING (true) WITH CHECK (true);