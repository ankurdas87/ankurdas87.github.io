-- Institute Head request signing: verify a fresh portal email OTP before a decision.
-- Run in the Supabase SQL Editor before publishing the matching website update.
-- This is portal email verification, not UIDAI/Aadhaar authentication or CCA eSign.
BEGIN;

CREATE TABLE IF NOT EXISTS public.institute_head_signature_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 signer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL REFERENCES public.staff_requests(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz,
 used_at timestamptz
);
CREATE INDEX IF NOT EXISTS ih_signature_challenges_lookup
 ON public.institute_head_signature_challenges(signer_id, request_id, created_at DESC);
ALTER TABLE public.institute_head_signature_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.institute_head_signature_challenges FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.begin_institute_head_signature(p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
 IF NOT public.blc_is_active_head() THEN RAISE EXCEPTION 'Institute Head access required.'; END IF;
 PERFORM 1 FROM public.staff_requests
 WHERE id=p_request_id AND recipient_id=auth.uid() AND status='submitted';
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending request not found.'; END IF;
 DELETE FROM public.institute_head_signature_challenges
 WHERE signer_id=auth.uid() AND request_id=p_request_id AND used_at IS NULL;
 INSERT INTO public.institute_head_signature_challenges(signer_id,request_id)
 VALUES(auth.uid(),p_request_id) RETURNING id INTO v_id;
 RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_institute_head_signature(p_challenge_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_challenge public.institute_head_signature_challenges%rowtype;
BEGIN
 IF NOT public.blc_is_active_head() THEN RAISE EXCEPTION 'Institute Head access required.'; END IF;
 SELECT * INTO v_challenge FROM public.institute_head_signature_challenges
 WHERE id=p_challenge_id AND signer_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR v_challenge.used_at IS NOT NULL THEN RAISE EXCEPTION 'Signature challenge unavailable.'; END IF;
 IF v_challenge.created_at < now()-interval '10 minutes' THEN
  RAISE EXCEPTION 'Signature code expired. Send a new code.';
 END IF;
 PERFORM 1 FROM public.staff_requests
 WHERE id=v_challenge.request_id AND recipient_id=auth.uid() AND status='submitted';
 IF NOT FOUND THEN RAISE EXCEPTION 'Request is no longer pending.'; END IF;
 -- The new Supabase-signed JWT must record an OTP sign-in after this challenge began.
 IF NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) AS m(entry)
  WHERE m.entry->>'method'='otp'
   AND (m.entry->>'timestamp') ~ '^[0-9]+$'
   AND (m.entry->>'timestamp')::numeric >= extract(epoch FROM date_trunc('second',v_challenge.created_at))
 ) THEN
  RAISE EXCEPTION 'Verify the new code sent to your portal email first.';
 END IF;
 UPDATE public.institute_head_signature_challenges
 SET verified_at=now() WHERE id=v_challenge.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_institute_head_request(
 p_request_id uuid,
 p_decision text,
 p_remark text DEFAULT NULL,
 p_esign boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
 r public.staff_requests%rowtype;
 v_head public.institute_head_profiles%rowtype;
 v_challenge_id uuid;
 v_signed_at timestamptz;
BEGIN
 IF NOT public.blc_is_active_head() THEN RAISE EXCEPTION 'Institute Head access required.'; END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('approved','accepted','rejected') THEN
  RAISE EXCEPTION 'Select Approved, Accepted or Rejected.';
 END IF;
 IF p_esign IS NOT TRUE THEN RAISE EXCEPTION 'Portal email verification is mandatory before a decision.'; END IF;
 IF length(coalesce(p_remark,'')) > 2000 THEN RAISE EXCEPTION 'Remark is too long.'; END IF;
 IF p_decision = 'rejected' AND nullif(trim(p_remark),'') IS NULL THEN
  RAISE EXCEPTION 'Please give a reason for rejection.';
 END IF;
 SELECT * INTO v_head FROM public.institute_head_profiles
 WHERE id=auth.uid() AND username='BLC@Principal' AND account_status='active';
 IF NOT FOUND THEN RAISE EXCEPTION 'Principal profile is not available.'; END IF;
 SELECT * INTO r FROM public.staff_requests
 WHERE id=p_request_id AND recipient_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or access denied.'; END IF;
 IF r.status <> 'submitted' THEN RAISE EXCEPTION 'This request already has a decision or is not pending.'; END IF;
 SELECT id INTO v_challenge_id FROM public.institute_head_signature_challenges
 WHERE signer_id=auth.uid() AND request_id=r.id
   AND verified_at IS NOT NULL AND used_at IS NULL
   AND created_at >= now()-interval '10 minutes'
 ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF v_challenge_id IS NULL THEN RAISE EXCEPTION 'Verify a fresh code sent to your portal email before deciding.'; END IF;
 v_signed_at := clock_timestamp();
 UPDATE public.staff_requests SET
  status=p_decision,
  decision_remark=nullif(trim(p_remark),''),
  decided_by=auth.uid(),
  decided_at=v_signed_at,
  principal_esign_applied=true,
  principal_esign_method='portal_email_otp',
  principal_esign_name=concat_ws(' ',v_head.first_name,v_head.last_name),
  principal_esign_at=v_signed_at,
  updated_at=v_signed_at
 WHERE id=r.id;
 UPDATE public.institute_head_signature_challenges SET used_at=v_signed_at
 WHERE id=v_challenge_id;
 INSERT INTO public.staff_notifications
  (staff_id,request_id,application_id,notification_type,title,message,principal_remark)
 VALUES (r.requested_by,r.id,r.application_id,p_decision,
  'Request ' || p_decision || ': ' || r.title,
  'The Principal-cum-Secretary has ' || p_decision || ' your ' || r.request_type || '.',
  nullif(trim(p_remark),''));
 UPDATE public.institute_head_request_notifications SET is_read=true,
  read_at=coalesce(read_at,v_signed_at) WHERE request_id=r.id AND head_id=auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.begin_institute_head_signature(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_institute_head_signature(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_institute_head_request(uuid,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_institute_head_signature(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_institute_head_signature(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_institute_head_request(uuid,text,text,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
