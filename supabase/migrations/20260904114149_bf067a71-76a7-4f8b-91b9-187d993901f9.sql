revoke all on function public.close_register(uuid, numeric, text) from public, anon;
grant execute on function public.close_register(uuid, numeric, text) to authenticated;
revoke all on function public.complete_sale(uuid) from public, anon;
grant execute on function public.complete_sale(uuid) to authenticated;
revoke all on function public.post_sales_return(uuid) from public, anon;
grant execute on function public.post_sales_return(uuid) to authenticated;
revoke all on function public.current_partner_id() from public, anon;
grant execute on function public.current_partner_id() to authenticated;
