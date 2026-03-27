
DROP POLICY "Anyone can view time records" ON public.time_records;

CREATE POLICY "Auth can view time records"
  ON public.time_records
  FOR SELECT
  TO authenticated
  USING (true);
