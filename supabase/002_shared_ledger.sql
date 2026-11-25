begin;

alter table public.trips add column if not exists ledger jsonb;
alter table public.trips add column if not exists revision bigint not null default 0;
alter table public.trip_members add column if not exists invite_email text;
alter table public.expenses add column if not exists lookup_status text
  check (lookup_status in ('pending', 'matched', 'choose', 'failed'));
alter table public.waivers add column if not exists payer_member_id uuid;
alter table public.waivers add constraint waivers_payer_in_trip
  foreign key (trip_id, payer_member_id) references public.trip_members(trip_id, id);

-- Compare-and-swap the ledger and update its relational projections in one transaction.
-- A failed revision comparison leaves every table untouched.
create or replace function public.splittrack_save_trip(snapshot jsonb, expected_revision bigint)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  trip_key uuid := (snapshot->>'id')::uuid;
  owner_key uuid := (snapshot->>'owner')::uuid;
  item jsonb;
begin
  if expected_revision is null then
    insert into public.trips (id, owner_user_id, name, destination_city, ledger, revision)
    values (trip_key, owner_key, snapshot->>'name', snapshot->>'city', snapshot, 1)
    on conflict (id) do nothing;
  else
    update public.trips
    set name = snapshot->>'name', destination_city = snapshot->>'city',
        ledger = snapshot, revision = revision + 1
    where id = trip_key and revision = expected_revision and owner_user_id = owner_key;
  end if;
  if not found then return false; end if;

  for item in select value from jsonb_array_elements(snapshot->'members') loop
    insert into public.trip_members (id, trip_id, user_id, display_name, invite_email)
    values ((item->>'id')::uuid, trip_key, (item->>'userId')::uuid, item->>'name', item->>'email')
    on conflict (id) do update
      set user_id = excluded.user_id, display_name = excluded.display_name, invite_email = excluded.invite_email;
  end loop;

  delete from public.trip_invites where trip_id = trip_key;
  for item in select value from jsonb_array_elements(snapshot->'invites') loop
    insert into public.trip_invites (trip_id, member_id, token_hash, expires_at, redeemed_at)
    values (trip_key, (item->>'memberId')::uuid, item->>'hash',
      (item->>'expiresAt')::timestamptz, (item->>'redeemedAt')::timestamptz);
  end loop;

  for item in select value from jsonb_array_elements(snapshot->'expenses') loop
    insert into public.expenses (
      id, trip_id, payer_member_id, created_by_user_id, description, category, expense_date,
      amount_paise, original_shares, effective_shares, venue, city, latitude, longitude, lookup_status, created_at
    ) values (
      (item->>'id')::uuid, trip_key, (item->>'payer')::uuid, (item->>'createdBy')::uuid,
      item->>'title', item->>'category', (item->>'date')::date, (item->>'amount')::bigint,
      coalesce(item->'originalShares', item->'shares'), item->'shares', item->>'venue', item->>'city',
      (item->'place'->>'latitude')::double precision, (item->'place'->>'longitude')::double precision, item->>'lookup',
      (item->>'createdAt')::timestamptz
    )
    on conflict (id) do update set payer_member_id = excluded.payer_member_id, description = excluded.description,
      category = excluded.category, expense_date = excluded.expense_date, amount_paise = excluded.amount_paise,
      original_shares = excluded.original_shares, effective_shares = excluded.effective_shares,
      venue = excluded.venue, city = excluded.city, latitude = excluded.latitude, longitude = excluded.longitude,
      lookup_status = excluded.lookup_status;
  end loop;

  for item in select value from jsonb_array_elements(snapshot->'waivers') loop
    insert into public.waivers (trip_id, expense_id, waived_member_id, payer_member_id, amount_paise, created_at)
    values (trip_key, (item->>'expenseId')::uuid, (item->>'member')::uuid, (item->>'payer')::uuid,
      (item->>'amount')::bigint, (item->>'date')::timestamptz)
    on conflict (expense_id, waived_member_id) do nothing;
  end loop;

  for item in select value from jsonb_array_elements(snapshot->'payments') loop
    insert into public.settlements (id, trip_id, from_member_id, to_member_id, amount_paise, payment_date, recorded_by)
    values ((item->>'id')::uuid, trip_key, (item->>'from')::uuid, (item->>'to')::uuid,
      (item->>'amount')::bigint, left(item->>'date', 10)::date, (item->>'recordedBy')::uuid)
    on conflict (id) do nothing;
  end loop;
  return true;
end;
$$;

revoke execute on function public.splittrack_save_trip(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.splittrack_save_trip(jsonb, bigint) to service_role;
grant select, insert, update on public.trips, public.trip_members, public.expenses,
  public.waivers, public.settlements, public.profiles to service_role;
grant select, insert, delete on public.trip_invites to service_role;
commit;


