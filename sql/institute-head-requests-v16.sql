-- Run once in the BLC Supabase SQL Editor. Safe to rerun.
BEGIN;

ALTER TABLE public.staff_requests ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES auth.users(id);
ALTER TABLE public.staff_requests DROP CONSTRAINT IF EXISTS staff_requests_status_check;
ALTER TABLE public.staff_requests ADD CONSTRAINT staff_requests_status_check
 CHECK (status IN ('draft','submitted','approved','accepted','rejected','returned'));
ALTER TABLE public.staff_notifications DROP CONSTRAINT IF EXISTS staff_notifications_notification_type_check;
ALTER TABLE public.staff_notifications ADD CONSTRAINT staff_notifications_notification_type_check
 CHECK (notification_type IN ('request_submitted','approved','accepted','rejected','returned','general'));

CREATE OR REPLACE FUNCTION public.blc_is_active_head()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
 SELECT EXISTS (SELECT 1 FROM public.institute_head_profiles
 WHERE id = auth.uid() AND username = 'BLC@Principal' AND account_status = 'active');
$$;

CREATE TABLE IF NOT EXISTS public.institute_head_request_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 head_id uuid NOT NULL REFERENCES auth.users(id),
 request_id uuid NOT NULL REFERENCES public.staff_requests(id) ON DELETE CASCADE,
 title text NOT NULL,
 message text NOT NULL,
 is_read boolean NOT NULL DEFAULT false,
 read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (head_id, request_id)
);
ALTER TABLE public.institute_head_request_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.institute_head_request_notifications FROM anon, authenticated;
GRANT SELECT ON public.institute_head_request_notifications TO authenticated;
DROP POLICY IF EXISTS "Head reads own request notifications" ON public.institute_head_request_notifications;
CREATE POLICY "Head reads own request notifications"
 ON public.institute_head_request_notifications FOR SELECT TO authenticated
 USING (head_id = auth.uid() AND public.blc_is_active_head());

-- Preserve the existing submission checks; route each submission to the Head.
CREATE OR REPLACE FUNCTION public.submit_staff_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
 v_user_id uuid := auth.uid();
 v_request public.staff_requests%rowtype;
 v_head uuid;
BEGIN
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 SELECT id INTO v_head FROM public.institute_head_profiles
 WHERE username = 'BLC@Principal' AND account_status = 'active';
 IF v_head IS NULL THEN RAISE EXCEPTION 'The Principal account is not available.'; END IF;
 SELECT * INTO v_request FROM public.staff_requests
 WHERE id = p_request_id AND requested_by = v_user_id AND status = 'draft' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Draft request was not found or cannot be submitted.'; END IF;
 IF v_request.request_type = 'application' THEN
  IF NOT EXISTS (SELECT 1 FROM public.staff_applications
    WHERE id = v_request.application_id AND staff_id = v_user_id AND status = 'finalized') THEN
   RAISE EXCEPTION 'The attached application must be finalized first.';
  END IF;
  UPDATE public.staff_applications SET status = 'submitted', updated_at = now()
   WHERE id = v_request.application_id AND staff_id = v_user_id;
 ELSIF v_request.file_path IS NULL OR trim(v_request.file_path) = '' THEN
  RAISE EXCEPTION 'The request document is missing.';
 END IF;
 UPDATE public.staff_requests SET status = 'submitted', submitted_at = now(),
  recipient_id = v_head, updated_at = now() WHERE id = p_request_id;
 INSERT INTO public.institute_head_request_notifications(head_id,request_id,title,message)
 VALUES(v_head,p_request_id,'New ' || v_request.request_type || ': ' || v_request.title,
        'A staff submission is ready for your review.');
END;
$$;

-- Include submissions made before the Head workspace was connected.
UPDATE public.staff_requests r SET recipient_id = h.id
FROM public.institute_head_profiles h
WHERE r.recipient_id IS NULL AND r.status <> 'draft'
 AND h.username = 'BLC@Principal' AND h.account_status = 'active';
INSERT INTO public.institute_head_request_notifications(head_id,request_id,title,message,created_at)
SELECT recipient_id,id,'New ' || request_type || ': ' || title,
 'A staff submission is ready for your review.', coalesce(submitted_at,created_at)
