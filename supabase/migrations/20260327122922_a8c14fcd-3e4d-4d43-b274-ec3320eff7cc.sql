
-- Fix search_path on check_manual_punch_limit
CREATE OR REPLACE FUNCTION public.check_manual_punch_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  monthly_count integer;
BEGIN
  SELECT COUNT(*) INTO monthly_count
  FROM public.manual_punches
  WHERE employee_id = NEW.employee_id
    AND created_at >= date_trunc('month', now())
    AND created_at < date_trunc('month', now()) + interval '1 month';
  IF monthly_count >= 5 THEN
    RAISE EXCEPTION 'Limite mensal de 5 correções manuais excedido';
  END IF;
  RETURN NEW;
END;
$$;
