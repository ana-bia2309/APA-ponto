
-- Drop existing restrictive INSERT policy
DROP POLICY IF EXISTS "Public can insert punch records for active employees" ON public.punch_records;

-- Create new permissive INSERT policy for anyone
CREATE POLICY "Anyone can insert punch records"
ON public.punch_records
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Also fix manual_punches INSERT policy
DROP POLICY IF EXISTS "Public can insert manual punches for active employees" ON public.manual_punches;

CREATE POLICY "Anyone can insert manual punches"
ON public.manual_punches
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Also fix absence_justifications INSERT policy
DROP POLICY IF EXISTS "Public can insert justifications for active employees" ON public.absence_justifications;

CREATE POLICY "Anyone can insert justifications"
ON public.absence_justifications
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
