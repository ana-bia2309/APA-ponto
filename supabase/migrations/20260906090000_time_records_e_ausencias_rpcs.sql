-- Última rodada da correção de RLS: time_records, manual_punches,
-- absence_justifications e afastamentos estavam com "FOR ALL/cada comando
-- TO public USING (true)" — qualquer pessoa sem login podia ler a localização
-- de todo mundo e inserir, editar ou apagar marcações de ponto de qualquer
-- funcionário. Como o portal roda sem sessão Supabase (papel anon), a leitura
-- e as duas escritas que ainda iam direto na tabela passam a ir por função
-- SECURITY DEFINER com o CPF, no mesmo padrão já usado no resto do app.
--
-- Os INSERTs de ponto/correção manual/justificativa já usam RPCs próprias
-- (insert_time_record_with_cpf, insert_manual_punch_with_cpf,
-- insert_justification_with_cpf) — não precisam de nada novo aqui.

-- 1. Leitura de time_records por período — cobre os 3 pontos do app que liam
--    a tabela direto (calendário mensal, histórico de 30 dias, espelho do dia,
--    geração de PDF do espelho de ponto assinado em Meus Documentos)
CREATE OR REPLACE FUNCTION public.get_time_records_by_cpf(p_cpf text, p_start timestamptz, p_end timestamptz)
RETURNS TABLE (
  id uuid, employee_id uuid, record_type text, recorded_at timestamptz, latitude double precision,
  longitude double precision, address text, mode text,
  sync_status text, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp_id uuid;
BEGIN
  SELECT e.id INTO v_emp_id FROM employees e
  WHERE regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
    AND e.active = true LIMIT 1;
  IF v_emp_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT tr.id, tr.employee_id, tr.record_type, tr.recorded_at, tr.latitude, tr.longitude,
         tr.address, tr.mode, tr.sync_status, tr.created_at
  FROM time_records tr
  WHERE tr.employee_id = v_emp_id
    AND tr.recorded_at >= p_start AND tr.recorded_at <= p_end
  ORDER BY tr.recorded_at ASC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_time_records_by_cpf(text, timestamptz, timestamptz) TO anon, authenticated;

-- 1b. Variante por employee_id já resolvido (usada em pontos do app onde o
--     CPF não está mais no escopo, só o id validado anteriormente na sessão).
--     Não é uma consulta livre: employee_id é uuid (não enumerável) e só
--     devolve os próprios registros daquele id — mesma superfície de risco
--     da checagem de duplicidade acima.
CREATE OR REPLACE FUNCTION public.get_time_records_by_employee_id(p_employee_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS TABLE (
  id uuid, record_type text, recorded_at timestamptz, latitude double precision,
  longitude double precision, address text, mode text,
  sync_status text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tr.id, tr.record_type, tr.recorded_at, tr.latitude, tr.longitude,
         tr.address, tr.mode, tr.sync_status, tr.created_at
  FROM time_records tr
  WHERE tr.employee_id = p_employee_id
    AND tr.recorded_at >= p_start AND tr.recorded_at <= p_end
  ORDER BY tr.recorded_at ASC;
$$;
GRANT EXECUTE ON FUNCTION public.get_time_records_by_employee_id(uuid, timestamptz, timestamptz) TO anon, authenticated;

-- 2. Checagem de duplicidade para a fila offline (só confirma existência,
--    não devolve dado sensível) — mantém o mesmo parâmetro employee_id que a
--    fila offline já resolve localmente, mas agora exige o CPF batendo antes
--    de responder, para não virar uma sonda livre de employee_id.
CREATE OR REPLACE FUNCTION public.time_record_exists_by_cpf(
  p_cpf text, p_employee_id uuid, p_record_type text, p_recorded_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp_id uuid;
BEGIN
  SELECT e.id INTO v_emp_id FROM employees e
  WHERE regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
    AND e.active = true LIMIT 1;
  IF v_emp_id IS NULL OR v_emp_id <> p_employee_id THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM time_records tr
    WHERE tr.employee_id = p_employee_id
      AND tr.record_type = p_record_type
      AND tr.recorded_at = p_recorded_at
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.time_record_exists_by_cpf(text, uuid, text, timestamptz) TO anon, authenticated;

-- 3. Anexa endereço a um ponto batido pelo próprio funcionário
--    (antes: UPDATE direto filtrando só por id, sem checar dono).
--    p_photo_url é aceito mas ignorado: a coluna time_records.photo_url não
--    existe no banco (confirmado em diagnóstico) — o UPDATE original já
--    falhava silenciosamente ao tentar gravar essa coluna, então a foto do
--    ponto nunca foi persistida no banco (só o upload para o Storage
--    acontecia). Isso é um bug pré-existente, fora do escopo desta correção
--    de RLS; mantém o comportamento atual (sem gravar) até ser tratado à parte.
CREATE OR REPLACE FUNCTION public.update_time_record_media_by_cpf(
  p_cpf text, p_record_id uuid, p_photo_url text, p_address text
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

  SELECT employee_id INTO v_owner FROM time_records WHERE id = p_record_id;
  IF v_owner IS NULL OR v_owner <> v_emp_id THEN
    RAISE EXCEPTION 'Registro não pertence a este colaborador.';
  END IF;

  UPDATE time_records SET address = p_address WHERE id = p_record_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_time_record_media_by_cpf(text, uuid, text, text) TO anon, authenticated;

-- 4. Quantidade de correções manuais já usadas no mês (limite de 5/mês)
CREATE OR REPLACE FUNCTION public.get_manual_punches_count_by_cpf(p_cpf text, p_start timestamptz, p_end timestamptz)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp_id uuid; v_count integer;
BEGIN
  SELECT e.id INTO v_emp_id FROM employees e
  WHERE regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
    AND e.active = true LIMIT 1;
  IF v_emp_id IS NULL THEN RETURN 0; END IF;

  SELECT COUNT(*) INTO v_count FROM manual_punches mp
  WHERE mp.employee_id = v_emp_id AND mp.created_at >= p_start AND mp.created_at <= p_end;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_manual_punches_count_by_cpf(text, timestamptz, timestamptz) TO anon, authenticated;

-- 5. Justificativas de ausência por período (calendário mensal)
CREATE OR REPLACE FUNCTION public.get_absence_justifications_by_cpf(p_cpf text, p_start date, p_end date)
RETURNS TABLE (date date, reason text, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp_id uuid;
BEGIN
  SELECT e.id INTO v_emp_id FROM employees e
  WHERE regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
    AND e.active = true LIMIT 1;
  IF v_emp_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT aj.date, aj.reason, aj.status
  FROM absence_justifications aj
  WHERE aj.employee_id = v_emp_id AND aj.date >= p_start AND aj.date <= p_end;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_absence_justifications_by_cpf(text, date, date) TO anon, authenticated;

-- 6. Fecha as 4 tabelas para admin apenas, agora que toda leitura/escrita do
--    portal do funcionário passa pelas RPCs acima (e pelas RPCs de insert
--    que já existiam: insert_time_record_with_cpf, insert_manual_punch_with_cpf,
--    insert_justification_with_cpf).
DROP POLICY IF EXISTS "Leitura pública de registros" ON public.time_records;
DROP POLICY IF EXISTS "Inserção pública de registros" ON public.time_records;
DROP POLICY IF EXISTS "Admin pode inserir registros" ON public.time_records;
DROP POLICY IF EXISTS "Admin pode atualizar registros" ON public.time_records;
DROP POLICY IF EXISTS "Deleção de registros" ON public.time_records;
CREATE POLICY "Admin gerencia time_records" ON public.time_records
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Allow all" ON public.manual_punches;
CREATE POLICY "Admin gerencia manual_punches" ON public.manual_punches
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Allow all" ON public.absence_justifications;
CREATE POLICY "Admin gerencia absence_justifications" ON public.absence_justifications
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "afastamentos_allow_all" ON public.afastamentos;
CREATE POLICY "Admin gerencia afastamentos" ON public.afastamentos
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
