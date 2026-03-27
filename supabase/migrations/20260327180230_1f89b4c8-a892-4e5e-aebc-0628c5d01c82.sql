CREATE POLICY "Auth can update justifications"
ON public.absence_justifications
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);