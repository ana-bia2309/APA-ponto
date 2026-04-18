-- ============================================================
-- 1) RPC: próximo passo da JORNADA (não do dia civil)
-- ============================================================
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
  SELECT max(recorded_at) INTO v_last_entrada_at
  FROM public.time_records
  WHERE employee_id = v_employee_id
    AND record_type = 'entrada'
    AND recorded_at >= now() - interval '36 hours';

  -- Última SAÍDA registrada
  SELECT max(recorded_at) INTO v_last_saida_at
  FROM public.time_records
  WHERE employee_id = v_employee_id
    AND record_type = 'saida'
    AND recorded_at >= now() - interval '36 hours';

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
      AND tr.recorded_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
      AND tr.recorded_at <  (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 day') AT TIME ZONE 'America/Sao_Paulo';
  END IF;

  -- Último passo da jornada aberta (se existir), senão NULL
  SELECT r->>'record_type' INTO v_last_step
  FROM jsonb_array_elements(v_records) AS r
  WHERE v_journey_start IS NOT NULL
  ORDER BY (r->>'recorded_at')::timestamptz DESC
  LIMIT 1;

  -- Sequência DETERMINÍSTICA — sem inferência
  IF v_punch_mode = 'simple' THEN
    CASE v_last_step
      WHEN 'entrada' THEN v_next := 'saida';
      WHEN 'saida'   THEN v_next := NULL; v_done := true;
      ELSE                v_next := 'entrada';
    END CASE;
  ELSE
    CASE v_last_step
      WHEN 'entrada'   THEN v_next := 'intervalo';
      WHEN 'intervalo' THEN v_next := 'retorno';
      WHEN 'retorno'   THEN v_next := 'saida';
      WHEN 'saida'     THEN v_next := NULL; v_done := true;
      ELSE                  v_next := 'entrada';
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

-- ============================================================
-- 2) RPC de inserção: BLOQUEIA qualquer passo fora da ordem
-- ============================================================
CREATE OR REPLACE FUNCTION public.insert_time_record_with_cpf(
  p_cpf text,
  p_record_type text,
  p_recorded_at timestamp with time zone,
  p_latitude double precision DEFAULT NULL::double precision,
  p_longitude double precision DEFAULT NULL::double precision,
  p_mode text DEFAULT 'online'::text,
  p_sync_status text DEFAULT 'synced'::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_employee_id uuid;
  v_normalized_cpf text;
  v_new_id uuid;
  v_punch_mode text;
  v_last_entrada_at timestamptz;
  v_last_saida_at timestamptz;
  v_journey_start timestamptz;
  v_last_step text;
  v_expected_next text;
BEGIN
  v_normalized_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');

  IF v_normalized_cpf = '' THEN
    RAISE EXCEPTION 'CPF não informado';
  END IF;

  SELECT id, punch_mode INTO v_employee_id, v_punch_mode
  FROM public.employees
  WHERE active = true
    AND regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_normalized_cpf;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'CPF inválido ou colaborador inativo (cpf: %)', left(v_normalized_cpf, 3) || '***';
  END IF;

  IF p_record_type NOT IN ('entrada','intervalo','retorno','saida') THEN
    RAISE EXCEPTION 'Tipo de registro inválido: %', p_record_type;
  END IF;

  -- Calcula jornada aberta atual (mesma regra da RPC de próximo passo)
  SELECT max(recorded_at) INTO v_last_entrada_at
  FROM public.time_records
  WHERE employee_id = v_employee_id
    AND record_type = 'entrada'
    AND recorded_at >= now() - interval '36 hours';

  SELECT max(recorded_at) INTO v_last_saida_at
  FROM public.time_records
  WHERE employee_id = v_employee_id
    AND record_type = 'saida'
    AND recorded_at >= now() - interval '36 hours';

  IF v_last_entrada_at IS NOT NULL
     AND (v_last_saida_at IS NULL OR v_last_saida_at < v_last_entrada_at) THEN
    v_journey_start := v_last_entrada_at;
  ELSE
    v_journey_start := NULL;
  END IF;

  -- Último passo da jornada aberta
  IF v_journey_start IS NOT NULL THEN
    SELECT record_type INTO v_last_step
    FROM public.time_records
    WHERE employee_id = v_employee_id
      AND recorded_at >= v_journey_start
    ORDER BY recorded_at DESC
    LIMIT 1;
  ELSE
    v_last_step := NULL;
  END IF;

  -- Próximo passo esperado (sequência determinística)
  IF v_punch_mode = 'simple' THEN
    v_expected_next := CASE v_last_step
      WHEN 'entrada' THEN 'saida'
      WHEN 'saida'   THEN 'entrada'
      ELSE 'entrada'
    END;
  ELSE
    v_expected_next := CASE v_last_step
      WHEN 'entrada'   THEN 'intervalo'
      WHEN 'intervalo' THEN 'retorno'
      WHEN 'retorno'   THEN 'saida'
      WHEN 'saida'     THEN 'entrada'
      ELSE 'entrada'
    END;
  END IF;

  -- BLOQUEIO duro: registro só pode ser exatamente o próximo esperado
  IF p_record_type <> v_expected_next THEN
    RAISE EXCEPTION 'Sequência inválida de jornada. Último evento: "%". Próximo permitido: "%". Recebido: "%".',
      coalesce(v_last_step, 'nenhum'), v_expected_next, p_record_type
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.time_records (employee_id, record_type, recorded_at, latitude, longitude, mode, sync_status)
  VALUES (v_employee_id, p_record_type, p_recorded_at, p_latitude, p_longitude, p_mode, p_sync_status)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$;