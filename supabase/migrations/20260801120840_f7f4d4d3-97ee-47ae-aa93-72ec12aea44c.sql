DROP POLICY IF EXISTS "members read business" ON public.businesses;
CREATE POLICY "members or creator read business" ON public.businesses
  FOR SELECT TO authenticated
  USING (public.is_business_member(id) OR created_by = auth.uid());