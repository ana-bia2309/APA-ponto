-- Create employees table
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create punch_records table
CREATE TABLE public.punch_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  step TEXT NOT NULL CHECK (step IN ('entrada', 'intervalo', 'retorno', 'saida')),
  punched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punch_records ENABLE ROW LEVEL SECURITY;

-- Employees: anyone can read, only authenticated can manage
CREATE POLICY "Anyone can view employees" ON public.employees FOR SELECT USING (true);
CREATE POLICY "Auth can insert employees" ON public.employees FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update employees" ON public.employees FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth can delete employees" ON public.employees FOR DELETE TO authenticated USING (true);

-- Punch records: anyone can insert and view
CREATE POLICY "Anyone can insert punch records" ON public.punch_records FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view punch records" ON public.punch_records FOR SELECT USING (true);
CREATE POLICY "Auth can delete punch records" ON public.punch_records FOR DELETE TO authenticated USING (true);

-- Index
CREATE INDEX idx_punch_records_employee_date ON public.punch_records (employee_id, punched_at);