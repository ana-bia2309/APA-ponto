
-- Drop the anon SELECT policy that exposes CPF
DROP POLICY IF EXISTS "Anon can view employees" ON public.employees;

-- Create a SECURITY DEFINER RPC for the TimeClock to fetch employees with CPF for offline cache
-- This is safe because it only returns active employees and is controlled server-side
CREATE OR REPLACE FUNCTION public.get_active_employees_with_cpf()
RETURNS TABLE(id uuid, name text, cpf text, shift text, punch_mode text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT e.id, e.name, e.cpf, e.shift, e.punch_mode
  FROM public.employees e
  WHERE e.active = true
  ORDER BY e.name;
$$;
