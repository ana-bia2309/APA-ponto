
-- Table for absence justifications (atestados/justificativas)
CREATE TABLE public.absence_justifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  reason text NOT NULL,
  file_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.absence_justifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert justifications" ON public.absence_justifications
  FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Anyone can view justifications" ON public.absence_justifications
  FOR SELECT TO public USING (true);

CREATE POLICY "Auth can delete justifications" ON public.absence_justifications
  FOR DELETE TO authenticated USING (true);

-- Table for manual punch corrections
CREATE TABLE public.manual_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  step text NOT NULL,
  punched_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.manual_punches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert manual punches" ON public.manual_punches
  FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Anyone can view manual punches" ON public.manual_punches
  FOR SELECT TO public USING (true);

CREATE POLICY "Auth can delete manual punches" ON public.manual_punches
  FOR DELETE TO authenticated USING (true);

-- Storage bucket for justification files
INSERT INTO storage.buckets (id, name, public) VALUES ('justifications', 'justifications', true);

CREATE POLICY "Anyone can upload justifications" ON storage.objects
  FOR INSERT TO public WITH CHECK (bucket_id = 'justifications');

CREATE POLICY "Anyone can view justification files" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'justifications');
