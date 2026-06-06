
CREATE POLICY "auth_user_select_own_excel" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'excel-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "auth_user_insert_own_excel" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'excel-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "auth_user_delete_own_excel" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'excel-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
