-- Run in Supabase SQL Editor before deploying sign-on-send Green Notes.
-- Prevent a client from inserting a pre-signed row and bypassing portal email OTP.
BEGIN;
CREATE OR REPLACE FUNCTION public.guard_green_note_signature_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.note_esign_name IS NOT NULL OR NEW.note_esign_designation IS NOT NULL
    OR NEW.note_esign_at IS NOT NULL OR NEW.note_esign_method IS NOT NULL THEN
  RAISE EXCEPTION 'Green Note signatures can only be created through email verification.';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_green_note_signature_insert ON public.staff_notes;
CREATE TRIGGER guard_green_note_signature_insert
BEFORE INSERT ON public.staff_notes
FOR EACH ROW EXECUTE FUNCTION public.guard_green_note_signature_insert();
COMMIT;
