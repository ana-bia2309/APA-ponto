ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS destino_horas_excedentes text NOT NULL DEFAULT 'hora_extra'
  CHECK (destino_horas_excedentes IN ('hora_extra', 'banco_horas'));