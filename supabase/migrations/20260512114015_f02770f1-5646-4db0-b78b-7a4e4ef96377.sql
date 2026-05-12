-- 1) Audit columns on payslips
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS signature_method text,
  ADD COLUMN IF NOT EXISTS signed_ip text,
  ADD COLUMN IF NOT EXISTS signed_user_agent text,
  ADD COLUMN IF NOT EXISTS signed_device text;

-- 2) OTP table
CREATE TABLE IF NOT EXISTS public.payslip_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payslip_otps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage payslip_otps" ON public.payslip_otps
  FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- 3) Storage bucket for drawn signatures (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payslip-signatures','payslip-signatures', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can upload payslip signature"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'payslip-signatures');

CREATE POLICY "Admins can read payslip signatures"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payslip-signatures' AND is_admin(auth.uid()));

-- 4) List pending (unsigned, closed) payslips by CPF
CREATE OR REPLACE FUNCTION public.get_pending_payslips_by_cpf(p_cpf text)
RETURNS TABLE(
  payslip_id uuid, year int, month int,
  liquido numeric, employee_name text, status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_employee_id uuid; v_norm text;
BEGIN
  v_norm := regexp_replace(coalesce(p_cpf,''), '\D','','g');
  SELECT e.id INTO v_employee_id FROM public.employees e
   WHERE e.active = true AND regexp_replace(coalesce(e.cpf,''),'\D','','g') = v_norm LIMIT 1;
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'CPF inválido ou colaborador inativo'; END IF;

  RETURN QUERY
  SELECT ps.id, pp.year, pp.month, ps.liquido, e.name, pp.status
  FROM public.payslips ps
  JOIN public.payroll_periods pp ON pp.id = ps.period_id
  JOIN public.employees e ON e.id = ps.employee_id
  WHERE ps.employee_id = v_employee_id
    AND ps.signed_at IS NULL
    AND pp.status = 'fechado'
  ORDER BY pp.year DESC, pp.month DESC;
END;
$$;

-- 5) Generate OTP for a given payslip (5 minutes)
CREATE OR REPLACE FUNCTION public.generate_payslip_otp(p_cpf text, p_payslip_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_employee_id uuid; v_owner uuid; v_norm text; v_code text;
BEGIN
  v_norm := regexp_replace(coalesce(p_cpf,''),'\D','','g');
  SELECT e.id INTO v_employee_id FROM public.employees e
   WHERE e.active = true AND regexp_replace(coalesce(e.cpf,''),'\D','','g') = v_norm LIMIT 1;
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'CPF inválido ou colaborador inativo'; END IF;

  SELECT ps.employee_id INTO v_owner FROM public.payslips ps WHERE ps.id = p_payslip_id;
  IF v_owner IS NULL OR v_owner <> v_employee_id THEN
    RAISE EXCEPTION 'Holerite não pertence a este colaborador'; END IF;

  v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');

  -- invalidate prior unused codes
  UPDATE public.payslip_otps
     SET used_at = now()
   WHERE payslip_id = p_payslip_id AND used_at IS NULL;

  INSERT INTO public.payslip_otps (payslip_id, employee_id, code, expires_at)
  VALUES (p_payslip_id, v_employee_id, v_code, now() + interval '5 minutes');

  RETURN v_code;
END;
$$;

-- 6) Sign payslip (method = 'senha' | 'otp' | 'desenho')
CREATE OR REPLACE FUNCTION public.sign_payslip_by_cpf(
  p_cpf text,
  p_payslip_id uuid,
  p_method text,
  p_signature_url text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_otp text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_owner uuid;
  v_norm text;
  v_pwd_norm text;
  v_otp_ok boolean;
  v_already timestamptz;
BEGIN
  v_norm := regexp_replace(coalesce(p_cpf,''),'\D','','g');
  SELECT e.id INTO v_employee_id FROM public.employees e
   WHERE e.active = true AND regexp_replace(coalesce(e.cpf,''),'\D','','g') = v_norm LIMIT 1;
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'CPF inválido ou colaborador inativo'; END IF;

  SELECT ps.employee_id, ps.signed_at INTO v_owner, v_already
  FROM public.payslips ps WHERE ps.id = p_payslip_id;
  IF v_owner IS NULL OR v_owner <> v_employee_id THEN
    RAISE EXCEPTION 'Holerite não pertence a este colaborador'; END IF;
  IF v_already IS NOT NULL THEN
    RAISE EXCEPTION 'Holerite já foi assinado em %', v_already; END IF;

  IF p_method = 'senha' THEN
    v_pwd_norm := regexp_replace(coalesce(p_password,''),'\D','','g');
    IF v_pwd_norm <> v_norm THEN
      RAISE EXCEPTION 'Senha inválida (informe seu CPF)'; END IF;
  ELSIF p_method = 'otp' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.payslip_otps o
      WHERE o.payslip_id = p_payslip_id
        AND o.code = coalesce(p_otp,'')
        AND o.used_at IS NULL
        AND o.expires_at > now()
    ) INTO v_otp_ok;
    IF NOT v_otp_ok THEN RAISE EXCEPTION 'Código OTP inválido ou expirado'; END IF;
    UPDATE public.payslip_otps SET used_at = now()
     WHERE payslip_id = p_payslip_id AND code = p_otp AND used_at IS NULL;
  ELSIF p_method = 'desenho' THEN
    IF p_signature_url IS NULL OR length(trim(p_signature_url)) = 0 THEN
      RAISE EXCEPTION 'Assinatura desenhada é obrigatória'; END IF;
  ELSE
    RAISE EXCEPTION 'Método de assinatura inválido: %', p_method;
  END IF;

  UPDATE public.payslips
     SET signed_at = now(),
         signature_method = p_method,
         signature_url = coalesce(p_signature_url, signature_url),
         signed_ip = p_ip,
         signed_user_agent = p_user_agent,
         signed_device = p_device
   WHERE id = p_payslip_id;

  RETURN p_payslip_id;
END;
$$;