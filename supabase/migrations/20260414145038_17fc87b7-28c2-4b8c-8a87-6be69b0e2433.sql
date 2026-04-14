
-- Tabela de catálogo de EPIs
CREATE TABLE public.epis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'geral',
  validity_days INTEGER NOT NULL DEFAULT 365,
  mandatory BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.epis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth can view epis" ON public.epis FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert epis" ON public.epis FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth can update epis" ON public.epis FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth can delete epis" ON public.epis FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Tabela de entregas de EPI
CREATE TABLE public.epi_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  epi_id UUID NOT NULL REFERENCES public.epis(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  delivered_at DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at DATE NOT NULL,
  delivered_by TEXT NOT NULL DEFAULT '',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.epi_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth can view epi_deliveries" ON public.epi_deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert epi_deliveries" ON public.epi_deliveries FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth can update epi_deliveries" ON public.epi_deliveries FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth can delete epi_deliveries" ON public.epi_deliveries FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Trigger para updated_at na tabela epis
CREATE OR REPLACE FUNCTION public.update_epis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_epis_updated_at
BEFORE UPDATE ON public.epis
FOR EACH ROW
EXECUTE FUNCTION public.update_epis_updated_at();
