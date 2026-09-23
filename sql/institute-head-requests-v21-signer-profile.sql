-- Run in Supabase SQL Editor for the Institute Head account.
-- Corrects the profile placeholder and labels portal confirmations accurately.
-- No Aadhaar number or email OTP verification is performed by this function.
BEGIN;

UPDATE public.institute_head_profiles
SET first_name = 'Dr. Pratap',
    last_name = 'Chandra Dash'
WHERE username = 'BLC@Principal'
  AND btrim(concat_ws(' ', first_name, last_name)) = 'Principal';

UPDATE public.staff_requests AS r
SET principal_esign_name = concat_ws(' ', h.first_name, h.last_name)
FROM public.institute_head_profiles AS h
WHERE r.decided_by = h.id
  AND h.username = 'BLC@Principal'
  AND r.principal_esign_applied = true
  AND btrim(coalesce(r.principal_esign_name, '')) = 'Principal';

UPDATE public.staff_requests
SET principal_esign_method = 'portal_confirmation'
WHERE principal_esign_method = 'aadhaar_based'
  AND principal_esign_applied = true;

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
BEGIN
 IF NOT public.blc_is_active_head() THEN RAISE EXCEPTION 'Institute Head access required.'; END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('approved','accepted','rejected') THEN
  RAISE EXCEPTION 'Select Approved, Accepted or Rejected.';
 END IF;
 IF p_esign IS NOT TRUE THEN
  RAISE EXCEPTION 'Principal portal signature is mandatory before recording a decision.';
 END IF;
 IF length(coalesce(p_remark,'')) > 2000 THEN RAISE EXCEPTION 'Remark is too long.'; END IF;
 IF p_decision = 'rejected' AND nullif(trim(p_remark),'') IS NULL THEN
  RAISE EXCEPTION 'Please give a reason for rejection.';
 END IF;
 SELECT * INTO v_head FROM public.institute_head_profiles
 WHERE id = auth.uid() AND username = 'BLC@Principal' AND account_status = 'active';
 IF NOT FOUND THEN RAISE EXCEPTION 'Principal profile is not available.'; END IF;
 SELECT * INTO r FROM public.staff_requests
 WHERE id = p_request_id AND recipient_id = auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or access denied.'; END IF;
 IF r.status <> 'submitted' THEN RAISE EXCEPTION 'This request already has a decision or is not pending.'; END IF;
 UPDATE public.staff_requests SET
  status = p_decision,
  decision_remark = nullif(trim(p_remark),''),
  decided_by = auth.uid(),
  decided_at = now(),
  principal_esign_applied = true,
  principal_esign_method = 'portal_confirmation',
  principal_esign_name = concat_ws(' ',v_head.first_name,v_head.last_name),
  principal_esign_at = now(),
  updated_at = now()
 WHERE id = r.id;
 INSERT INTO public.staff_notifications
  (staff_id,request_id,application_id,notification_type,title,message,principal_remark)
 VALUES (r.requested_by,r.id,r.application_id,p_decision,
  'Request ' || p_decision || ': ' || r.title,
  'The Principal-cum-Secretary has ' || p_decision || ' your ' || r.request_type || '.',
  nullif(trim(p_remark),''));
 UPDATE public.institute_head_request_notifications SET is_read = true,
  read_at = coalesce(read_at,now()) WHERE request_id = r.id AND head_id = auth.uid();
END;
$$;


REVOKE ALL ON FUNCTION public.decide_institute_head_request(uuid,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_institute_head_request(uuid,text,text,boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
