ALTER TABLE public.hour_bank
  ADD CONSTRAINT hour_bank_employee_month_unique UNIQUE (employee_id, reference_month);