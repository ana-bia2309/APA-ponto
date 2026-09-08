-- employee_requests nunca ficou acessível para o papel anon (nem antes desta
-- auditoria) — o portal do funcionário (TimeClock.tsx) sempre acessou essa
-- tabela direto, sem RPC, então o contador "você tem uma resposta pendente"
-- nunca funcionou de verdade para o funcionário real. Passou despercebido
-- nas rodadas anteriores porque o foco estava em ponto/documentos/férias.

CREATE OR REPLACE FUNCTION public.get_pending_response_count_by_employee_id(p_employee_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM employee_requests
  WHERE employee_id = p_employee_id
    AND status IN ('aprovado', 'recusado')
    AND visualizado_em IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.get_pending_response_count_by_employee_id(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.marcar_solicitacoes_visualizadas_by_employee_id(p_employee_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE employee_requests
  SET visualizado_em = now()
  WHERE employee_id = p_employee_id
    AND status IN ('aprovado', 'recusado')
    AND visualizado_em IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.marcar_solicitacoes_visualizadas_by_employee_id(uuid) TO anon, authenticated;

-- Mesma situação em MeusSolicitacoes (dentro de TimeClock.tsx): lista as
-- últimas solicitações do próprio funcionário, também bloqueada por RLS
-- para o papel anon.
CREATE OR REPLACE FUNCTION public.get_minhas_solicitacoes_by_employee_id(p_employee_id uuid)
RETURNS TABLE (id uuid, tipo text, status text, observacao text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT er.id, er.tipo, er.status, er.observacao, er.created_at
  FROM employee_requests er
  WHERE er.employee_id = p_employee_id
  ORDER BY er.created_at DESC
  LIMIT 5;
$$;
GRANT EXECUTE ON FUNCTION public.get_minhas_solicitacoes_by_employee_id(uuid) TO anon, authenticated;
