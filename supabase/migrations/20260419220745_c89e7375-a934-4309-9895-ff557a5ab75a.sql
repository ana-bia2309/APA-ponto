-- Fix: ambiguidade de coluna "employee_id" em get_next_record_step_by_cpf e insert_time_record_with_cpf
-- causada pela variável local v_employee_id ser confrontada com a coluna employee_id sem alias.

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
  v_last_entrada_at timestamptz;
  v_last_saida_at timestamptz;
  v_journey_start timestamptz;
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

  -- Última ENTRADA registrada (até 36h atrás cobre 12x36 com folga)
  SELECT max(tr.recorded_at) INTO v_last_entrada_at
  FROM public.time_records tr
  WHERE tr.employee_id = v_employee_id
    AND tr.record_type = 'entrada'
    AND tr.recorded_at >= now() - interval '36 hours';

  -- Última SAÍDA registrada
  SELECT max(tr.recorded_at) INTO v_last_saida_at
  FROM public.time_records tr
  WHERE tr.employee_id = v_employee_id
    AND tr.record_type = 'saida'
    AND tr.recorded_at >= now() - interval '36 hours';

  -- Jornada está aberta se existe entrada e (não existe saída OR saída é anterior à entrada)
  IF v_last_entrada_at IS NOT NULL
     AND (v_last_saida_at IS NULL OR v_last_saida_at < v_last_entrada_at) THEN
    v_journey_start := v_last_entrada_at;
  ELSE
    v_journey_start := NULL;
  END IF;

  IF v_journey_start IS NOT NULL THEN
    -- Coleta TODOS os registros da jornada aberta (de entrada até agora), sem cortar por dia
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'record_type', tr.record_type,
      'recorded_at', tr.recorded_at
    ) ORDER BY tr.recorded_at ASC), '[]'::jsonb)
    INTO v_records
    FROM public.time_records tr
    WHERE tr.employee_id = v_employee_id
      AND tr.recorded_at >= v_journey_start;
  ELSE
    -- Sem jornada aberta: mostra os registros do dia civil (apenas para histórico de UI)
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'record_type', tr.record_type,
      'recorded_at', tr.recorded_at
    ) ORDER BY tr.recorded_at ASC), '[]'::jsonb)
    INTO v_records
    FROM public.time_records tr
    WHERE tr.employee_id = v_employee_id
      AND tr.recorded_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  END IF;

  -- Última etapa da jornada aberta (ou nada se não há jornada aberta)
  IF v_journey_start IS NOT NULL THEN
    SELECT tr.record_type INTO v_last_step
    FROM public.time_records tr
    WHERE tr.employee_id = v_employee_id
      AND tr.recorded_at >= v_journey_start
    ORDER BY tr.recorded_at DESC
    LIMIT 1;
  ELSE
    v_last_step := NULL;
  END IF;

  -- Máquina de estados determinística
  IF v_punch_mode = 'simple' THEN
    IF v_last_step IS NULL THEN
      v_next := 'entrada';
    ELSIF v_last_step = 'entrada' THEN
      v_next := 'saida';
    ELSE
      v_next := 'entrada';
      v_done := true;
    END IF;
  ELSE
    -- modo completo: entrada -> intervalo -> retorno -> saida
    IF v_last_step IS NULL THEN
      v_next := 'entrada';
    ELSIF v_last_step = 'entrada' THEN
      v_next := 'intervalo';
    ELSIF v_last_step = 'intervalo' THEN
      v_next := 'retorno';
    ELSIF v_last_step = 'retorno' THEN
      v_next := 'saida';
    ELSIF v_last_step = 'saida' THEN
      v_next := 'entrada';
      v_done := true;
    ELSE
      v_next := 'entrada';
    END IF;
  END IF;

  RETURN QUERY SELECT v_employee_id, v_name, v_cpf, v_shift, v_punch_mode, v_records, v_next, v_done;
END;
$function$;


CREATE OR REPLACE FUNCTION public.insert_time_record_with_cpf(
  p_cpf text,
  p_record_type text,
  p_recorded_at timestamptz,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_mode text DEFAULT 'online',
  p_sync_status text DEFAULT 'synced'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_employee_id uuid;
  v_punch_mode text;
  v_normalized_cpf text;
  v_last_step text;
  v_last_entrada_at timestamptz;
  v_last_saida_at timestamptz;
  v_journey_start timestamptz;
  v_expected text;
  v_new_id uuid;
BEGIN
  v_normalized_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');

  SELECT e.id, e.punch_mode
    INTO v_employee_id, v_punch_mode
  FROM public.employees e
  WHERE e.active = true
    AND regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = v_normalized_cpf
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'CPF inválido ou colaborador inativo';
  END IF;

  -- Determina se há jornada aberta (mesma lógica da get_next_record_step_by_cpf)
  SELECT max(tr.recorded_at) INTO v_last_entrada_at
  FROM public.time_records tr
  WHERE tr.employee_id = v_employee_id
    AND tr.record_type = 'entrada'
    AND tr.recorded_at >= now() - interval '36 hours';

  SELECT max(tr.recorded_at) INTO v_last_saida_at
  FROM public.time_records tr
  WHERE tr.employee_id = v_employee_id
    AND tr.record_type = 'saida'
    AND tr.recorded_at >= now() - interval '36 hours';

  IF v_last_entrada_at IS NOT NULL
     AND (v_last_saida_at IS NULL OR v_last_saida_at < v_last_entrada_at) THEN
    v_journey_start := v_last_entrada_at;
  ELSE
    v_journey_start := NULL;
  END IF;

  IF v_journey_start IS NOT NULL THEN
    SELECT tr.record_type INTO v_last_step
    FROM public.time_records tr
    WHERE tr.employee_id = v_employee_id
      AND tr.recorded_at >= v_journey_start
    ORDER BY tr.recorded_at DESC
    LIMIT 1;
  ELSE
    v_last_step := NULL;
  END IF;

  -- Calcula o próximo passo esperado
  IF v_punch_mode = 'simple' THEN
    IF v_last_step IS NULL THEN
      v_expected := 'entrada';
    ELSIF v_last_step = 'entrada' THEN
      v_expected := 'saida';
    ELSE
      v_expected := 'entrada';
    END IF;
  ELSE
    IF v_last_step IS NULL THEN
      v_expected := 'entrada';
    ELSIF v_last_step = 'entrada' THEN
      v_expected := 'intervalo';
    ELSIF v_last_step = 'intervalo' THEN
      v_expected := 'retorno';
    ELSIF v_last_step = 'retorno' THEN
      v_expected := 'saida';
    ELSIF v_last_step = 'saida' THEN
      v_expected := 'entrada';
    ELSE
      v_expected := 'entrada';
    END IF;
  END IF;

  -- Modo manual ignora a validação de sequência (correção administrativa)
  IF p_mode <> 'manual' AND p_record_type <> v_expected THEN
    RAISE EXCEPTION 'Sequência de jornada inválida: esperado "%", recebido "%"', v_expected, p_record_type
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.time_records (
    employee_id, record_type, recorded_at, latitude, longitude, mode, sync_status
  ) VALUES (
    v_employee_id, p_record_type, p_recorded_at, p_latitude, p_longitude, p_mode, p_sync_status
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$;