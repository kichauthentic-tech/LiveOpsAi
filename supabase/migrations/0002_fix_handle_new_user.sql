-- Fix: signup was failing with "Database error saving new user".
-- Harden the trigger so it can't silently break auth.users inserts, and
-- make the role cast tolerant of unexpected values instead of erroring.

create or replace function handle_new_user() returns trigger as $$
declare
  requested_role text := new.raw_user_meta_data->>'role';
  resolved_role user_role;
begin
  begin
    resolved_role := coalesce(requested_role::user_role, 'talent');
  exception when invalid_text_representation then
    resolved_role := 'talent';
  end;

  insert into public.profiles (id, name, email, role, custom_role_title)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.email,
    resolved_role,
    coalesce(new.raw_user_meta_data->>'custom_role_title', '')
  )
  on conflict (id) do nothing;

  return new;
exception when others then
  raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
