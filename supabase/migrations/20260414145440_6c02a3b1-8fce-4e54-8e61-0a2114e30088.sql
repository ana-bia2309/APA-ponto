
-- Add acceptance columns to epi_deliveries
ALTER TABLE public.epi_deliveries
  ADD COLUMN status TEXT NOT NULL DEFAULT 'pendente',
  ADD COLUMN signature_url TEXT,
  ADD COLUMN accepted_at TIMESTAMPTZ,
  ADD COLUMN accepted_by UUID;

-- Allow anon to read pending deliveries and accept them via RPC
-- RPC: get pending EPIs for employee by CPF
CREATE OR REPLACE FUNCTION public.get_pending_epi_by_cpf(p_cpf TEXT)
RETURNS TABLE(
  delivery_id UUID,
  epi_name TEXT,
  epi_category TEXT,
  delivered_at DATE,
  expires_at DATE,
  delivered_by TEXT,
  notes TEXT,
  employee_id UUID,
  employee_name TEXT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized_cpf TEXT;
  v_employee_id UUID;
BEGIN
  v_normalized_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');

  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE active = true
    AND regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_normalized_cpf;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'CPF inválido ou colaborador inativo';
  END IF;

  RETURN QUERY
  SELECT
    d.id AS delivery_id,
    e.name AS epi_name,
    e.category AS epi_category,
    d.delivered_at,
    d.expires_at,
    d.delivered_by,
    d.notes,
    d.employee_id,
    emp.name AS employee_name
  FROM public.epi_deliveries d
  JOIN public.epis e ON e.id = d.epi_id
  JOIN public.employees emp ON emp.id = d.employee_id
  WHERE d.employee_id = v_employee_id
    AND d.status = 'pendente'
  ORDER BY d.delivered_at DESC;
END;
$$;

-- RPC: accept EPI delivery with signature
CREATE OR REPLACE FUNCTION public.accept_epi_delivery(
  p_cpf TEXT,
  p_delivery_id UUID,
  p_signature_url TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized_cpf TEXT;
  v_employee_id UUID;
  v_delivery_employee UUID;
BEGIN
  v_normalized_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');

  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE active = true
    AND regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_normalized_cpf;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'CPF inválido ou colaborador inativo';
  END IF;

  -- Verify delivery belongs to this employee
  SELECT employee_id INTO v_delivery_employee
  FROM public.epi_deliveries
  WHERE id = p_delivery_id AND status = 'pendente';

  IF v_delivery_employee IS NULL THEN
    RAISE EXCEPTION 'Entrega não encontrada ou já aceita';
  END IF;

  IF v_delivery_employee != v_employee_id THEN
    RAISE EXCEPTION 'Esta entrega não pertence a este colaborador';
  END IF;

  UPDATE public.epi_deliveries
  SET status = 'aceito',
      signature_url = p_signature_url,
      accepted_at = now(),
      accepted_by = v_employee_id
  WHERE id = p_delivery_id;

  RETURN TRUE;
END;
$$;

-- Create storage bucket for EPI signatures
INSERT INTO storage.buckets (id, name, public) VALUES ('epi-signatures', 'epi-signatures', false);

-- Storage policies for epi-signatures
CREATE POLICY "Anyone can upload epi signatures"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'epi-signatures');

CREATE POLICY "Auth can view epi signatures"
ON storage.objects FOR SELECT
USING (bucket_id = 'epi-signatures');

-- Allow anon to call the RPCs (employees don't have auth accounts)
GRANT EXECUTE ON FUNCTION public.get_pending_epi_by_cpf(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.accept_epi_delivery(TEXT, UUID, TEXT) TO anon;

-- Allow anon to upload to epi-signatures bucket
CREATE POLICY "Anon can upload epi signatures"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'epi-signatures');

-- Allow anon to read epi signatures (for verification)
CREATE POLICY "Anon can view epi signatures"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'epi-signatures');
