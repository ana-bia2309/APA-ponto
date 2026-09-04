-- Continuação da correção de RLS: estas 7 tabelas (ferias, aviso_confirmacoes,
-- employee_documents, timesheet_closings, tool_loans, uniform_deliveries,
-- afastamentos) estavam com policy aberta ("allow_all" ou similar) porque o
-- portal do funcionário (papel anon, sem login) precisa ler (e em alguns
-- casos escrever) nelas diretamente. Como não há sessão Supabase no portal,
-- a leitura/escrita passa a ir por função SECURITY DEFINER que resolve o
-- employee_id a partir do CPF e confirma posse do registro antes de agir —
-- mesmo padrão já usado em get_active_employee_by_cpf, accept_documento etc.
--
-- IMPORTANTE: depois de rodar isto, é preciso também atualizar o front-end
-- (TimeClock.tsx, MeusDocumentos.tsx, TimesheetSign.tsx, ToolAcceptance.tsx,
-- UniformAcceptance.tsx) para chamar estas RPCs em vez de acessar as tabelas
-- direto — o patch de código correspondente acompanha esta migração.

-- 1. Histórico de férias do próprio funcionário
CREATE OR REPLACE FUNCTION public.get_ferias_historico_by_cpf(p_cpf text)
RETURNS TABLE (id uuid, tipo text, dias integer, data_inicio date, data_fim date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp_id uuid;
BEGIN
  SELECT e.id INTO v_emp_id FROM employees e
  WHERE regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
    AND e.active = true LIMIT 1;
  IF v_emp_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT f.id, f.tipo, f.dias, f.data_inicio, f.data_fim
  FROM ferias f WHERE f.employee_id = v_emp_id ORDER BY f.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_ferias_historico_by_cpf(text) TO anon, authenticated;

-- 2. Histórico de afastamentos do próprio funcionário
CREATE OR REPLACE FUNCTION public.get_afastamentos_historico_by_cpf(p_cpf text)
RETURNS TABLE (id uuid, tipo text, data_inicio date, data_fim date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp_id uuid;
BEGIN
  SELECT e.id INTO v_emp_id FROM employees e
  WHERE regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
    AND e.active = true LIMIT 1;
  IF v_emp_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT a.id, a.tipo, a.data_inicio, a.data_fim
  FROM afastamentos a WHERE a.employee_id = v_emp_id ORDER BY a.data_inicio DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_afastamentos_historico_by_cpf(text) TO anon, authenticated;

-- 3. Quais avisos o funcionário já confirmou leitura, dentre uma lista de ids
CREATE OR REPLACE FUNCTION public.get_avisos_confirmados_by_cpf(p_cpf text, p_aviso_ids uuid[])
RETURNS TABLE (aviso_id uuid, confirmado_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp_id uuid;
BEGIN
  SELECT e.id INTO v_emp_id FROM employees e
  WHERE regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
    AND e.active = true LIMIT 1;
  IF v_emp_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT ac.aviso_id, ac.confirmado_em
  FROM aviso_confirmacoes ac
  WHERE ac.employee_id = v_emp_id AND ac.aviso_id = ANY(p_aviso_ids);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_avisos_confirmados_by_cpf(text, uuid[]) TO anon, authenticated;

-- 4. Confirma leitura de um aviso (idempotente: ignora se já confirmado)
CREATE OR REPLACE FUNCTION public.confirmar_leitura_aviso_by_cpf(p_cpf text, p_aviso_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp_id uuid;
BEGIN
  SELECT e.id INTO v_emp_id FROM employees e
  WHERE regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
    AND e.active = true LIMIT 1;
  IF v_emp_id IS NULL THEN RAISE EXCEPTION 'Funcionário não encontrado para o CPF informado.'; END IF;

  INSERT INTO aviso_confirmacoes (aviso_id, employee_id)
  VALUES (p_aviso_id, v_emp_id)
  ON CONFLICT DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.confirmar_leitura_aviso_by_cpf(text, uuid) TO anon, authenticated;

-- 5. Lista de documentos administrativos do próprio funcionário (Meus Documentos)
CREATE OR REPLACE FUNCTION public.get_employee_documents_by_cpf(p_cpf text)
RETURNS TABLE (id uuid, name text, title text, type text, created_at timestamptz, file_url text, url text, file_size bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp_id uuid;
BEGIN
  SELECT e.id INTO v_emp_id FROM employees e
  WHERE regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
    AND e.active = true LIMIT 1;
  IF v_emp_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT d.id, d.name, d.title, d.type, d.created_at, d.file_url, d.url, d.file_size
  FROM employee_documents d WHERE d.employee_id = v_emp_id ORDER BY d.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_employee_documents_by_cpf(text) TO anon, authenticated;

-- 6. Espelhos de ponto já assinados/fechados do próprio funcionário (Meus Documentos)
CREATE OR REPLACE FUNCTION public.get_signed_timesheets_by_cpf(p_cpf text)
RETURNS TABLE (id uuid, month integer, year integer, accepted_at timestamptz, status text, signature_url text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp_id uuid;
BEGIN
  SELECT e.id INTO v_emp_id FROM employees e
  WHERE regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
    AND e.active = true LIMIT 1;
  IF v_emp_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT tc.id, tc.month, tc.year, tc.accepted_at, tc.status, tc.signature_url
  FROM timesheet_closings tc
  WHERE tc.employee_id = v_emp_id AND tc.status IN ('assinado', 'fechado')
  ORDER BY tc.year DESC, tc.month DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_signed_timesheets_by_cpf(text) TO anon, authenticated;

-- 7. Assina ou recusa um espelho de ponto — verifica posse antes de gravar
--    (antes: TimesheetSign.tsx dava UPDATE direto filtrando só por id,
--    sem checar de quem era o registro)
CREATE OR REPLACE FUNCTION public.sign_timesheet_closing_by_cpf(
  p_cpf text, p_closing_id uuid, p_status text,
  p_signature_url text DEFAULT NULL, p_signature_method text DEFAULT NULL,
  p_accepted_device text DEFAULT NULL, p_recusa_motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp_id uuid; v_owner uuid;
BEGIN
  IF p_status NOT IN ('assinado', 'recusado') THEN
    RAISE EXCEPTION 'Status inválido.';
  END IF;

  SELECT e.id INTO v_emp_id FROM employees e
  WHERE regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
    AND e.active = true LIMIT 1;
  IF v_emp_id IS NULL THEN RAISE EXCEPTION 'Funcionário não encontrado para o CPF informado.'; END IF;

  SELECT employee_id INTO v_owner FROM timesheet_closings WHERE id = p_closing_id;
  IF v_owner IS NULL OR v_owner <> v_emp_id THEN
    RAISE EXCEPTION 'Espelho de ponto não pertence a este colaborador.';
  END IF;

  UPDATE timesheet_closings SET
    status = p_status,
    signature_url = CASE WHEN p_status = 'assinado' THEN p_signature_url ELSE signature_url END,
    signature_method = CASE WHEN p_status = 'assinado' THEN p_signature_method ELSE signature_method END,
    accepted_at = now(),
    accepted_device = COALESCE(p_accepted_device, accepted_device),
    recusa_motivo = CASE WHEN p_status = 'recusado' THEN p_recusa_motivo ELSE recusa_motivo END
  WHERE id = p_closing_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.sign_timesheet_closing_by_cpf(text, uuid, text, text, text, text, text) TO anon, authenticated;

-- 8. Confirma recebimento de ferramenta emprestada — verifica posse antes de gravar
CREATE OR REPLACE FUNCTION public.accept_tool_loan_by_cpf(
  p_cpf text, p_loan_id uuid, p_signature_url text, p_signature_method text, p_accepted_device text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp_id uuid; v_owner uuid;
BEGIN
  SELECT e.id INTO v_emp_id FROM employees e
  WHERE regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
    AND e.active = true LIMIT 1;
  IF v_emp_id IS NULL THEN RAISE EXCEPTION 'Funcionário não encontrado para o CPF informado.'; END IF;

  SELECT employee_id INTO v_owner FROM tool_loans WHERE id = p_loan_id;
  IF v_owner IS NULL OR v_owner <> v_emp_id THEN
    RAISE EXCEPTION 'Empréstimo não pertence a este colaborador.';
  END IF;

  UPDATE tool_loans SET
    status = 'confirmada', signature_url = p_signature_url,
    signature_method = p_signature_method, accepted_at = now(),
    accepted_device = p_accepted_device
  WHERE id = p_loan_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_tool_loan_by_cpf(text, uuid, text, text, text) TO anon, authenticated;

-- 9. Confirma recebimento de uniforme entregue — verifica posse antes de gravar
CREATE OR REPLACE FUNCTION public.accept_uniform_delivery_by_cpf(
  p_cpf text, p_delivery_id uuid, p_signature_url text, p_signature_method text, p_accepted_device text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp_id uuid; v_owner uuid;
BEGIN
  SELECT e.id INTO v_emp_id FROM employees e
  WHERE regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
    AND e.active = true LIMIT 1;
  IF v_emp_id IS NULL THEN RAISE EXCEPTION 'Funcionário não encontrado para o CPF informado.'; END IF;

  SELECT employee_id INTO v_owner FROM uniform_deliveries WHERE id = p_delivery_id;
  IF v_owner IS NULL OR v_owner <> v_emp_id THEN
    RAISE EXCEPTION 'Entrega não pertence a este colaborador.';
  END IF;

  UPDATE uniform_deliveries SET
    status = 'aceito', accepted_at = now(), signature_url = p_signature_url,
    signature_method = p_signature_method, accepted_device = p_accepted_device
  WHERE id = p_delivery_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_uniform_delivery_by_cpf(text, uuid, text, text, text) TO anon, authenticated;

-- 10. Agora que toda leitura/escrita do portal do funcionário passa pelas
--     RPCs acima, fecha o acesso direto às 7 tabelas para admin apenas.
DROP POLICY IF EXISTS "ferias_allow_all" ON public.ferias;
CREATE POLICY "Admin gerencia ferias" ON public.ferias
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "aviso_confirmacoes_allow_all" ON public.aviso_confirmacoes;
CREATE POLICY "Admin gerencia aviso_confirmacoes" ON public.aviso_confirmacoes
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Allow all" ON public.employee_documents;
CREATE POLICY "Admin gerencia employee_documents" ON public.employee_documents
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Allow all" ON public.timesheet_closings;
CREATE POLICY "Admin gerencia timesheet_closings" ON public.timesheet_closings
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin gerencia empréstimos" ON public.tool_loans;
CREATE POLICY "Admin gerencia tool_loans" ON public.tool_loans
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin gerencia entregas uniformes" ON public.uniform_deliveries;
CREATE POLICY "Admin gerencia uniform_deliveries" ON public.uniform_deliveries
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
