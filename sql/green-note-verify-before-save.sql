-- Run this migration before publishing the matching portal update.
-- OTP verifies the account email while the draft remains editable. The final
-- signature is recorded only after the final content and attachments are saved.
BEGIN;

CREATE TABLE IF NOT EXISTS public.green_note_draft_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 signer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 draft_ref uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 verified_at timestamptz,
 used_at timestamptz
);
CREATE INDEX IF NOT EXISTS green_note_draft_challenges_signer
 ON public.green_note_draft_challenges(signer_id,draft_ref,created_at DESC);
ALTER TABLE public.green_note_draft_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.green_note_draft_challenges FROM PUBLIC,anon,authenticated;

-- The original migration guarded updates; this also prevents an API client
-- from forging signature fields during a direct staff_notes INSERT.
CREATE OR REPLACE FUNCTION public.guard_green_note_signature_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.note_esign_name IS NOT NULL OR NEW.note_esign_designation IS NOT NULL
    OR NEW.note_esign_at IS NOT NULL OR NEW.note_esign_method IS NOT NULL THEN
  RAISE EXCEPTION 'Green Note signatures require email verification.';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_green_note_signature_insert ON public.staff_notes;
CREATE TRIGGER guard_green_note_signature_insert BEFORE INSERT ON public.staff_notes
 FOR EACH ROW EXECUTE FUNCTION public.guard_green_note_signature_insert();

CREATE OR REPLACE FUNCTION public.begin_green_note_draft_signature(p_draft_ref uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR p_draft_ref IS NULL THEN
  RAISE EXCEPTION 'Sign in before verifying this Green Note.';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.institute_head_profiles
                 WHERE id=auth.uid() AND account_status='active')
    AND NOT EXISTS (SELECT 1 FROM public.staff_profiles
                    WHERE id=auth.uid() AND account_status='active') THEN
  RAISE EXCEPTION 'An active portal profile is required.';
 END IF;
 DELETE FROM public.green_note_draft_challenges
 WHERE signer_id=auth.uid() AND draft_ref=p_draft_ref AND used_at IS NULL;
 INSERT INTO public.green_note_draft_challenges(signer_id,draft_ref)
 VALUES(auth.uid(),p_draft_ref) RETURNING id INTO v_id;
 RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_green_note_draft_signature(p_challenge_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_ch public.green_note_draft_challenges%rowtype;
BEGIN
 SELECT * INTO v_ch FROM public.green_note_draft_challenges
 WHERE id=p_challenge_id AND signer_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR v_ch.used_at IS NOT NULL OR
    v_ch.created_at < now()-interval '10 minutes' THEN
  RAISE EXCEPTION 'The signature code expired. Send a new code.';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) AS m(entry)
  WHERE m.entry->>'method'='otp'
    AND (m.entry->>'timestamp') ~ '^[0-9]+$'
    AND (m.entry->>'timestamp')::numeric >=
         extract(epoch FROM date_trunc('second',v_ch.created_at))
 ) THEN
  RAISE EXCEPTION 'Verify the new code sent to your portal email first.';
 END IF;
 UPDATE public.green_note_draft_challenges SET verified_at=clock_timestamp()
 WHERE id=v_ch.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sign_green_note_draft(
 p_note_id uuid,p_challenge_id uuid,p_draft_ref uuid)
RETURNS TABLE(note_esign_name text,note_esign_designation text,
              note_esign_at timestamptz,note_esign_method text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_note public.staff_notes%rowtype;
 v_ch public.green_note_draft_challenges%rowtype;
 v_name text;v_designation text;v_at timestamptz;
BEGIN
 SELECT * INTO v_note FROM public.staff_notes
 WHERE id=p_note_id AND created_by=auth.uid() FOR UPDATE;
 IF NOT FOUND OR v_note.note_type<>'green' OR v_note.note_esign_at IS NOT NULL THEN
  RAISE EXCEPTION 'Only an unsigned Green Note you created can be finalised.';
 END IF;
 SELECT * INTO v_ch FROM public.green_note_draft_challenges
 WHERE id=p_challenge_id AND signer_id=auth.uid() AND draft_ref=p_draft_ref
 FOR UPDATE;
 IF NOT FOUND OR v_ch.verified_at IS NULL OR v_ch.used_at IS NOT NULL
    OR v_ch.created_at < now()-interval '10 minutes'
    OR v_note.created_at < v_ch.verified_at THEN
  RAISE EXCEPTION 'Email verification expired. Verify again before saving.';
 END IF;
 SELECT nullif(trim(concat_ws(' ',first_name,last_name)),''),nullif(trim(designation),'')
 INTO v_name,v_designation FROM public.institute_head_profiles
 WHERE id=auth.uid() AND account_status='active';
 IF v_name IS NULL THEN
  SELECT nullif(trim(concat_ws(' ',first_name,last_name)),''),nullif(trim(designation),'')
  INTO v_name,v_designation FROM public.staff_profiles
  WHERE id=auth.uid() AND account_status='active';
 END IF;
 IF v_name IS NULL OR v_designation IS NULL THEN
  RAISE EXCEPTION 'Your active portal profile needs a name and designation.';
 END IF;
 v_at:=clock_timestamp();
 PERFORM set_config('blc.green_note_signing','yes',true);
 UPDATE public.staff_notes SET note_esign_name=v_name,
  note_esign_designation=v_designation,note_esign_at=v_at,
  note_esign_method='portal_email_otp' WHERE id=p_note_id;
 UPDATE public.green_note_draft_challenges SET used_at=v_at WHERE id=v_ch.id;
 RETURN QUERY SELECT v_name,v_designation,v_at,'portal_email_otp'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_green_note_draft_signature(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.confirm_green_note_draft_signature(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.sign_green_note_draft(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.begin_green_note_draft_signature(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_green_note_draft_signature(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sign_green_note_draft(uuid,uuid,uuid) TO authenticated;
COMMIT;
