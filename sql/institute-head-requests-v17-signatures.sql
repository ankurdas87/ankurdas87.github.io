-- Run once after institute-head-requests-v16.sql. Safe to rerun.
BEGIN;

-- Store the protected Principal signature record on the request itself.
-- No Aadhaar number is stored in the portal.
ALTER TABLE public.staff_requests
  ADD COLUMN IF NOT EXISTS principal_esign_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS principal_esign_method text,
  ADD COLUMN IF NOT EXISTS principal_esign_name text,
  ADD COLUMN IF NOT EXISTS principal_esign_at timestamptz;

-- Return the active Head identity so the viewer can render the signed record
-- from the server response instead of relying on a hard-coded display name.
CREATE OR REPLACE FUNCTION public.get_institute_head_request(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_result jsonb;
BEGIN
 IF NOT public.blc_is_active_head() THEN RAISE EXCEPTION 'Institute Head access required.'; END IF;
 SELECT jsonb_build_object(
  'request',to_jsonb(r),
  'staff',jsonb_build_object('first_name',p.first_name,'last_name',p.last_name,
    'username',p.username,'designation',p.designation),
  'head',jsonb_build_object('first_name',h.first_name,'last_name',h.last_name,
    'username',h.username,'designation',h.designation),
  'application',to_jsonb(a))
 INTO v_result
 FROM public.staff_requests r
 LEFT JOIN public.staff_profiles p ON p.id = r.requested_by
 LEFT JOIN public.institute_head_profiles h ON h.id = auth.uid()
 LEFT JOIN public.staff_applications a ON a.id = r.application_id AND a.staff_id = r.requested_by
 WHERE r.id = p_request_id AND r.recipient_id = auth.uid() AND r.status <> 'draft';
 IF v_result IS NULL THEN RAISE EXCEPTION 'Request not found or access denied.'; END IF;
 RETURN v_result;
END;
$$;

-- Replace the previous three-argument RPC so every decision requires the
-- Principal to explicitly apply the protected Aadhaar based e-signature.
DROP FUNCTION IF EXISTS public.decide_institute_head_request(uuid,text,text);
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
  RAISE EXCEPTION 'Principal Aadhaar based e-signature is mandatory before recording a decision.';
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
  principal_esign_method = 'aadhaar_based',
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

REVOKE ALL ON FUNCTION public.decide_institute_head_request(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_institute_head_request(uuid,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_institute_head_request(uuid,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_institute_head_request(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
