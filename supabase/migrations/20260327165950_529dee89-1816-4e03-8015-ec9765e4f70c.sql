CREATE POLICY "Anon can view employees"
ON public.employees
FOR SELECT
TO anon
USING (active = true);