FROM public.staff_requests WHERE status = 'submitted' AND recipient_id IS NOT NULL
ON CONFLICT (head_id,request_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_institute_head_requests()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
 IF NOT public.blc_is_active_head() THEN RAISE EXCEPTION 'Institute Head access required.'; END IF;
 RETURN coalesce((
 SELECT jsonb_agg(to_jsonb(x) ORDER BY x.submitted_at DESC)
 FROM (
  SELECT r.id,r.request_type,r.title,r.request_details,r.status,r.submitted_at,
   r.decided_at,r.decision_remark,p.first_name,p.last_name,p.username,p.designation,
   a.application_number
  FROM public.staff_requests r
  LEFT JOIN public.staff_profiles p ON p.id = r.requested_by
  LEFT JOIN public.staff_applications a ON a.id = r.application_id AND a.staff_id = r.requested_by
  WHERE r.recipient_id = auth.uid() AND r.status <> 'draft'
 ) x), '[]'::jsonb);
END;
$$;

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
  'application',to_jsonb(a))
 INTO v_result
 FROM public.staff_requests r
 LEFT JOIN public.staff_profiles p ON p.id = r.requested_by
 LEFT JOIN public.staff_applications a ON a.id = r.application_id AND a.staff_id = r.requested_by
 WHERE r.id = p_request_id AND r.recipient_id = auth.uid() AND r.status <> 'draft';
 IF v_result IS NULL THEN RAISE EXCEPTION 'Request not found or access denied.'; END IF;
 RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_institute_head_request(
 p_request_id uuid, p_decision text, p_remark text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE r public.staff_requests%rowtype;
BEGIN
 IF NOT public.blc_is_active_head() THEN RAISE EXCEPTION 'Institute Head access required.'; END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('approved','accepted','rejected') THEN
  RAISE EXCEPTION 'Select Approved, Accepted or Rejected.';
 END IF;
 IF length(coalesce(p_remark,'')) > 2000 THEN RAISE EXCEPTION 'Remark is too long.'; END IF;
 IF p_decision = 'rejected' AND nullif(trim(p_remark),'') IS NULL THEN
  RAISE EXCEPTION 'Please give a reason for rejection.';
 END IF;
 SELECT * INTO r FROM public.staff_requests
 WHERE id = p_request_id AND recipient_id = auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or access denied.'; END IF;
 IF r.status <> 'submitted' THEN RAISE EXCEPTION 'This request already has a decision or is not pending.'; END IF;
 UPDATE public.staff_requests SET status = p_decision, decision_remark = nullif(trim(p_remark),''),
  decided_by = auth.uid(), decided_at = now(), updated_at = now() WHERE id = r.id;
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

CREATE OR REPLACE FUNCTION public.mark_institute_head_request_notifications_read(p_request_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
 IF NOT public.blc_is_active_head() THEN RAISE EXCEPTION 'Institute Head access required.'; END IF;
 UPDATE public.institute_head_request_notifications SET is_read = true, read_at = coalesce(read_at,now())
 WHERE head_id = auth.uid() AND (p_request_id IS NULL OR request_id = p_request_id);
END;
$$;

-- Only files attached to a submitted request addressed to this Head are readable.
CREATE OR REPLACE FUNCTION public.blc_head_can_read_request_file(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
 SELECT public.blc_is_active_head() AND EXISTS (
  SELECT 1 FROM public.staff_requests r
  LEFT JOIN public.staff_applications a ON a.id = r.application_id AND a.staff_id = r.requested_by
  WHERE r.recipient_id = auth.uid() AND r.status <> 'draft'
   AND (r.file_path = p_path OR a.uploaded_file_path = p_path)
 );
$$;
DROP POLICY IF EXISTS "Head reads submitted request files" ON storage.objects;
CREATE POLICY "Head reads submitted request files" ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id = 'staff-requests' AND public.blc_head_can_read_request_file(name));

REVOKE ALL ON FUNCTION public.blc_is_active_head() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_staff_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_institute_head_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_institute_head_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_institute_head_request(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_institute_head_request_notifications_read(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.blc_head_can_read_request_file(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blc_is_active_head(),
 public.submit_staff_request(uuid),public.get_institute_head_requests(),
 public.get_institute_head_request(uuid),public.decide_institute_head_request(uuid,text,text),
 public.mark_institute_head_request_notifications_read(uuid),
 public.blc_head_can_read_request_file(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
