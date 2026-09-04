-- Corrige duas falhas encontradas em auditoria:
--
-- 1) A policy "Auth can view employees" liberava SELECT para QUALQUER usuário
--    autenticado (não só admins), diferente do padrão usado em payroll_settings/
--    payslips (que exigem is_admin(auth.uid())). Isso expunha CPF e demais dados
--    de funcionários para qualquer conta autenticada não-admin.
--
-- 2) O portal do funcionário (TimeClock.tsx) roda sem sessão Supabase (papel
--    "anon"), então precisa de funções SECURITY DEFINER para consultas por CPF —
--    exatamente como já existe para get_active_employee_by_cpf, get_pending_*_by_cpf
--    etc. Duas funcionalidades (calendário mensal e aviso de aniversário) ainda
--    faziam SELECT direto em public.employees, que agora fica bloqueado pela
--    correção do item 1 (e, na prática, já estava potencialmente inconsistente
--    antes disso também, por depender de sessão autenticada que o funcionário
--    anônimo nunca tem).

-- 1. Restringe leitura de employees a admins
DROP POLICY IF EXISTS "Auth can view employees" ON public.employees;
CREATE POLICY "Admins can view employees" ON public.employees
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- 2. Função para o portal do funcionário buscar apenas a data de nascimento,
--    dado um employee_id já resolvido (ex: via get_active_employee_by_cpf).
--    Não expõe nenhuma outra coluna da tabela.
CREATE OR REPLACE FUNCTION public.get_employee_birthdate(p_employee_id uuid)
RETURNS TABLE (data_nascimento date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.data_nascimento
  FROM public.employees e
  WHERE e.id = p_employee_id
    AND e.active = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_employee_birthdate(uuid) TO anon, authenticated;

-- 3. Mesma situação em MeusDocumentos.tsx: resolve employee_id por CPF e depois
--    busca name/cpf/cargo/matricula para montar o PDF do espelho de ponto.
--    Reaproveita get_active_employee_by_cpf (já existe) para o primeiro passo;
--    para o segundo, cria uma RPC dedicada em vez de alterar a assinatura de
--    get_active_employee_by_cpf (que já é usada em vários outros pontos).
CREATE OR REPLACE FUNCTION public.get_employee_profile(p_employee_id uuid)
RETURNS TABLE (name text, cpf text, cargo text, matricula text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.name, e.cpf, e.cargo, e.matricula
  FROM public.employees e
  WHERE e.id = p_employee_id
    AND e.active = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_employee_profile(uuid) TO anon, authenticated;
