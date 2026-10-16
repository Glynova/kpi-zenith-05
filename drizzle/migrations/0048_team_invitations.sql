CREATE TABLE public.team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'employee',
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  invited_by uuid,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (role <> 'owner')
);
CREATE UNIQUE INDEX team_invitations_one_pending ON public.team_invitations (business_id, lower(email)) WHERE status = 'pending';
CREATE INDEX team_invitations_business ON public.team_invitations (business_id);

GRANT SELECT ON public.team_invitations TO authenticated;
GRANT ALL ON public.team_invitations TO service_role;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read invitations" ON public.team_invitations FOR SELECT TO authenticated
  USING (public.is_business_admin(business_id));

-- Public lookup by raw token: returns only what the accept page needs.
CREATE OR REPLACE FUNCTION public.get_team_invitation(_token text)
RETURNS TABLE(business_name text, email text, role public.app_role, status text, expired boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.name, i.email, i.role, i.status, (i.expires_at < now())
  FROM public.team_invitations i JOIN public.businesses b ON b.id = i.business_id
  WHERE i.token_hash = encode(sha256(convert_to(_token, 'UTF8')), 'hex')
$$;
REVOKE ALL ON FUNCTION public.get_team_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_invitation(text) TO anon, authenticated;

-- Accept: signed-in user whose verified email matches joins the inviting business.
CREATE OR REPLACE FUNCTION public.accept_team_invitation(_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _inv public.team_invitations;
  _uid uuid := auth.uid();
  _email text;
  _confirmed timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Please sign in to accept this invitation'; END IF;
  SELECT lower(u.email), u.email_confirmed_at INTO _email, _confirmed FROM auth.users u WHERE u.id = _uid;
  SELECT * INTO _inv FROM public.team_invitations
    WHERE token_hash = encode(sha256(convert_to(_token, 'UTF8')), 'hex') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation link is not valid'; END IF;
  IF _inv.status = 'revoked' THEN RAISE EXCEPTION 'This invitation was cancelled'; END IF;
  IF _inv.status = 'accepted' THEN
    IF _inv.accepted_by = _uid THEN RETURN _inv.business_id; END IF;
    RAISE EXCEPTION 'This invitation was already used';
  END IF;
  IF _inv.expires_at < now() THEN RAISE EXCEPTION 'This invitation has expired. Ask for a new one'; END IF;
  IF _confirmed IS NULL THEN RAISE EXCEPTION 'Please confirm your email first'; END IF;
  IF lower(_inv.email) <> _email THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address';
  END IF;

  INSERT INTO public.user_businesses (user_id, business_id, role, status)
  VALUES (_uid, _inv.business_id, _inv.role, 'active')
  ON CONFLICT (user_id, business_id) DO UPDATE
    SET role = CASE WHEN public.user_businesses.role = 'owner' THEN 'owner'::public.app_role ELSE EXCLUDED.role END,
        status = 'active';

  UPDATE public.team_invitations SET status = 'accepted', accepted_by = _uid, accepted_at = now(), updated_at = now()
    WHERE id = _inv.id;
  RETURN _inv.business_id;
END $$;
REVOKE ALL ON FUNCTION public.accept_team_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_team_invitation(text) TO authenticated;