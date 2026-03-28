-- Trigger to prevent duplicate record_type per employee per day
CREATE OR REPLACE FUNCTION public.prevent_duplicate_daily_punch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_day date;
  v_exists boolean;
BEGIN
  v_day := (NEW.recorded_at AT TIME ZONE 'America/Sao_Paulo')::date;
  
  SELECT EXISTS (
    SELECT 1 FROM public.time_records
    WHERE employee_id = NEW.employee_id
      AND record_type = NEW.record_type
      AND (recorded_at AT TIME ZONE 'America/Sao_Paulo')::date = v_day
  ) INTO v_exists;
  
  IF v_exists THEN
    RAISE EXCEPTION 'Registro "%" já existe para este colaborador hoje.', NEW.record_type;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_duplicate_daily_punch
BEFORE INSERT ON public.time_records
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_daily_punch();