
create policy "product images readable by business members"
on storage.objects for select to authenticated
using (bucket_id = 'product-images' and public.is_business_member((storage.foldername(name))[1]::uuid));

create policy "product images insertable by business writers"
on storage.objects for insert to authenticated
with check (bucket_id = 'product-images' and public.can_write_business((storage.foldername(name))[1]::uuid));

create policy "product images updatable by business writers"
on storage.objects for update to authenticated
using (bucket_id = 'product-images' and public.can_write_business((storage.foldername(name))[1]::uuid))
with check (bucket_id = 'product-images' and public.can_write_business((storage.foldername(name))[1]::uuid));

create policy "product images deletable by business writers"
on storage.objects for delete to authenticated
using (bucket_id = 'product-images' and public.can_write_business((storage.foldername(name))[1]::uuid));
