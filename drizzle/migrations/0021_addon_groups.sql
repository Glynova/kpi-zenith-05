CREATE TABLE public.addon_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  rule text NOT NULL DEFAULT 'pick1_optional' CHECK (rule IN ('pick1_required','pick1_optional','pick_any')),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.addon_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.addon_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  extra_price numeric NOT NULL DEFAULT 0 CHECK (extra_price >= 0),
  kitchen_note text,
  sort integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.addon_option_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.addon_options(id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  entered_quantity numeric,
  entered_unit text
);
CREATE TABLE public.product_addon_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.addon_groups(id) ON DELETE CASCADE,
  sort integer NOT NULL DEFAULT 0,
  UNIQUE (product_id, group_id)
);
CREATE TABLE public.sale_item_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sale_item_id uuid NOT NULL REFERENCES public.sale_items(id) ON DELETE CASCADE,
  option_id uuid REFERENCES public.addon_options(id) ON DELETE SET NULL,
  group_name text NOT NULL,
  option_name text NOT NULL,
  extra_price numeric NOT NULL DEFAULT 0,
  extra_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.addon_groups, public.addon_options, public.addon_option_components, public.product_addon_groups, public.sale_item_addons TO authenticated;
GRANT ALL ON public.addon_groups, public.addon_options, public.addon_option_components, public.product_addon_groups, public.sale_item_addons TO service_role;

ALTER TABLE public.addon_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addon_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addon_option_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_addon_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_item_addons ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['addon_groups','addon_options','addon_option_components','product_addon_groups','sale_item_addons'] LOOP
    EXECUTE format('CREATE POLICY "%1$s members read" ON public.%1$I FOR SELECT TO authenticated USING (public.is_business_member(business_id))', t);
    EXECUTE format('CREATE POLICY "%1$s writers insert" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id))', t);
    EXECUTE format('CREATE POLICY "%1$s writers update" ON public.%1$I FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id))', t);
  END LOOP;
END $$;
-- Groups/options are archived, never deleted once used; components and links can be replaced.
CREATE POLICY "addon_option_components writers delete" ON public.addon_option_components FOR DELETE TO authenticated USING (public.can_write_business(business_id));
CREATE POLICY "product_addon_groups writers delete" ON public.product_addon_groups FOR DELETE TO authenticated USING (public.can_write_business(business_id));
CREATE POLICY "addon_options writers delete unused" ON public.addon_options FOR DELETE TO authenticated
  USING (public.can_write_business(business_id) AND NOT EXISTS (SELECT 1 FROM public.sale_item_addons s WHERE s.option_id = addon_options.id));

CREATE OR REPLACE FUNCTION public.guard_addon_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_TABLE_NAME = 'addon_options' THEN
    IF NOT EXISTS (SELECT 1 FROM public.addon_groups g WHERE g.id = NEW.group_id AND g.business_id = NEW.business_id) THEN RAISE EXCEPTION 'Group must belong to this business'; END IF;
  ELSIF TG_TABLE_NAME = 'addon_option_components' THEN
    IF NOT EXISTS (SELECT 1 FROM public.addon_options o WHERE o.id = NEW.option_id AND o.business_id = NEW.business_id) THEN RAISE EXCEPTION 'Option must belong to this business'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.component_product_id AND p.business_id = NEW.business_id AND p.item_type <> 'service') THEN RAISE EXCEPTION 'Ingredient must be an item in this business'; END IF;
    IF NEW.variant_id IS NULL AND EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = NEW.component_product_id AND COALESCE(v.status,'active') <> 'archived') THEN RAISE EXCEPTION 'Choose a variant'; END IF;
    IF NEW.variant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.id = NEW.variant_id AND v.product_id = NEW.component_product_id) THEN RAISE EXCEPTION 'Variant does not belong to that item'; END IF;
  ELSIF TG_TABLE_NAME = 'product_addon_groups' THEN
    IF NOT EXISTS (SELECT 1 FROM public.addon_groups g WHERE g.id = NEW.group_id AND g.business_id = NEW.business_id)
       OR NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.business_id = NEW.business_id) THEN RAISE EXCEPTION 'Item and group must belong to this business'; END IF;
  ELSIF TG_TABLE_NAME = 'sale_item_addons' THEN
    IF NOT EXISTS (SELECT 1 FROM public.sale_items si JOIN public.sales s ON s.id = si.sale_id
                    WHERE si.id = NEW.sale_item_id AND si.business_id = NEW.business_id AND NOT s.inventory_posted) THEN
      RAISE EXCEPTION 'Add-ons can only be added to an open sale line';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_addon_options_trg BEFORE INSERT OR UPDATE ON public.addon_options FOR EACH ROW EXECUTE FUNCTION public.guard_addon_identity();
CREATE TRIGGER guard_addon_components_trg BEFORE INSERT OR UPDATE ON public.addon_option_components FOR EACH ROW EXECUTE FUNCTION public.guard_addon_identity();
CREATE TRIGGER guard_product_addon_groups_trg BEFORE INSERT OR UPDATE ON public.product_addon_groups FOR EACH ROW EXECUTE FUNCTION public.guard_addon_identity();
CREATE TRIGGER guard_sale_item_addons_trg BEFORE INSERT OR UPDATE ON public.sale_item_addons FOR EACH ROW EXECUTE FUNCTION public.guard_addon_identity();
REVOKE EXECUTE ON FUNCTION public.guard_addon_identity() FROM PUBLIC, anon, authenticated;