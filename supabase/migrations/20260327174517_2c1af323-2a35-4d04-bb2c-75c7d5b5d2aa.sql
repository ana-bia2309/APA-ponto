
-- RPC: Insert time record with CPF validation (for employee punch flow)
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
SET search_path = 'public'
AS $$
DECLARE
  v_employee_id uuid;
  v_normalized_cpf text;
  v_new_id uuid;
BEGIN
  v_normalized_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  
  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE active = true
    AND regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_normalized_cpf;
  
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'CPF inválido ou colaborador inativo';
  END IF;
  
  INSERT INTO public.time_records (employee_id, record_type, recorded_at, latitude, longitude, mode, sync_status)
  VALUES (v_employee_id, p_record_type, p_recorded_at, p_latitude, p_longitude, p_mode, p_sync_status)
  RETURNING id INTO v_new_id;
  
  RETURN v_new_id;
END;
$$;

-- RPC: Insert manual punch with CPF validation
CREATE OR REPLACE FUNCTION public.insert_manual_punch_with_cpf(
  p_cpf text,
  p_step text,
  p_punched_at timestamptz,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_employee_id uuid;
  v_normalized_cpf text;
  v_new_id uuid;
  v_monthly_count integer;
BEGIN
  v_normalized_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  
  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE active = true
    AND regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_normalized_cpf;
  
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'CPF inválido ou colaborador inativo';
  END IF;

  -- Enforce monthly limit
  SELECT COUNT(*) INTO v_monthly_count
  FROM public.manual_punches
  WHERE employee_id = v_employee_id
    AND created_at >= date_trunc('month', now())
    AND created_at < date_trunc('month', now()) + interval '1 month';
  
  IF v_monthly_count >= 5 THEN
    RAISE EXCEPTION 'Limite mensal de 5 correções manuais excedido';
  END IF;

  INSERT INTO public.manual_punches (employee_id, step, punched_at, reason)
  VALUES (v_employee_id, p_step, p_punched_at, p_reason)
  RETURNING id INTO v_new_id;
  
  -- Also insert into time_records
  INSERT INTO public.time_records (employee_id, record_type, recorded_at, mode, sync_status)
  VALUES (v_employee_id, p_step, p_punched_at, 'manual', 'synced');
  
  RETURN v_new_id;
END;
$$;

-- RPC: Insert absence justification with CPF validation
CREATE OR REPLACE FUNCTION public.insert_justification_with_cpf(
  p_cpf text,
  p_date date,
  p_reason text,
  p_file_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_employee_id uuid;
  v_normalized_cpf text;
  v_new_id uuid;
BEGIN
  v_normalized_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  
  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE active = true
    AND regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_normalized_cpf;
  
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'CPF inválido ou colaborador inativo';
  END IF;
  
  INSERT INTO public.absence_justifications (employee_id, date, reason, file_url)
  VALUES (v_employee_id, p_date, p_reason, p_file_url)
  RETURNING id INTO v_new_id;
  
  RETURN v_new_id;
END;
$$;

-- Now remove anon INSERT policies
DROP POLICY IF EXISTS "Anyone can insert time records" ON public.time_records;
DROP POLICY IF EXISTS "Active employees can insert punch records" ON public.punch_records;
DROP POLICY IF EXISTS "Active employees can insert manual punches" ON public.manual_punches;
DROP POLICY IF EXISTS "Active employees can insert justifications" ON public.absence_justifications;

-- Keep authenticated INSERT for admin operations
CREATE POLICY "Auth can insert time records"
  ON public.time_records FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Auth can insert punch records"
  ON public.punch_records FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Auth can insert manual punches"
  ON public.manual_punches FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Auth can insert justifications"
  ON public.absence_justifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
