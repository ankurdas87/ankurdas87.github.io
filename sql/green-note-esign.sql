-- Run in Supabase SQL Editor before deploying the matching Green Note UI.
-- Portal email OTP proves control of the account email. This does not verify Aadhaar with UIDAI.
BEGIN;

ALTER TABLE public.staff_notes
 ADD COLUMN IF NOT EXISTS note_esign_name text,
 ADD COLUMN IF NOT EXISTS note_esign_designation text,
 ADD COLUMN IF NOT EXISTS note_esign_at timestamptz,
 ADD COLUMN IF NOT EXISTS note_esign_method text;

CREATE TABLE IF NOT EXISTS public.green_note_signature_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 note_id uuid NOT NULL REFERENCES public.staff_notes(id) ON DELETE CASCADE,
 signer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz,
 used_at timestamptz
);
CREATE INDEX IF NOT EXISTS green_note_signature_challenges_lookup
 ON public.green_note_signature_challenges(signer_id,note_id,created_at DESC);
ALTER TABLE public.green_note_signature_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.green_note_signature_challenges FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_green_note_signature()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF (OLD.note_esign_name,OLD.note_esign_designation,OLD.note_esign_at,OLD.note_esign_method)
    IS DISTINCT FROM (NEW.note_esign_name,NEW.note_esign_designation,NEW.note_esign_at,NEW.note_esign_method)
    AND current_setting('blc.green_note_signing',true) IS DISTINCT FROM 'yes' THEN
  RAISE EXCEPTION 'Green Note signatures can only be created through email verification.';
 END IF;
 IF OLD.note_esign_at IS NOT NULL AND
    (OLD.subject,OLD.note_content,OLD.category,OLD.note_number,OLD.note_type,OLD.created_by)
    IS DISTINCT FROM (NEW.subject,NEW.note_content,NEW.category,NEW.note_number,NEW.note_type,NEW.created_by) THEN
  RAISE EXCEPTION 'A signed Green Note cannot be edited.';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_green_note_signature ON public.staff_notes;
CREATE TRIGGER guard_green_note_signature BEFORE UPDATE ON public.staff_notes
 FOR EACH ROW EXECUTE FUNCTION public.guard_green_note_signature();

CREATE OR REPLACE FUNCTION public.begin_green_note_signature(p_note_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 PERFORM 1 FROM public.staff_notes
 WHERE id=p_note_id AND created_by=auth.uid() AND note_type='green' AND note_esign_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only the creator can sign an unsigned Green Note.'; END IF;
 DELETE FROM public.green_note_signature_challenges
 WHERE signer_id=auth.uid() AND note_id=p_note_id AND used_at IS NULL;
 INSERT INTO public.green_note_signature_challenges(note_id,signer_id)
 VALUES(p_note_id,auth.uid()) RETURNING id INTO v_id;
 RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_green_note_signature(p_challenge_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_ch public.green_note_signature_challenges%rowtype;
BEGIN
 SELECT * INTO v_ch FROM public.green_note_signature_challenges
 WHERE id=p_challenge_id AND signer_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR v_ch.used_at IS NOT NULL OR v_ch.created_at < now()-interval '10 minutes' THEN
  RAISE EXCEPTION 'The signature code expired. Send a new code.';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) AS m(entry)
  WHERE m.entry->>'method'='otp' AND (m.entry->>'timestamp') ~ '^[0-9]+$'
    AND (m.entry->>'timestamp')::numeric >= extract(epoch FROM date_trunc('second',v_ch.created_at))
 ) THEN RAISE EXCEPTION 'Verify the new code sent to your portal email first.'; END IF;
 UPDATE public.green_note_signature_challenges SET verified_at=clock_timestamp() WHERE id=v_ch.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sign_green_note(p_note_id uuid,p_challenge_id uuid)
RETURNS TABLE(note_esign_name text,note_esign_designation text,note_esign_at timestamptz,note_esign_method text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_note public.staff_notes%rowtype;v_ch public.green_note_signature_challenges%rowtype;
 v_name text;v_designation text;v_signed_at timestamptz;
BEGIN
 SELECT * INTO v_note FROM public.staff_notes WHERE id=p_note_id AND created_by=auth.uid() FOR UPDATE;
 IF NOT FOUND OR v_note.note_type<>'green' OR v_note.note_esign_at IS NOT NULL THEN
  RAISE EXCEPTION 'This Green Note cannot be signed.';
 END IF;
 SELECT * INTO v_ch FROM public.green_note_signature_challenges
 WHERE id=p_challenge_id AND note_id=p_note_id AND signer_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR v_ch.used_at IS NOT NULL OR v_ch.verified_at IS NULL
    OR v_ch.created_at < now()-interval '10 minutes' THEN
  RAISE EXCEPTION 'Verify a fresh email code before signing.';
 END IF;
 SELECT nullif(trim(concat_ws(' ',first_name,last_name)),'') ,nullif(trim(designation),'')
 INTO v_name,v_designation FROM public.institute_head_profiles
 WHERE id=auth.uid() AND account_status='active';
 IF v_name IS NULL THEN
  SELECT nullif(trim(concat_ws(' ',first_name,last_name)),'') ,nullif(trim(designation),'')
  INTO v_name,v_designation FROM public.staff_profiles
  WHERE id=auth.uid() AND account_status='active';
 END IF;
 IF v_name IS NULL OR v_designation IS NULL THEN
  RAISE EXCEPTION 'Your active portal profile needs a name and designation.';
 END IF;
 v_signed_at:=clock_timestamp();
 PERFORM set_config('blc.green_note_signing','yes',true);
 UPDATE public.staff_notes SET note_esign_name=v_name,note_esign_designation=v_designation,
  note_esign_at=v_signed_at,note_esign_method='portal_email_otp' WHERE id=p_note_id;
 UPDATE public.green_note_signature_challenges SET used_at=v_signed_at WHERE id=p_challenge_id;
 RETURN QUERY SELECT v_name,v_designation,v_signed_at,'portal_email_otp'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_signed_green_note_delivery()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.staff_notes
  WHERE id=NEW.note_id AND note_type='green' AND note_esign_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Verify and sign the Green Note before sending.';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS require_signed_green_note_delivery ON public.staff_note_deliveries;
CREATE TRIGGER require_signed_green_note_delivery BEFORE INSERT ON public.staff_note_deliveries
 FOR EACH ROW EXECUTE FUNCTION public.require_signed_green_note_delivery();

REVOKE ALL ON FUNCTION public.begin_green_note_signature(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.confirm_green_note_signature(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.sign_green_note(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.begin_green_note_signature(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_green_note_signature(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sign_green_note(uuid,uuid) TO authenticated;
COMMIT;
