-- Staff written applications: email OTP signing and atomic application-number assignment.
-- Run in Supabase SQL Editor before publishing the matching Staff portal code.
BEGIN;

ALTER TABLE public.staff_applications
 ADD COLUMN IF NOT EXISTS staff_esign_name text,
 ADD COLUMN IF NOT EXISTS staff_esign_designation text,
 ADD COLUMN IF NOT EXISTS staff_esign_at timestamptz,
 ADD COLUMN IF NOT EXISTS staff_esign_method text;

CREATE TABLE IF NOT EXISTS public.staff_application_signature_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 signer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 application_id uuid NOT NULL REFERENCES public.staff_applications(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz,
 used_at timestamptz
);
CREATE INDEX IF NOT EXISTS staff_application_signature_lookup
 ON public.staff_application_signature_challenges(signer_id, application_id, created_at DESC);
ALTER TABLE public.staff_application_signature_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.staff_application_signature_challenges FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.begin_staff_application_signature(p_application_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 PERFORM 1 FROM public.staff_applications
 WHERE id=p_application_id AND staff_id=auth.uid()
   AND application_mode='written' AND status='draft';
 IF NOT FOUND THEN RAISE EXCEPTION 'Written application draft not found.'; END IF;
 DELETE FROM public.staff_application_signature_challenges
 WHERE signer_id=auth.uid() AND application_id=p_application_id AND used_at IS NULL;
 INSERT INTO public.staff_application_signature_challenges(signer_id,application_id)
 VALUES(auth.uid(),p_application_id) RETURNING id INTO v_id;
 RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_staff_application_signature(p_challenge_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_challenge public.staff_application_signature_challenges%rowtype;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 SELECT * INTO v_challenge FROM public.staff_application_signature_challenges
 WHERE id=p_challenge_id AND signer_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR v_challenge.used_at IS NOT NULL THEN RAISE EXCEPTION 'Signature challenge unavailable.'; END IF;
 IF v_challenge.created_at < now()-interval '10 minutes' THEN RAISE EXCEPTION 'Code expired. Send a new code.'; END IF;
 PERFORM 1 FROM public.staff_applications
 WHERE id=v_challenge.application_id AND staff_id=auth.uid()
   AND application_mode='written' AND status='draft'
   AND updated_at<=v_challenge.created_at;
 IF NOT FOUND THEN RAISE EXCEPTION 'Application changed after the code was sent. Send a new code.'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) AS m(entry)
  WHERE m.entry->>'method'='otp'
   AND (m.entry->>'timestamp') ~ '^[0-9]+$'
   AND (m.entry->>'timestamp')::numeric >= extract(epoch FROM date_trunc('second',v_challenge.created_at))
 ) THEN RAISE EXCEPTION 'Verify the new code sent to your registered email first.'; END IF;
 UPDATE public.staff_application_signature_challenges SET verified_at=now()
 WHERE id=v_challenge.id;
END;
$$;

-- This existing RPC also finalizes uploaded applications. Their current flow stays intact.
CREATE OR REPLACE FUNCTION public.finalize_staff_application(p_application_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
 v_user_id uuid := auth.uid();
 v_app public.staff_applications%rowtype;
 v_profile public.staff_profiles%rowtype;
 v_signed_at timestamptz;
 v_year integer;
 v_serial integer;
 v_number text;
 v_challenge_id uuid;
 v_challenge_created timestamptz;
BEGIN
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 SELECT * INTO v_app FROM public.staff_applications
 WHERE id=p_application_id AND staff_id=v_user_id AND status='draft' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Application was not found or cannot be finalized.'; END IF;
 v_signed_at := clock_timestamp();
 IF v_app.application_mode='written' THEN
  SELECT id,created_at INTO v_challenge_id,v_challenge_created FROM public.staff_application_signature_challenges
  WHERE signer_id=v_user_id AND application_id=v_app.id AND verified_at IS NOT NULL
    AND used_at IS NULL AND created_at>=v_signed_at-interval '10 minutes'
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF v_challenge_id IS NULL THEN RAISE EXCEPTION 'Verify a fresh email code before signing this application.'; END IF;
  IF v_app.updated_at>v_challenge_created THEN RAISE EXCEPTION 'Application changed after verification. Send a new code.'; END IF;
  SELECT * INTO v_profile FROM public.staff_profiles WHERE id=v_user_id;
  IF NOT FOUND OR btrim(concat_ws(' ',v_profile.first_name,v_profile.last_name))='' THEN
   RAISE EXCEPTION 'Complete your staff name before signing.';
  END IF;
 END IF;
 v_year := extract(year from v_signed_at AT TIME ZONE 'Asia/Kolkata')::integer;
 INSERT INTO public.staff_application_counters(application_year,last_serial)
 VALUES(v_year,1)
 ON CONFLICT(application_year) DO UPDATE
 SET last_serial=public.staff_application_counters.last_serial+1
 RETURNING last_serial INTO v_serial;
 v_number := 'BLC/APP/' || v_year::text || '/' || lpad(v_serial::text,3,'0');
 UPDATE public.staff_applications SET
  application_number=v_number, application_year=v_year,
  status='finalized', finalized_at=v_signed_at, updated_at=v_signed_at,
  staff_esign_name=CASE WHEN v_app.application_mode='written'
    THEN btrim(concat_ws(' ',v_profile.first_name,v_profile.last_name)) ELSE NULL END,
  staff_esign_designation=CASE WHEN v_app.application_mode='written'
    THEN nullif(btrim(v_profile.designation),'') ELSE NULL END,
  staff_esign_at=CASE WHEN v_app.application_mode='written' THEN v_signed_at ELSE NULL END,
  staff_esign_method=CASE WHEN v_app.application_mode='written' THEN 'portal_email_otp' ELSE NULL END
 WHERE id=v_app.id;
 IF v_challenge_id IS NOT NULL THEN
  UPDATE public.staff_application_signature_challenges SET used_at=v_signed_at
  WHERE id=v_challenge_id;
 END IF;
 RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_staff_application_signature(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_staff_application_signature(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_staff_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_staff_application_signature(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_staff_application_signature(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_staff_application(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
