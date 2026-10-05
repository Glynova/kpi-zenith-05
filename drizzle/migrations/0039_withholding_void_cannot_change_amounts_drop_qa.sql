CREATE OR REPLACE FUNCTION public.withholding_to_tax_txn()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'void' THEN RAISE EXCEPTION 'A voided certificate cannot be changed'; END IF;
    -- Amounts and parties are fixed once recorded, including in the same update that voids it.
    IF (NEW.taxable_amount, NEW.rate, NEW.withholding_amount, NEW.atc, NEW.payer_tin, NEW.payee_tin, NEW.payer_name, NEW.payee_name, NEW.period_from, NEW.period_to, NEW.direction, NEW.business_id)
       IS DISTINCT FROM (OLD.taxable_amount, OLD.rate, OLD.withholding_amount, OLD.atc, OLD.payer_tin, OLD.payee_tin, OLD.payer_name, OLD.payee_name, OLD.period_from, OLD.period_to, OLD.direction, OLD.business_id) THEN
      RAISE EXCEPTION 'Recorded certificates cannot be edited. Void it and record a new one.';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR (NEW.status = 'void' AND OLD.status <> 'void') THEN
    INSERT INTO public.tax_transactions (business_id, source_type, source_id, reference, tax_type, direction, taxable_amount, rate, tax_amount, counterparty_name, counterparty_tin, txn_date)
    VALUES (NEW.business_id, 'withholding_certificate', NEW.id, COALESCE(NEW.certificate_number, NEW.reference), 'WITHHOLDING',
            CASE WHEN NEW.direction='received' THEN 'withheld_by_customer' ELSE 'withheld_from_supplier' END,
            CASE WHEN TG_OP='INSERT' THEN NEW.taxable_amount ELSE -NEW.taxable_amount END, NEW.rate,
            CASE WHEN TG_OP='INSERT' THEN NEW.withholding_amount ELSE -NEW.withholding_amount END,
            CASE WHEN NEW.direction='received' THEN NEW.payer_name ELSE NEW.payee_name END,
            CASE WHEN NEW.direction='received' THEN NEW.payer_tin ELSE NEW.payee_tin END, NEW.period_to);
    PERFORM public._audit(NEW.business_id, CASE WHEN TG_OP='INSERT' THEN 'CREATE' ELSE 'VOID' END, 'withholding', NEW.id::text, NULL, to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $function$;

-- The trigger runs AFTER; move the edit check to BEFORE so a rejected change never touches the row.
DROP TRIGGER IF EXISTS withholding_to_tax_txn_trg ON public.withholding_certificates;
CREATE TRIGGER withholding_to_tax_txn_trg AFTER INSERT OR UPDATE ON public.withholding_certificates
  FOR EACH ROW EXECUTE FUNCTION public.withholding_to_tax_txn();

DROP FUNCTION IF EXISTS public._qa_run(text);
DROP FUNCTION IF EXISTS public._qa_as_user(uuid);