
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('owner','admin','manager','accountant','cashier','inventory_staff','warehouse_staff','employee','auditor');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  type TEXT NOT NULL DEFAULT 'retail',
  logo_url TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  tax_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  address TEXT,
  phone TEXT,
  email TEXT,
  brand_color TEXT DEFAULT '#2563eb',
  invoice_terms TEXT,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'employee',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, business_id)
);
CREATE INDEX idx_user_businesses_user ON public.user_businesses(user_id);
CREATE INDEX idx_user_businesses_business ON public.user_businesses(business_id);

-- HELPERS
CREATE OR REPLACE FUNCTION public.is_business_member(_business_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_businesses ub
    WHERE ub.business_id = _business_id AND ub.user_id = auth.uid() AND ub.status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.business_role(_business_id UUID)
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ub.role FROM public.user_businesses ub
  WHERE ub.business_id = _business_id AND ub.user_id = auth.uid() AND ub.status = 'active' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_write_business(_business_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_businesses ub
    WHERE ub.business_id = _business_id AND ub.user_id = auth.uid()
      AND ub.status = 'active' AND ub.role <> 'auditor');
$$;

CREATE OR REPLACE FUNCTION public.is_business_admin(_business_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_businesses ub
    WHERE ub.business_id = _business_id AND ub.user_id = auth.uid()
      AND ub.status = 'active' AND ub.role IN ('owner','admin'));
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Owner membership on business creation
CREATE OR REPLACE FUNCTION public.handle_new_business() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_businesses (user_id, business_id, role)
  VALUES (auth.uid(), NEW.id, 'owner') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_business_created AFTER INSERT ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.handle_new_business();

-- CORE TABLES
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL, contact_person TEXT, email TEXT, phone TEXT, address TEXT,
  tax_number TEXT, balance NUMERIC(14,2) NOT NULL DEFAULT 0, notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL, email TEXT, phone TEXT, address TEXT, type TEXT NOT NULL DEFAULT 'walk_in',
  credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0, balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL, location TEXT, is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sku TEXT, barcode TEXT, name TEXT NOT NULL, description TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  brand TEXT, unit TEXT NOT NULL DEFAULT 'pcs',
  cost_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  reorder_level NUMERIC(14,3) NOT NULL DEFAULT 0,
  stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  reserved_stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  image_url TEXT, status TEXT NOT NULL DEFAULT 'active',
  expiration_date DATE, batch_number TEXT, serial_number TEXT, is_finished_good BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_business ON public.products(business_id);
CREATE UNIQUE INDEX idx_products_sku ON public.products(business_id, sku) WHERE sku IS NOT NULL;

CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  quantity NUMERIC(14,3) NOT NULL,
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  reference TEXT, notes TEXT, batch_number TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_movements_business ON public.inventory_movements(business_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.apply_inventory_movement() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.products
    SET stock = stock + CASE WHEN NEW.type IN ('stock_in','return_in','adjustment_in','transfer_in')
      THEN NEW.quantity ELSE -NEW.quantity END,
    updated_at = now()
  WHERE id = NEW.product_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_inventory_movement AFTER INSERT ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_movement();

CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  po_number TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
  order_date DATE NOT NULL DEFAULT CURRENT_DATE, expected_date DATE,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0, tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0, paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT, created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  received_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  sale_number TEXT NOT NULL, sale_type TEXT NOT NULL DEFAULT 'walk_in',
  status TEXT NOT NULL DEFAULT 'completed',
  payment_method TEXT NOT NULL DEFAULT 'cash',
  payment_status TEXT NOT NULL DEFAULT 'paid',
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT, created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sales_business_date ON public.sales(business_id, sale_date DESC);

CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unpaid',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE, due_date DATE,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0, discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax NUMERIC(14,2) NOT NULL DEFAULT 0, total NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid NUMERIC(14,2) NOT NULL DEFAULT 0, terms TEXT, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'miscellaneous',
  description TEXT, amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  is_recurring BOOLEAN NOT NULL DEFAULT false, recurrence TEXT,
  status TEXT NOT NULL DEFAULT 'approved', attachment_url TEXT, vendor TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_expenses_business_date ON public.expenses(business_id, expense_date DESC);

CREATE TABLE public.cash_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'in', amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  category TEXT, description TEXT, reference TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.accounts_receivable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0, paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  due_date DATE, status TEXT NOT NULL DEFAULT 'open', notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.accounts_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0, paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  due_date DATE, status TEXT NOT NULL DEFAULT 'open', notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID,
  employee_code TEXT, full_name TEXT NOT NULL, department TEXT, position TEXT,
  rate_type TEXT NOT NULL DEFAULT 'monthly', salary NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', email TEXT, phone TEXT, address TEXT,
  emergency_contact TEXT, emergency_phone TEXT, hire_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
  time_in TIMESTAMPTZ, time_out TIMESTAMPTZ,
  overtime_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  undertime_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'present', notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_start DATE NOT NULL, period_end DATE NOT NULL,
  basic_pay NUMERIC(14,2) NOT NULL DEFAULT 0,
  overtime_pay NUMERIC(14,2) NOT NULL DEFAULT 0,
  holiday_pay NUMERIC(14,2) NOT NULL DEFAULT 0,
  allowances NUMERIC(14,2) NOT NULL DEFAULT 0,
  deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
  loans NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.bill_of_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'recipe',
  output_quantity NUMERIC(14,3) NOT NULL DEFAULT 1, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.bom_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  bom_id UUID NOT NULL REFERENCES public.bill_of_materials(id) ON DELETE CASCADE,
  component_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID,
  type TEXT NOT NULL DEFAULT 'info', title TEXT NOT NULL, message TEXT,
  link TEXT, is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL, formula TEXT, target NUMERIC(14,2), unit TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID DEFAULT auth.uid(),
  user_email TEXT, action TEXT NOT NULL, module TEXT NOT NULL,
  record_id TEXT, old_value JSONB, new_value JSONB, ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_business ON public.audit_logs(business_id, created_at DESC);

-- PROFILES RLS
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- BUSINESSES RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read business" ON public.businesses FOR SELECT TO authenticated USING (public.is_business_member(id));
CREATE POLICY "any user creates business" ON public.businesses FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "admins update business" ON public.businesses FOR UPDATE TO authenticated USING (public.is_business_admin(id)) WITH CHECK (public.is_business_admin(id));
CREATE POLICY "owner deletes business" ON public.businesses FOR DELETE TO authenticated USING (public.business_role(id) = 'owner');

-- USER_BUSINESSES RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_businesses TO authenticated;
GRANT ALL ON public.user_businesses TO service_role;
ALTER TABLE public.user_businesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own memberships" ON public.user_businesses FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_business_member(business_id));
CREATE POLICY "join or admin adds member" ON public.user_businesses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_business_admin(business_id));
CREATE POLICY "admins manage members" ON public.user_businesses FOR UPDATE TO authenticated
  USING (public.is_business_admin(business_id)) WITH CHECK (public.is_business_admin(business_id));
CREATE POLICY "admins remove members" ON public.user_businesses FOR DELETE TO authenticated
  USING (public.is_business_admin(business_id) OR user_id = auth.uid());

-- Generic business-scoped policies
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories','suppliers','customers','warehouses','products','inventory_movements',
    'purchase_orders','purchase_order_items','sales','sale_items','invoices','expenses','cash_transactions',
    'accounts_receivable','accounts_payable','employees','attendance','payroll','bill_of_materials','bom_items',
    'notifications','kpis']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "members read" ON public.%I FOR SELECT TO authenticated USING (public.is_business_member(business_id))', t);
    EXECUTE format('CREATE POLICY "members insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id))', t);
    EXECUTE format('CREATE POLICY "members update" ON public.%I FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id))', t);
    EXECUTE format('CREATE POLICY "members delete" ON public.%I FOR DELETE TO authenticated USING (public.can_write_business(business_id))', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_business ON public.%I(business_id)', t, t);
  END LOOP;
END $$;

-- AUDIT LOGS: append-only
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY "members write logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_business_member(business_id));

-- updated_at triggers
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','businesses','categories','suppliers','customers','warehouses','products',
    'purchase_orders','sales','invoices','expenses','accounts_receivable','accounts_payable','employees','payroll',
    'bill_of_materials','kpis']
  LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;
