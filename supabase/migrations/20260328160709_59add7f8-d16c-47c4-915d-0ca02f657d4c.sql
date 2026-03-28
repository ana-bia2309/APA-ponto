
CREATE OR REPLACE FUNCTION public.insert_time_record_with_cpf(
  p_cpf text,
  p_record_type text,
  p_recorded_at timestamp with time zone,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_mode text DEFAULT 'online',
  p_sync_status text DEFAULT 'synced',
  p_employee_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_employee_id uuid;
  v_normalized_cpf text;
  v_new_id uuid;
BEGIN
  v_normalized_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  
  IF v_normalized_cpf = '' THEN
    RAISE EXCEPTION 'CPF não informado';
  END IF;
  
  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE active = true
    AND regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_normalized_cpf;
  
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'CPF inválido ou colaborador inativo (cpf: %)', left(v_normalized_cpf, 3) || '***';
  END IF;

  -- Double-check: if caller provided an expected employee_id, verify it matches
  IF p_employee_id IS NOT NULL AND p_employee_id != v_employee_id THEN
    RAISE EXCEPTION 'Divergência: employee_id esperado (%) não corresponde ao CPF informado (encontrado: %)', p_employee_id, v_employee_id;
  END IF;
  
  INSERT INTO public.time_records (employee_id, record_type, recorded_at, latitude, longitude, mode, sync_status)
  VALUES (v_employee_id, p_record_type, p_recorded_at, p_latitude, p_longitude, p_mode, p_sync_status)
  RETURNING id INTO v_new_id;
  
  RETURN v_new_id;
END;
$$;
