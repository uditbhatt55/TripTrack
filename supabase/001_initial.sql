begin;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  upi_id text,
  qr_storage_path text
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 100),
  destination_city text,
  created_at timestamptz not null default now()
);

create table public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid references auth.users(id),
  display_name text not null check (length(trim(display_name)) between 1 and 100),
  unique (trip_id, id),
  unique (trip_id, user_id)
);

create table public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null,
  member_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  foreign key (trip_id, member_id) references public.trip_members(trip_id, id) on delete cascade
);

create table public.expenses (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  payer_member_id uuid not null,
  created_by_user_id uuid not null references auth.users(id),
  description text not null,
  category text not null,
  expense_date date not null,
  amount_paise bigint not null check (amount_paise between 1 and 100000000),
  original_shares jsonb not null check (jsonb_typeof(original_shares) = 'object'),
  effective_shares jsonb not null check (jsonb_typeof(effective_shares) = 'object'),
  venue text,
  city text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  check ((latitude is null) = (longitude is null)),
  created_at timestamptz not null default now(),
  unique (trip_id, id),
  foreign key (trip_id, payer_member_id) references public.trip_members(trip_id, id)
);

create table public.waivers (
  trip_id uuid not null,
  expense_id uuid not null,
  waived_member_id uuid not null,
  amount_paise bigint not null check (amount_paise between 1 and 100000000),
  created_at timestamptz not null default now(),
  primary key (expense_id, waived_member_id),
  foreign key (trip_id, expense_id) references public.expenses(trip_id, id) on delete cascade,
  foreign key (trip_id, waived_member_id) references public.trip_members(trip_id, id)
);

create table public.settlements (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  from_member_id uuid not null,
  to_member_id uuid not null,
  amount_paise bigint not null check (amount_paise between 1 and 100000000),
  payment_date date not null,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (from_member_id <> to_member_id),
  foreign key (trip_id, from_member_id) references public.trip_members(trip_id, id),
  foreign key (trip_id, to_member_id) references public.trip_members(trip_id, id)
);

create index expenses_trip_date_idx on public.expenses(trip_id, expense_date);
create index settlements_trip_idx on public.settlements(trip_id);
create index memberships_user_idx on public.trip_members(user_id);

-- The planned API is the data access boundary. Browser roles receive no data policies.
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_invites enable row level security;
alter table public.expenses enable row level security;
alter table public.waivers enable row level security;
alter table public.settlements enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('upi-qr', 'upi-qr', false, 2097152, array['image/png', 'image/jpeg']);

commit;
