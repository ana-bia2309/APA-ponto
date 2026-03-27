ALTER TABLE public.absence_justifications 
  ADD COLUMN status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN admin_notes text;