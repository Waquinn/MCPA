-- Run after the existing profiles table is installed. No new tables or role changes.
-- Only an authenticated caller's own display name can change through this function.
begin;
create or replace function public.settings_update_profile(p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to update your profile' using errcode = '42501'; end if;
  p_name := regexp_replace(btrim(p_name), '\s+', ' ', 'g');
  if p_name is null or char_length(p_name) not between 1 and 120 then
    raise exception 'A name between 1 and 120 characters is required' using errcode = '23514';
  end if;
  update public.profiles set name = p_name where id = auth.uid()
    returning jsonb_build_object('id', id, 'name', name) into saved;
  if saved is null then raise exception 'A linked profile is required' using errcode = '42501'; end if;
  return saved;
end;
$$;
revoke all on function public.settings_update_profile(text) from public, anon;
grant execute on function public.settings_update_profile(text) to authenticated;
notify pgrst, 'reload schema';
commit;
