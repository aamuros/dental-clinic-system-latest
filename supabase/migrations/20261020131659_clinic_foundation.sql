-- Foundation only: application data is read-only until audited write workflows exist.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create type public.staff_role as enum (
  'administrator', 'dentist', 'dental_assistant', 'receptionist', 'billing_staff'
);
create type public.appointment_status as enum ('scheduled', 'confirmed', 'completed', 'cancelled');

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  timezone text not null default 'Asia/Manila',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 160),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, clinic_id),
  unique (clinic_id, name)
);

create table public.staff_profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  display_name text not null check (length(trim(display_name)) between 1 and 160),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, clinic_id)
);
create index staff_profiles_clinic_idx on public.staff_profiles(clinic_id);

create table public.staff_role_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  branch_id uuid,
  role public.staff_role not null,
  created_at timestamptz not null default now(),
  foreign key (staff_id, clinic_id) references public.staff_profiles(id, clinic_id) on delete restrict,
  foreign key (branch_id, clinic_id) references public.branches(id, clinic_id) on delete restrict,
  -- Only an administrator can hold a clinic-wide assignment.
  check (branch_id is not null or role = 'administrator')
);
create unique index staff_roles_branch_unique on public.staff_role_assignments(staff_id, clinic_id, branch_id, role) where branch_id is not null;
create unique index staff_roles_clinic_unique on public.staff_role_assignments(staff_id, clinic_id, role) where branch_id is null;
create index staff_roles_clinic_idx on public.staff_role_assignments(clinic_id);
create index staff_roles_branch_idx on public.staff_role_assignments(branch_id);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  first_name text not null check (length(trim(first_name)) between 1 and 100),
  last_name text not null check (length(trim(last_name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, clinic_id)
);
create index patients_clinic_idx on public.patients(clinic_id);

-- An explicit link is required before any branch can access a patient's identity.
-- Clinical records will be separate tables with stricter permissions in later migrations.
create table public.patient_branch_access (
  patient_id uuid not null,
  branch_id uuid not null,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (patient_id, branch_id),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete restrict,
  foreign key (branch_id, clinic_id) references public.branches(id, clinic_id) on delete restrict
);
create index patient_access_branch_idx on public.patient_branch_access(branch_id);
create index patient_access_clinic_idx on public.patient_branch_access(clinic_id);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  branch_id uuid not null,
  patient_id uuid not null,
  dentist_staff_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (branch_id, clinic_id) references public.branches(id, clinic_id) on delete restrict,
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete restrict,
  foreign key (patient_id, branch_id) references public.patient_branch_access(patient_id, branch_id) on delete restrict,
  foreign key (dentist_staff_id, clinic_id) references public.staff_profiles(id, clinic_id) on delete restrict,
  check (ends_at > starts_at)
);
create index appointments_clinic_idx on public.appointments(clinic_id);
create index appointments_schedule_idx on public.appointments(branch_id, starts_at);
create index appointments_patient_idx on public.appointments(patient_id);
create index appointments_dentist_idx on public.appointments(dentist_staff_id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  branch_id uuid,
  actor_staff_id uuid not null,
  action text not null check (action ~ '^[a-z][a-z0-9_.]{2,80}$'),
  resource_type text not null check (length(resource_type) between 1 and 80),
  resource_id uuid,
  occurred_at timestamptz not null default now(),
  foreign key (branch_id, clinic_id) references public.branches(id, clinic_id) on delete restrict,
  foreign key (actor_staff_id, clinic_id) references public.staff_profiles(id, clinic_id) on delete restrict
);
create index audit_logs_clinic_time_idx on public.audit_logs(clinic_id, occurred_at desc);
create index audit_logs_branch_idx on public.audit_logs(branch_id);
create index audit_logs_actor_idx on public.audit_logs(actor_staff_id);

