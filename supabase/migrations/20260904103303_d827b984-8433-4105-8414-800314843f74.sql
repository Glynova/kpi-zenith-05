CREATE OR REPLACE FUNCTION public.freeze_partner_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Platform admins (and service-role/back-office code, where auth.uid() is
  -- null) may change programme terms; partners may not change their own.
  IF auth.uid() IS NULL OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  NEW.status := OLD.status;
  NEW.commission_rate := OLD.commission_rate;
  NEW.commission_duration := OLD.commission_duration;
  NEW.referral_code := OLD.referral_code;
  NEW.application_id := OLD.application_id;
  NEW.notes := OLD.notes;
  NEW.approved_at := OLD.approved_at;
  NEW.user_id := OLD.user_id;
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.freeze_partner_privileged_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS affiliate_partners_freeze_privileged ON public.affiliate_partners;
CREATE TRIGGER affiliate_partners_freeze_privileged
  BEFORE UPDATE ON public.affiliate_partners
  FOR EACH ROW EXECUTE FUNCTION public.freeze_partner_privileged_fields();