
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_business() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_inventory_movement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_business_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.business_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_write_business(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_business_admin(uuid) FROM PUBLIC, anon;
