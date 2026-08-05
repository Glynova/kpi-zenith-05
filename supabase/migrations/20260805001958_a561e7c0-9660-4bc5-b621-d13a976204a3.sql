
REVOKE ALL ON FUNCTION public.protect_supplier_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_po_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_doc_number(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_goods_receipt(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_purchase_return(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_terms_days(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_doc_number(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_purchase_return(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payment_terms_days(text) TO authenticated;