create function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['clinics', 'branches', 'staff_profiles', 'patients', 'appointments'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.touch_updated_at()', table_name);
  end loop;
end;
$$;

-- These helpers accept the requested scope, never a caller-supplied staff identity.
-- They live outside the exposed schema and avoid recursive membership policies.
create function private.has_role(p_clinic_id uuid, p_branch_id uuid, p_roles public.staff_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_profiles sp
    join public.staff_role_assignments ra on ra.staff_id = sp.id and ra.clinic_id = sp.clinic_id
    left join public.branches b on b.id = ra.branch_id and b.clinic_id = ra.clinic_id
    where sp.id = (select auth.uid()) and sp.is_active
      and sp.clinic_id = p_clinic_id and ra.role = any(p_roles)
      and (ra.branch_id is null or (ra.branch_id = p_branch_id and b.is_active))
  );
$$;

create function private.is_active_staff(p_clinic_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_profiles sp
    join public.staff_role_assignments ra on ra.staff_id = sp.id and ra.clinic_id = sp.clinic_id
    left join public.branches b on b.id = ra.branch_id and b.clinic_id = ra.clinic_id
    where sp.id = (select auth.uid()) and sp.is_active and sp.clinic_id = p_clinic_id
      and (ra.branch_id is null or b.is_active)
  );
$$;

create function private.can_access_patient(p_patient_id uuid, p_clinic_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.patient_branch_access pa
    join public.branches b on b.id = pa.branch_id and b.clinic_id = pa.clinic_id
    where pa.patient_id = p_patient_id and pa.clinic_id = p_clinic_id and b.is_active
      and private.has_role(pa.clinic_id, pa.branch_id, array[
        'administrator', 'dentist', 'dental_assistant', 'receptionist', 'billing_staff'
      ]::public.staff_role[])
  );
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_role(uuid, uuid, public.staff_role[]) to authenticated;
grant execute on function private.is_active_staff(uuid) to authenticated;
grant execute on function private.can_access_patient(uuid, uuid) to authenticated;

alter table public.clinics enable row level security;
alter table public.branches enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.staff_role_assignments enable row level security;
alter table public.patients enable row level security;
alter table public.patient_branch_access enable row level security;
alter table public.appointments enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.clinics, public.branches, public.staff_profiles,
  public.staff_role_assignments, public.patients, public.patient_branch_access,
  public.appointments, public.audit_logs from anon, authenticated;
grant select on table public.clinics, public.branches, public.staff_profiles,
  public.staff_role_assignments, public.patients, public.patient_branch_access,
  public.appointments, public.audit_logs to authenticated;
grant all on table public.clinics, public.branches, public.staff_profiles,
  public.staff_role_assignments, public.patients, public.patient_branch_access,
  public.appointments, public.audit_logs to service_role;

create policy clinics_read on public.clinics for select to authenticated
  using (private.is_active_staff(id));
create policy branches_read on public.branches for select to authenticated
  using (is_active and private.has_role(clinic_id, id, enum_range(null::public.staff_role)));
create policy staff_profiles_read on public.staff_profiles for select to authenticated
  using (id = (select auth.uid()) or private.has_role(clinic_id, null, array['administrator']::public.staff_role[]));
create policy staff_roles_read on public.staff_role_assignments for select to authenticated
  using ((staff_id = (select auth.uid()) and private.is_active_staff(clinic_id))
    or private.has_role(clinic_id, null, array['administrator']::public.staff_role[]));
create policy patients_read on public.patients for select to authenticated
  using (private.can_access_patient(id, clinic_id));
create policy patient_branch_access_read on public.patient_branch_access for select to authenticated
  using (private.has_role(clinic_id, branch_id, enum_range(null::public.staff_role)));
create policy appointments_read on public.appointments for select to authenticated
  using (private.has_role(clinic_id, branch_id, array[
    'administrator', 'dentist', 'dental_assistant', 'receptionist'
  ]::public.staff_role[]));
create policy audit_logs_read on public.audit_logs for select to authenticated
  using (private.has_role(clinic_id, null, array['administrator']::public.staff_role[]));

-- No Storage object policies: documents are private and inaccessible until an
-- authorized upload/download workflow and patient-linked policies are implemented.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patient-documents', 'patient-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png']);
