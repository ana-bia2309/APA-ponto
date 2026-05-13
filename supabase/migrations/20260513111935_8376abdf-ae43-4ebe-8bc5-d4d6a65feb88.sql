ALTER TABLE public.payslips REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payslips;