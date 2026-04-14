
-- Add fields to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS cargo text DEFAULT '',
  ADD COLUMN IF NOT EXISTS departamento text DEFAULT '',
  ADD COLUMN IF NOT EXISTS matricula text DEFAULT '',
  ADD COLUMN IF NOT EXISTS data_admissao date;

-- Add fields to epis
ALTER TABLE public.epis
  ADD COLUMN IF NOT EXISTS codigo text DEFAULT '',
  ADD COLUMN IF NOT EXISTS ca text DEFAULT '',
  ADD COLUMN IF NOT EXISTS marca text DEFAULT '';

-- Add fields to epi_deliveries
ALTER TABLE public.epi_deliveries
  ADD COLUMN IF NOT EXISTS tamanho text DEFAULT '',
  ADD COLUMN IF NOT EXISTS quantidade integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'Novo',
  ADD COLUMN IF NOT EXISTS finalidade text DEFAULT '',
  ADD COLUMN IF NOT EXISTS empresa text DEFAULT '',
  ADD COLUMN IF NOT EXISTS setor text DEFAULT '',
  ADD COLUMN IF NOT EXISTS local_entrega text DEFAULT '';
