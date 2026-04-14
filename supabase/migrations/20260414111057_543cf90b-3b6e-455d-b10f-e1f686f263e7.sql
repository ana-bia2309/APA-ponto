
-- Update get_next_record_step_by_cpf to handle overnight shifts
CREATE OR REPLACE FUNCTION public.get_next_record_step_by_cpf(p_cpf text)
 RETURNS TABLE(employee_id uuid, name text, cpf text, shift text, jornada text, records_today jsonb, next_step text, day_complete boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_yesterday_start timestamptz;
  v_has_open_journey boolean := false;
  v_journey_records jsonb;
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
  v_yesterday_start := v_today_start - interval '1 day';

  -- First check: is there an open journey from yesterday (started but no 'saida')?
  -- Look at records from yesterday to now
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'record_type', tr.record_type,
    'recorded_at', tr.recorded_at
  ) ORDER BY tr.recorded_at ASC), '[]'::jsonb)
  INTO v_journey_records
  FROM public.time_records tr
  WHERE tr.employee_id = v_employee_id
    AND tr.recorded_at >= v_yesterday_start
    AND tr.recorded_at <= v_today_end;

  -- Check if there's an open journey: has 'entrada' from yesterday but no 'saida' yet
  IF EXISTS (
    SELECT 1 FROM public.time_records tr
    WHERE tr.employee_id = v_employee_id
      AND tr.record_type = 'entrada'
      AND tr.recorded_at >= v_yesterday_start
      AND tr.recorded_at < v_today_start
  ) AND NOT EXISTS (
    SELECT 1 FROM public.time_records tr
    WHERE tr.employee_id = v_employee_id
      AND tr.record_type = 'saida'
      AND tr.recorded_at >= v_yesterday_start
      AND tr.recorded_at <= v_today_end
  ) THEN
    -- Open overnight journey found - use all records from yesterday to now
    v_has_open_journey := true;
    v_records := v_journey_records;
  ELSE
    -- No open overnight journey - use only today's records
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'record_type', tr.record_type,
      'recorded_at', tr.recorded_at
    ) ORDER BY tr.recorded_at ASC), '[]'::jsonb)
    INTO v_records
    FROM public.time_records tr
    WHERE tr.employee_id = v_employee_id
      AND tr.recorded_at >= v_today_start
      AND tr.recorded_at <= v_today_end;
  END IF;

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
$function$;

-- Update prevent_duplicate_daily_punch to handle overnight journeys
CREATE OR REPLACE FUNCTION public.prevent_duplicate_daily_punch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_day date;
  v_yesterday date;
  v_exists boolean;
  v_has_open_overnight boolean;
BEGIN
  v_day := (NEW.recorded_at AT TIME ZONE 'America/Sao_Paulo')::date;
  v_yesterday := v_day - 1;

  -- Check if there's an open overnight journey (entrada yesterday, no saida yet)
  SELECT EXISTS (
    SELECT 1 FROM public.time_records
    WHERE employee_id = NEW.employee_id
      AND record_type = 'entrada'
      AND (recorded_at AT TIME ZONE 'America/Sao_Paulo')::date = v_yesterday
  ) AND NOT EXISTS (
    SELECT 1 FROM public.time_records
    WHERE employee_id = NEW.employee_id
      AND record_type = 'saida'
      AND (recorded_at AT TIME ZONE 'America/Sao_Paulo')::date IN (v_yesterday, v_day)
  ) INTO v_has_open_overnight;

  IF v_has_open_overnight THEN
    -- For overnight journeys, check duplicates across both days
    SELECT EXISTS (
      SELECT 1 FROM public.time_records
      WHERE employee_id = NEW.employee_id
        AND record_type = NEW.record_type
        AND (recorded_at AT TIME ZONE 'America/Sao_Paulo')::date IN (v_yesterday, v_day)
    ) INTO v_exists;
  ELSE
    -- Normal same-day duplicate check
    SELECT EXISTS (
      SELECT 1 FROM public.time_records
      WHERE employee_id = NEW.employee_id
        AND record_type = NEW.record_type
        AND (recorded_at AT TIME ZONE 'America/Sao_Paulo')::date = v_day
    ) INTO v_exists;
  END IF;

  IF v_exists THEN
    RAISE EXCEPTION 'Registro "%" já existe para este colaborador nesta jornada.', NEW.record_type;
  END IF;
  
  RETURN NEW;
END;
$function$;
