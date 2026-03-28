CREATE OR REPLACE FUNCTION public.get_next_record_step_by_cpf(p_cpf text)
RETURNS TABLE(
  employee_id uuid,
  name text,
  cpf text,
  shift text,
  jornada text,
  records_today jsonb,
  next_step text,
  day_complete boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_employee_id uuid;
  v_name text;
  v_cpf text;
  v_shift text;
  v_punch_mode text;
  v_normalized_cpf text;
  v_records jsonb;
  v_last_step text;
  v_next text;
  v_done boolean := false;
  v_today_start timestamptz;
  v_today_end timestamptz;
BEGIN
  v_normalized_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');

  SELECT e.id, e.name, e.cpf, e.shift, e.punch_mode
  INTO v_employee_id, v_name, v_cpf, v_shift, v_punch_mode
  FROM public.employees e
  WHERE e.active = true
    AND regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = v_normalized_cpf
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'CPF inválido ou colaborador inativo';
  END IF;

  v_today_start := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_today_end := v_today_start + interval '1 day' - interval '1 millisecond';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'record_type', tr.record_type,
    'recorded_at', tr.recorded_at
  ) ORDER BY tr.recorded_at ASC), '[]'::jsonb)
  INTO v_records
  FROM public.time_records tr
  WHERE tr.employee_id = v_employee_id
    AND tr.recorded_at >= v_today_start
    AND tr.recorded_at <= v_today_end;

  -- Determine last step from records
  SELECT r->>'record_type' INTO v_last_step
  FROM jsonb_array_elements(v_records) AS r
  ORDER BY (r->>'recorded_at')::timestamptz DESC
  LIMIT 1;

  -- Calculate next step based on punch_mode
  IF v_punch_mode = 'simple' THEN
    CASE v_last_step
      WHEN 'entrada' THEN v_next := 'saida';
      WHEN 'saida' THEN v_next := NULL; v_done := true;
      ELSE v_next := 'entrada';
    END CASE;
  ELSE
    CASE v_last_step
      WHEN 'entrada' THEN v_next := 'intervalo';
      WHEN 'intervalo' THEN v_next := 'retorno';
      WHEN 'retorno' THEN v_next := 'saida';
      WHEN 'saida' THEN v_next := NULL; v_done := true;
      ELSE v_next := 'entrada';
    END CASE;
  END IF;

  RETURN QUERY SELECT
    v_employee_id,
    v_name,
    v_cpf,
    v_shift,
    v_punch_mode,
    v_records,
    v_next,
    v_done;
END;
$$;