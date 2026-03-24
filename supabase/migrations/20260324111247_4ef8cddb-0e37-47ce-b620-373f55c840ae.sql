
-- Add photo_url column to punch_records
ALTER TABLE public.punch_records ADD COLUMN photo_url text;

-- Create storage bucket for punch photos
INSERT INTO storage.buckets (id, name, public) VALUES ('punch-photos', 'punch-photos', true);

-- Allow anyone to upload to punch-photos bucket
CREATE POLICY "Anyone can upload punch photos"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'punch-photos');

-- Allow anyone to view punch photos
CREATE POLICY "Anyone can view punch photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'punch-photos');
