
-- Configurações salariais por funcionário
CREATE TABLE public.payroll_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  salario_base numeric(14,2) NOT NULL DEFAULT 0,
  carga_horaria_mensal numeric(8,2) NOT NULL DEFAULT 220,
  vale_transporte numeric(14,2) NOT NULL DEFAULT 0,
  vale_alimentacao numeric(14,2) NOT NULL DEFAULT 0,
  dependentes_irrf integer NOT NULL DEFAULT 0,
  percentual_comissao numeric(6,2) NOT NULL DEFAULT 0,
  hora_extra_habilitada boolean NOT NULL DEFAULT true,
  adicional_noturno_percent numeric(6,2) NOT NULL DEFAULT 20,
  desconta_vt boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_payroll_settings_updated
BEFORE UPDATE ON public.payroll_settings
FOR EACH ROW EXECUTE FUNCTION public.update_profiles_updated_at();

-- Competências (mês/ano)
CREATE TABLE public.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','fechado')),
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);

-- Holerite consolidado
CREATE TABLE public.payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  total_proventos numeric(14,2) NOT NULL DEFAULT 0,
  total_descontos numeric(14,2) NOT NULL DEFAULT 0,
  liquido numeric(14,2) NOT NULL DEFAULT 0,
  base_inss numeric(14,2) NOT NULL DEFAULT 0,
  base_irrf numeric(14,2) NOT NULL DEFAULT 0,
  fgts_mes numeric(14,2) NOT NULL DEFAULT 0,
  horas_trabalhadas numeric(8,2) NOT NULL DEFAULT 0,
  horas_extras_50 numeric(8,2) NOT NULL DEFAULT 0,
  horas_extras_100 numeric(8,2) NOT NULL DEFAULT 0,
  horas_noturnas numeric(8,2) NOT NULL DEFAULT 0,
  faltas_dias numeric(6,2) NOT NULL DEFAULT 0,
  atrasos_minutos integer NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_url text,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, employee_id)
);

CREATE TRIGGER trg_payslips_updated
BEFORE UPDATE ON public.payslips
FOR EACH ROW EXECUTE FUNCTION public.update_profiles_updated_at();

-- Itens detalhados do holerite
CREATE TABLE public.payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_id uuid NOT NULL REFERENCES public.payslips(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('provento','desconto','informativo')),
  code text NOT NULL,
  description text NOT NULL,
  reference text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payroll_items_payslip ON public.payroll_items(payslip_id);

-- Adicionais/descontos recorrentes por funcionário
CREATE TABLE public.payroll_custom_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('provento','desconto')),
  description text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payroll_custom_items_emp ON public.payroll_custom_items(employee_id);

-- RLS: somente admins
ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_custom_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage payroll_settings" ON public.payroll_settings
FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage payroll_periods" ON public.payroll_periods
FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage payslips" ON public.payslips
FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage payroll_items" ON public.payroll_items
FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage payroll_custom_items" ON public.payroll_custom_items
FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
