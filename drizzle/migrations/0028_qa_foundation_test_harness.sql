
CREATE OR REPLACE FUNCTION public._qa_as_user(u uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true),
         set_config('request.jwt.claim.sub', u::text, true); $f$;
REVOKE ALL ON FUNCTION public._qa_as_user(uuid) FROM PUBLIC, anon, authenticated;

-- Test harness: runs scenarios on two throwaway businesses then raises to roll everything back.
CREATE OR REPLACE FUNCTION public._qa_foundation_test() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $q$
DECLARE res json; u1 uuid := '1d24f7e4-fd82-4a75-895e-7d86845de017'; u2 uuid := '31a3db30-99b7-4bec-b7ca-12f5fc4e8a45';
  b1 uuid; b2 uuid; w1 uuid; w2 uuid; p uuid; pv uuid; v1 uuid; v2 uuid; v3 uuid; s uuid; s2 uuid; cust uuid; cnt int; x numeric; y numeric; t text; ok boolean;
  ret uuid; tr uuid; zid uuid;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS r(name text, result text, detail text) ON COMMIT DROP;
  PERFORM public._qa_as_user(u1);
  INSERT INTO businesses(name, created_by) VALUES ('ZZ Test Biz One', u1) RETURNING id INTO b1;
  PERFORM public._qa_as_user(u2);
  INSERT INTO businesses(name, created_by) VALUES ('ZZ Test Biz Two', u2) RETURNING id INTO b2;
  PERFORM public._qa_as_user(u1);
  SELECT id INTO w1 FROM warehouses WHERE business_id=b1 LIMIT 1;
  IF w1 IS NULL THEN INSERT INTO warehouses(business_id,name) VALUES (b1,'Main') RETURNING id INTO w1; END IF;
  UPDATE business_settings SET costing_method='fifo', allow_negative_stock=false, enable_customer_credit=true, enable_stock_transfers=true, enable_returns=true WHERE business_id=b1;

  SELECT NOT is_vat_registered INTO ok FROM business_compliance WHERE business_id=b1;
  INSERT INTO r VALUES ('compliance default non-VAT', CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, '');

  -- C. FIFO
  INSERT INTO products(business_id,name,sku,unit,track_stock,costing_method,selling_price,cost_price) VALUES (b1,'FIFO Widget','ZZ-FIFO','pcs',true,'fifo',100,50) RETURNING id INTO p;
  INSERT INTO inventory_movements(business_id,product_id,warehouse_id,type,quantity,base_quantity,unit,unit_cost,total_cost,reference_type,movement_date) VALUES (b1,p,w1,'purchase',100,100,'pcs',50,5000,'test',current_date);
  INSERT INTO inventory_movements(business_id,product_id,warehouse_id,type,quantity,base_quantity,unit,unit_cost,total_cost,reference_type,movement_date) VALUES (b1,p,w1,'purchase',100,100,'pcs',60,6000,'test',current_date);
  INSERT INTO sales(business_id,document_type,status,sale_date,subtotal,total,location_id,payment_status) VALUES (b1,'sale','draft',current_date,15000,15000,w1,'unpaid') RETURNING id INTO s;
  INSERT INTO sale_items(business_id,sale_id,product_id,product_name,quantity,unit_price,total,unit) VALUES (b1,s,p,'FIFO Widget',150,100,15000,'pcs');
  INSERT INTO sale_payments(business_id,sale_id,method,amount) VALUES (b1,s,'cash',15000);
  PERFORM complete_sale(s);
  SELECT cost_total INTO x FROM sales WHERE id=s;
  SELECT string_agg(remaining_quantity||'@'||unit_cost, ',') INTO t FROM inventory_cost_layers WHERE product_id=p AND remaining_quantity>0;
  INSERT INTO r VALUES ('C FIFO COGS 8000 / remaining 50@60', CASE WHEN x=8000 AND t ~ '^50(\.0+)?@60' THEN 'PASS' ELSE 'FAIL' END, 'cogs='||x||' layers='||coalesce(t,'none'));
  SELECT unit_cost INTO y FROM sale_items WHERE sale_id=s;
  INSERT INTO r VALUES ('C line COGS snapshot', CASE WHEN round(y*150,2)=8000 THEN 'PASS' ELSE 'FAIL' END, 'unit_cost='||y);

  INSERT INTO sales(business_id,document_type,status,sale_date,subtotal,total,location_id) VALUES (b1,'sale','draft',current_date,10000,10000,w1) RETURNING id INTO s2;
  INSERT INTO sale_items(business_id,sale_id,product_id,product_name,quantity,unit_price,total,unit) VALUES (b1,s2,p,'FIFO Widget',100,100,10000,'pcs');
  BEGIN PERFORM complete_sale(s2); INSERT INTO r VALUES ('negative stock blocked','FAIL','sale of 100 with 50 on hand posted');
  EXCEPTION WHEN others THEN INSERT INTO r VALUES ('negative stock blocked','PASS',SQLERRM); END;

  -- D. AVCO
  UPDATE business_settings SET costing_method='weighted_average' WHERE business_id=b1;
  INSERT INTO products(business_id,name,sku,unit,track_stock,costing_method,selling_price) VALUES (b1,'AVCO Widget','ZZ-AVCO','pcs',true,'weighted_average',100) RETURNING id INTO p;
  INSERT INTO inventory_movements(business_id,product_id,warehouse_id,type,quantity,base_quantity,unit,unit_cost,total_cost,reference_type,movement_date) VALUES (b1,p,w1,'purchase',100,100,'pcs',50,5000,'test',current_date);
  INSERT INTO inventory_movements(business_id,product_id,warehouse_id,type,quantity,base_quantity,unit,unit_cost,total_cost,reference_type,movement_date) VALUES (b1,p,w1,'purchase',100,100,'pcs',60,6000,'test',current_date);
  SELECT average_cost INTO y FROM inventory_balances WHERE product_id=p AND warehouse_id=w1;
  INSERT INTO sales(business_id,document_type,status,sale_date,subtotal,total,location_id) VALUES (b1,'sale','draft',current_date,15000,15000,w1) RETURNING id INTO s2;
  INSERT INTO sale_items(business_id,sale_id,product_id,product_name,quantity,unit_price,total,unit) VALUES (b1,s2,p,'AVCO Widget',150,100,15000,'pcs');
  INSERT INTO sale_payments(business_id,sale_id,method,amount) VALUES (b1,s2,'cash',15000);
  PERFORM complete_sale(s2);
  SELECT cost_total INTO x FROM sales WHERE id=s2;
  INSERT INTO r VALUES ('D AVCO avg 55, COGS 8250', CASE WHEN y=55 AND x=8250 THEN 'PASS' ELSE 'FAIL' END, 'avg='||y||' cogs='||x);

  -- B. variants
  INSERT INTO products(business_id,name,sku,unit,track_stock,has_variants,selling_price) VALUES (b1,'Tee','ZZ-TEE','pcs',true,true,300) RETURNING id INTO pv;
  INSERT INTO product_variants(business_id,product_id,name,sku,cost_price,selling_price) VALUES (b1,pv,'S','ZZ-TEE-S',100,300) RETURNING id INTO v1;
  INSERT INTO product_variants(business_id,product_id,name,sku,cost_price,selling_price) VALUES (b1,pv,'M','ZZ-TEE-M',110,320) RETURNING id INTO v2;
  INSERT INTO product_variants(business_id,product_id,name,sku,cost_price,selling_price) VALUES (b1,pv,'L','ZZ-TEE-L',120,340) RETURNING id INTO v3;
  INSERT INTO inventory_movements(business_id,product_id,variant_id,warehouse_id,type,quantity,base_quantity,unit,unit_cost,total_cost,reference_type,movement_date) VALUES
   (b1,pv,v1,w1,'purchase',10,10,'pcs',100,1000,'test',current_date),(b1,pv,v2,w1,'purchase',20,20,'pcs',110,2200,'test',current_date),(b1,pv,v3,w1,'purchase',30,30,'pcs',120,3600,'test',current_date);
  SELECT string_agg(v.name||'='||b.quantity||'@'||b.average_cost, ',' ORDER BY v.name) INTO t FROM inventory_balances b JOIN product_variants v ON v.id=b.variant_id WHERE b.product_id=pv;
  SELECT count(*) INTO cnt FROM inventory_balances WHERE product_id=pv AND variant_id IS NULL AND quantity<>0;
  INSERT INTO r VALUES ('B 3 variants separate stock/cost', CASE WHEN t ~ 'L=30.*@120.*M=20.*@110.*S=10.*@100' AND cnt=0 THEN 'PASS' ELSE 'FAIL' END, coalesce(t,'none')||' parent_rows='||cnt);

  -- F. AR
  INSERT INTO customers(business_id,name,credit_limit,tax_id) VALUES (b1,'ZZ Credit Co',100000,'123-456-789-000') RETURNING id INTO cust;
  INSERT INTO sales(business_id,document_type,status,sale_date,subtotal,total,location_id,customer_id,due_date) VALUES (b1,'sale','draft',current_date-45,3000,3000,w1,cust,current_date-40) RETURNING id INTO s2;
  INSERT INTO sale_items(business_id,sale_id,product_id,product_name,quantity,unit_price,total,unit,variant_id) VALUES (b1,s2,pv,'Tee',10,300,3000,'pcs',v1);
  PERFORM complete_sale(s2);
  UPDATE accounts_receivable SET due_date=current_date-40 WHERE sale_id=s2;
  INSERT INTO invoices(business_id,sale_id,customer_id,invoice_number,status,issue_date,due_date,subtotal,total,paid) VALUES (b1,s2,cust,'CLIENT-PICKED','unpaid',current_date-45,current_date-40,3000,3000,0);
  INSERT INTO sale_payments(business_id,sale_id,method,amount) VALUES (b1,s2,'cash',1000);
  SELECT amount-paid INTO x FROM accounts_receivable WHERE sale_id=s2;
  SELECT d31_60 INTO y FROM ar_aging(b1, current_date) WHERE customer_id=cust;
  INSERT INTO r VALUES ('F AR balance 2000 in 31-60 bucket', CASE WHEN x=2000 AND y=2000 THEN 'PASS' ELSE 'FAIL' END, 'bal='||coalesce(x::text,'null')||' bucket31_60='||coalesce(y::text,'null'));
  SELECT d1_30 INTO y FROM ar_aging(b1, current_date-15) WHERE customer_id=cust;
  INSERT INTO r VALUES ('F aging uses As Of date', CASE WHEN y=2000 THEN 'PASS' ELSE 'FAIL' END, 'as_of-15 bucket1_30='||coalesce(y::text,'null'));
  SELECT invoice_number INTO t FROM invoices WHERE sale_id=s2;
  INSERT INTO r VALUES ('invoice number assigned by server', CASE WHEN t ~ '^INV-\d{4}-\d{6}$' THEN 'PASS' ELSE 'FAIL' END, t);
  BEGIN INSERT INTO sale_payments(business_id,sale_id,method,amount) VALUES (b1,s2,'cash',5000); INSERT INTO r VALUES ('overpayment blocked','FAIL','');
  EXCEPTION WHEN others THEN INSERT INTO r VALUES ('overpayment blocked','PASS',SQLERRM); END;

  BEGIN UPDATE sales SET total=1 WHERE id=s; INSERT INTO r VALUES ('posted sale money locked','FAIL','');
  EXCEPTION WHEN others THEN INSERT INTO r VALUES ('posted sale money locked','PASS',SQLERRM); END;
  BEGIN DELETE FROM sales WHERE id=s; INSERT INTO r VALUES ('posted sale delete blocked','FAIL','');
  EXCEPTION WHEN others THEN INSERT INTO r VALUES ('posted sale delete blocked','PASS',SQLERRM); END;
  BEGIN DELETE FROM invoices WHERE sale_id=s2; INSERT INTO r VALUES ('invoice delete blocked','FAIL','');
  EXCEPTION WHEN others THEN INSERT INTO r VALUES ('invoice delete blocked','PASS',SQLERRM); END;

  -- G. void
  SELECT quantity INTO x FROM inventory_balances WHERE product_id=pv AND variant_id=v1 AND warehouse_id=w1;
  PERFORM void_sale(s2, 'Customer cancelled');
  SELECT quantity INTO y FROM inventory_balances WHERE product_id=pv AND variant_id=v1 AND warehouse_id=w1;
  SELECT (status='voided' AND total=3000 AND sale_number IS NOT NULL) INTO ok FROM sales WHERE id=s2;
  SELECT count(*) INTO cnt FROM inventory_movements WHERE reference_type='sale_void' AND reference_id=s2;
  INSERT INTO r VALUES ('G void preserves original + reversal', CASE WHEN ok AND cnt=1 AND y=x+10 THEN 'PASS' ELSE 'FAIL' END, 'stock '||x||'->'||y||' reversal_rows='||cnt);
  SELECT document_status INTO t FROM invoices WHERE sale_id=s2;
  INSERT INTO r VALUES ('G invoice marked void', CASE WHEN t='void' THEN 'PASS' ELSE 'FAIL' END, t);

  -- H. refund
  INSERT INTO sales(business_id,document_type,status,sale_date,subtotal,total,location_id,original_sale_id) VALUES (b1,'return','draft',current_date,1000,1000,w1,s) RETURNING id INTO ret;
  INSERT INTO sale_items(business_id,sale_id,product_id,product_name,quantity,unit_price,total,unit,unit_cost,condition) SELECT b1,ret,product_id,product_name,10,100,1000,'pcs',unit_cost,'resellable' FROM sale_items WHERE sale_id=s;
  PERFORM post_sales_return(ret);
  INSERT INTO sale_payments(business_id,sale_id,method,amount,is_refund) VALUES (b1,s,'cash',1000,true);
  SELECT quantity INTO y FROM inventory_balances WHERE product_id=(SELECT product_id FROM sale_items WHERE sale_id=s) AND warehouse_id=w1 AND variant_id IS NULL;
  SELECT (total=15000 AND cost_total=8000) INTO ok FROM sales WHERE id=s;
  SELECT cost_total INTO x FROM sales WHERE id=ret;
  INSERT INTO r VALUES ('H refund: original kept, stock + cost reversed', CASE WHEN ok AND y=60 AND x<0 THEN 'PASS' ELSE 'FAIL' END, 'stock now='||y||' return cost_total='||x);

  -- I. numbering
  FOR cnt IN 1..50 LOOP INSERT INTO sales(business_id,document_type,status,sale_date,subtotal,total,sale_number) VALUES (b1,'quote','draft',current_date,0,0,'SO-000001'); END LOOP;
  SELECT count(*), count(DISTINCT sale_number) INTO cnt, x FROM sales WHERE business_id=b1;
  INSERT INTO r VALUES ('I numbering unique', CASE WHEN cnt=x THEN 'PASS' ELSE 'FAIL' END, cnt||' sales, '||x||' distinct numbers');

  -- J. transfer
  PERFORM public._qa_as_user(u2);
  SELECT id INTO w2 FROM warehouses WHERE business_id=b2 LIMIT 1;
  IF w2 IS NULL THEN INSERT INTO warehouses(business_id,name) VALUES (b2,'Main2') RETURNING id INTO w2; END IF;
  UPDATE business_settings SET enable_stock_transfers=true WHERE business_id=b2;
  INSERT INTO user_businesses(user_id,business_id,role) VALUES (u1,b2,'manager');
  PERFORM public._qa_as_user(u1);
  SELECT product_id INTO p FROM sale_items WHERE sale_id=s;
  tr := create_stock_transfer(b1, w1, b2, w2, jsonb_build_array(jsonb_build_object('product_id',p,'quantity',5)), 'test');
  SELECT count(*) INTO cnt FROM notifications WHERE business_id=b2;
  SELECT COALESCE(sum(quantity),0) INTO x FROM inventory_balances WHERE business_id=b2;
  SELECT status INTO t FROM stock_transfers WHERE id=tr;
  INSERT INTO r VALUES ('J transfer pending, dest notified, no dest stock yet', CASE WHEN cnt>=1 AND x=0 THEN 'PASS' ELSE 'FAIL' END, 'status='||t||' notifs='||cnt||' dest_qty='||x);
  PERFORM public._qa_as_user(u2);
  PERFORM receive_stock_transfer(tr, NULL);
  SELECT COALESCE(sum(quantity),0), COALESCE(max(average_cost),0) INTO x, y FROM inventory_balances WHERE business_id=b2;
  INSERT INTO r VALUES ('J after confirm: dest stock + cost basis', CASE WHEN x=5 AND y=60 THEN 'PASS' ELSE 'FAIL' END, 'dest_qty='||x||' dest_cost='||y);

  -- M. Z reading
  PERFORM public._qa_as_user(u1);
  zid := close_day_z(b1, current_date, NULL);
  SELECT net_sales INTO x FROM z_readings WHERE id=zid;
  SELECT COALESCE((SELECT sum(total) FROM sales WHERE business_id=b1 AND inventory_posted AND sale_date=current_date AND status<>'voided' AND document_type='sale'),0)
       - COALESCE((SELECT sum(total) FROM sales WHERE business_id=b1 AND inventory_posted AND sale_date=current_date AND status<>'voided' AND document_type='return'),0) INTO y;
  SELECT 'z#'||z_number||' gt '||beginning_grand_total||'->'||ending_grand_total||' refunds '||refunds||' pay '||payment_totals::text INTO t FROM z_readings WHERE id=zid;
  INSERT INTO r VALUES ('M Z net reconciles with posted sales', CASE WHEN x=y THEN 'PASS' ELSE 'FAIL' END, 'z_net='||x||' sales_net='||y||' '||t);
  BEGIN UPDATE z_readings SET net_sales=0 WHERE id=zid; INSERT INTO r VALUES ('M Z immutable','FAIL','');
  EXCEPTION WHEN others THEN INSERT INTO r VALUES ('M Z immutable','PASS',SQLERRM); END;
  BEGIN PERFORM close_day_z(b1, current_date, NULL); INSERT INTO r VALUES ('M duplicate close blocked','FAIL','');
  EXCEPTION WHEN others THEN INSERT INTO r VALUES ('M duplicate close blocked','PASS',SQLERRM); END;

  -- K. audit
  SELECT string_agg(DISTINCT action, ',' ORDER BY action) INTO t FROM audit_logs WHERE business_id=b1;
  INSERT INTO r VALUES ('K audit actions recorded', CASE WHEN t ~ 'POST' AND t ~ 'VOID' AND t ~ 'REFUND' AND t ~ 'PAYMENT' AND t ~ 'TRANSFER' AND t ~ 'Z_CLOSE' AND t ~ 'SETTINGS_CHANGE' THEN 'PASS' ELSE 'FAIL' END, t);

  -- E. unit conversion off
  UPDATE business_settings SET enable_unit_conversion=false WHERE business_id=b2;
  PERFORM public._qa_as_user(u2);
  BEGIN INSERT INTO unit_conversions(business_id,from_unit,to_unit,factor) VALUES (b2,'box','pcs',12); INSERT INTO r VALUES ('E unit conversion blocked when off','FAIL','');
  EXCEPTION WHEN others THEN INSERT INTO r VALUES ('E unit conversion blocked when off', CASE WHEN SQLERRM ~* 'unit conversion' THEN 'PASS' ELSE 'CHECK' END, SQLERRM); END;

  -- L. cross-business RPC refusal
  BEGIN PERFORM void_sale(s, 'cross tenant'); INSERT INTO r VALUES ('L cross-business void refused','FAIL','');
  EXCEPTION WHEN others THEN INSERT INTO r VALUES ('L cross-business void refused','PASS',SQLERRM); END;
  SELECT count(*) INTO cnt FROM ar_aging(b1, current_date);
  INSERT INTO r VALUES ('L ar_aging hides other business', CASE WHEN cnt=0 THEN 'PASS' ELSE 'FAIL' END, cnt||' rows');
  BEGIN PERFORM z_reading_preview(b1, current_date, NULL); INSERT INTO r VALUES ('L z preview refused for non-member','FAIL','');
  EXCEPTION WHEN others THEN INSERT INTO r VALUES ('L z preview refused for non-member','PASS',SQLERRM); END;

  SELECT json_agg(r) INTO res FROM r;
  RAISE EXCEPTION 'QA_RESULTS %', res;
END $q$;
REVOKE ALL ON FUNCTION public._qa_foundation_test() FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public._qa_foundation_test() TO sandbox_exec';
  END IF;
END $$;
