CREATE OR REPLACE FUNCTION public.get_payslips_by_cpf(p_cpf text)
RETURNS TABLE(
  payslip_id uuid, period_id uuid, year int, month int, status text,
  employee_name text, cargo text, matricula text, departamento text,
  data_admissao date, cpf text,
  total_proventos numeric, total_descontos numeric, liquido numeric,
  base_inss numeric, base_irrf numeric, fgts_mes numeric,
  horas_trabalhadas numeric, horas_extras_50 numeric, horas_extras_100 numeric,
  horas_noturnas numeric, faltas_dias numeric, signature_url text, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_employee_id uuid; v_norm text;
BEGIN
  v_norm := regexp_replace(coalesce(p_cpf,''), '\D','','g');
  SELECT id INTO v_employee_id FROM public.employees
   WHERE active = true AND regexp_replace(coalesce(cpf,''),'\D','','g') = v_norm LIMIT 1;
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'CPF inválido ou colaborador inativo'; END IF;

  RETURN QUERY
  SELECT ps.id, ps.period_id, pp.year, pp.month, pp.status,
         e.name, e.cargo, e.matricula, e.departamento, e.data_admissao, e.cpf,
         ps.total_proventos, ps.total_descontos, ps.liquido,
         ps.base_inss, ps.base_irrf, ps.fgts_mes,
         ps.horas_trabalhadas, ps.horas_extras_50, ps.horas_extras_100,
         ps.horas_noturnas, ps.faltas_dias, ps.signature_url, ps.created_at
  FROM public.payslips ps
  JOIN public.payroll_periods pp ON pp.id = ps.period_id
  JOIN public.employees e ON e.id = ps.employee_id
  WHERE ps.employee_id = v_employee_id
  ORDER BY pp.year DESC, pp.month DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.get_payslip_items_by_cpf(p_cpf text, p_payslip_id uuid)
RETURNS TABLE(id uuid, code text, description text, reference text, kind text, amount numeric, sort_order int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_employee_id uuid; v_owner uuid; v_norm text;
BEGIN
  v_norm := regexp_replace(coalesce(p_cpf,''), '\D','','g');
  SELECT id INTO v_employee_id FROM public.employees
   WHERE active = true AND regexp_replace(coalesce(cpf,''),'\D','','g') = v_norm LIMIT 1;
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'CPF inválido ou colaborador inativo'; END IF;
  SELECT employee_id INTO v_owner FROM public.payslips WHERE id = p_payslip_id;
  IF v_owner IS NULL OR v_owner <> v_employee_id THEN
    RAISE EXCEPTION 'Holerite não pertence a este colaborador'; END IF;

  RETURN QUERY
  SELECT pi.id, pi.code, pi.description, pi.reference, pi.kind, pi.amount, pi.sort_order
  FROM public.payroll_items pi WHERE pi.payslip_id = p_payslip_id ORDER BY pi.sort_order;
END; $$;