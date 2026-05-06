CREATE OR REPLACE FUNCTION public.prevent_duplicate_daily_punch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_last_entrada_at timestamptz;
  v_last_saida_at timestamptz;
  v_journey_start timestamptz;
  v_exists boolean;
BEGIN
  -- Última entrada nas últimas 36h (cobre 12x36 atravessando meia-noite)
  SELECT max(tr.recorded_at) INTO v_last_entrada_at
  FROM public.time_records tr
  WHERE tr.employee_id = NEW.employee_id
    AND tr.record_type = 'entrada'
    AND tr.recorded_at >= NEW.recorded_at - interval '36 hours'
    AND tr.recorded_at <= NEW.recorded_at;

  SELECT max(tr.recorded_at) INTO v_last_saida_at
  FROM public.time_records tr
  WHERE tr.employee_id = NEW.employee_id
    AND tr.record_type = 'saida'
    AND tr.recorded_at >= NEW.recorded_at - interval '36 hours'
    AND tr.recorded_at <= NEW.recorded_at;

  IF v_last_entrada_at IS NOT NULL
     AND (v_last_saida_at IS NULL OR v_last_saida_at < v_last_entrada_at) THEN
    v_journey_start := v_last_entrada_at;
  ELSE
    v_journey_start := NULL;
  END IF;

  IF NEW.record_type = 'entrada' THEN
    -- Não permitir duas entradas na mesma jornada aberta
    IF v_journey_start IS NOT NULL AND v_journey_start <> NEW.recorded_at THEN
      RAISE EXCEPTION 'Já existe uma jornada aberta para este colaborador. Finalize-a antes de registrar nova entrada.';
    END IF;
    RETURN NEW;
  END IF;

  -- Para intervalo/retorno/saida exige jornada aberta
  IF v_journey_start IS NULL THEN
    RAISE EXCEPTION 'Não há jornada aberta para registrar "%". Registre a entrada primeiro.', NEW.record_type;
  END IF;

  -- Bloqueia duplicidade somente dentro da jornada aberta
  SELECT EXISTS (
    SELECT 1 FROM public.time_records tr
    WHERE tr.employee_id = NEW.employee_id
      AND tr.record_type = NEW.record_type
      AND tr.recorded_at >= v_journey_start
      AND tr.recorded_at <= NEW.recorded_at + interval '1 second'
      AND (TG_OP <> 'UPDATE' OR tr.id <> NEW.id)
  ) INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'Registro "%" já existe para esta jornada.', NEW.record_type;
  END IF;

  RETURN NEW;
END;
$function$;

-- Limpa o registro órfão do Rayllan (intervalo manual antes da entrada de hoje)
DELETE FROM public.time_records
WHERE id IN (
  SELECT tr.id FROM public.time_records tr
  WHERE tr.employee_id = '9dc298d2-4e3e-4722-96f1-008066964719'
    AND tr.record_type = 'intervalo'
    AND tr.recorded_at = '2026-05-06 15:09:00+00'
    AND tr.mode = 'manual'
);

DELETE FROM public.manual_punches
WHERE id = '869ce745-5393-4214-b2d2-88c4b4dee5c3';