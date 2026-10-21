-- Additive appointment workflow. No patient, staff, or existing authorization policies change.
create extension if not exists btree_gist with schema extensions;

-- NOT VALID preserves legacy rows, while enforcing these rules on all new writes.
alter table public.appointments
  add constraint appointments_dentist_required check (dentist_staff_id is not null) not valid,
  add constraint appointments_duration check (ends_at - starts_at between interval '5 minutes' and interval '8 hours') not valid;
-- Half-open ranges allow adjacent visits; completed visits still occupy their time.
-- GiST exclusion checks serialize concurrent conflicting inserts and updates across branches.
-- Existing conflicting legacy appointments must be resolved explicitly before deployment.
alter table public.appointments add constraint appointments_dentist_no_overlap
  exclude using gist (dentist_staff_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (status <> 'cancelled' and dentist_staff_id is not null);
create index appointments_clinic_start_idx on public.appointments(clinic_id, starts_at, id);

create function private.touch_appointment_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
drop trigger set_updated_at on public.appointments;
create trigger set_updated_at before update on public.appointments
  for each row execute function private.touch_appointment_updated_at();

create function private.save_appointment(
  p_branch uuid, p_patient uuid, p_dentist uuid, p_start timestamptz,
  p_duration integer, p_status public.appointment_status,
  p_id uuid default null, p_expected_updated_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_clinic uuid;
  v_id uuid := p_id;
  v_old public.appointments%rowtype;
  v_end timestamptz;
  v_schedule_changed boolean;
  v_previous_dentist uuid;
  v_lock_key bigint;
  v_roles public.staff_role[] := array['administrator', 'dentist', 'receptionist']::public.staff_role[];
begin
  select clinic_id into v_clinic from public.staff_profiles where id = v_actor and is_active;
  if v_clinic is null or p_branch is null or not private.has_role(v_clinic, p_branch, v_roles)
    or not exists(select 1 from public.branches where id = p_branch and clinic_id = v_clinic and is_active) then
    raise exception 'Access denied.' using errcode = '42501';
  end if;
  -- Acquire dentist locks before any appointment row lock. Serializing each
  -- affected dentist avoids mutual waits inside concurrent GiST exclusion checks.
  -- Sort both old/new keys so simultaneous dentist swaps use the same lock order.
  select dentist_staff_id into v_previous_dentist from public.appointments
    where id = v_id and clinic_id = v_clinic
      and private.has_role(v_clinic, branch_id, v_roles);
  for v_lock_key in
    select distinct hashtextextended(dentist_id::text, 20261021)
    from unnest(array[p_dentist, v_previous_dentist]) as dentists(dentist_id)
    where dentist_id is not null order by 1
  loop
    perform pg_advisory_xact_lock(v_lock_key);
  end loop;
  if v_id is not null then
    select * into v_old from public.appointments where id = v_id and clinic_id = v_clinic for update;
    if not found or not private.has_role(v_clinic, v_old.branch_id, v_roles) then
      raise exception 'Appointment unavailable or access denied.' using errcode = '42501';
    end if;
    if p_expected_updated_at is null or v_old.updated_at <> p_expected_updated_at then
      raise exception 'Appointment changed. Reload before editing.' using errcode = 'PT409';
    end if;
    if v_old.status in ('completed', 'cancelled') then
      raise exception 'Terminal appointments cannot be changed.' using errcode = '22023';
    end if;
  elsif p_status is distinct from 'scheduled'::public.appointment_status then
    raise exception 'New appointments must be scheduled.' using errcode = '22023';
  end if;
  if p_start is null or not isfinite(p_start) or p_duration is null or p_duration not between 5 and 480 or p_status is null then
    raise exception 'Invalid schedule.' using errcode = '22023';
  end if;
  v_end := p_start + make_interval(mins => p_duration);
  v_schedule_changed := v_id is null or (v_old.branch_id, v_old.patient_id, v_old.dentist_staff_id, v_old.starts_at, v_old.ends_at)
    is distinct from (p_branch, p_patient, p_dentist, p_start, v_end);
  if (v_schedule_changed and p_start <= clock_timestamp())
    or (p_status = 'completed' and p_start > clock_timestamp())
    or (v_id is not null and v_schedule_changed and p_status in ('completed', 'cancelled'))
    or (v_old.status = 'confirmed' and p_status = 'scheduled' and not v_schedule_changed) then
    raise exception 'Invalid appointment time or status transition.' using errcode = '22023';
  end if;
  -- Lock the referenced records through commit so branch/patient/dentist access
  -- cannot disappear during booking. Identity and clinic always come from auth.
  perform 1 from public.patient_branch_access pa join public.patients p on p.id = pa.patient_id and p.clinic_id = pa.clinic_id
    where pa.patient_id = p_patient and pa.branch_id = p_branch and pa.clinic_id = v_clinic for share of pa, p;
  if not found then
    raise exception 'Patient unavailable at this branch.' using errcode = '42501';
  end if;
  perform 1 from public.staff_profiles sp join public.staff_role_assignments ra on ra.staff_id = sp.id and ra.clinic_id = sp.clinic_id
    join public.branches b on b.id = ra.branch_id and b.clinic_id = ra.clinic_id
    where sp.id = p_dentist and sp.clinic_id = v_clinic and sp.is_active and ra.role = 'dentist'
      and ra.branch_id = p_branch and b.is_active for share of sp, ra, b;
  if not found then
    raise exception 'Dentist unavailable at this branch.' using errcode = '42501';
  end if;
  if v_id is null then
    insert into public.appointments(clinic_id, branch_id, patient_id, dentist_staff_id, starts_at, ends_at, status)
      values(v_clinic, p_branch, p_patient, p_dentist, p_start, v_end, p_status) returning id into v_id;
    insert into public.audit_logs(clinic_id, branch_id, actor_staff_id, action, resource_type, resource_id)
      values(v_clinic, p_branch, v_actor, 'appointment.created', 'appointment', v_id);
  else
    update public.appointments set branch_id = p_branch, patient_id = p_patient, dentist_staff_id = p_dentist,
      starts_at = p_start, ends_at = v_end, status = p_status where id = v_id;
    insert into public.audit_logs(clinic_id, branch_id, actor_staff_id, action, resource_type, resource_id)
      values(v_clinic, p_branch, v_actor, 'appointment.updated', 'appointment', v_id);
    if v_schedule_changed then
      insert into public.audit_logs(clinic_id, branch_id, actor_staff_id, action, resource_type, resource_id)
        values(v_clinic, p_branch, v_actor, 'appointment.rescheduled', 'appointment', v_id);
    end if;
    if v_old.branch_id <> p_branch then
      insert into public.audit_logs(clinic_id, branch_id, actor_staff_id, action, resource_type, resource_id)
        values(v_clinic, v_old.branch_id, v_actor, 'appointment.moved', 'appointment', v_id);
    end if;
    if v_old.status <> p_status then
      insert into public.audit_logs(clinic_id, branch_id, actor_staff_id, action, resource_type, resource_id)
        values(v_clinic, p_branch, v_actor, 'appointment.status_changed', 'appointment', v_id);
      if p_status = 'cancelled' then
        insert into public.audit_logs(clinic_id, branch_id, actor_staff_id, action, resource_type, resource_id)
          values(v_clinic, p_branch, v_actor, 'appointment.cancelled', 'appointment', v_id);
      end if;
    end if;
  end if;
  return v_id;
end;
$$;

-- Narrow staff lookup avoids broadening shared staff_profiles/role RLS.
create function private.appointment_dentists() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', sp.id, 'name', sp.display_name, 'branch_id', ra.branch_id)
    order by sp.display_name, sp.id, ra.branch_id), '[]'::jsonb)
  from public.staff_profiles sp join public.staff_role_assignments ra on ra.staff_id = sp.id and ra.clinic_id = sp.clinic_id
  join public.branches b on b.id = ra.branch_id and b.clinic_id = ra.clinic_id
  where sp.is_active and b.is_active and ra.role = 'dentist'
    and private.has_role(sp.clinic_id, ra.branch_id, array['administrator','dentist','receptionist','dental_assistant']::public.staff_role[]);
$$;

create function private.appointment_patients(p_branch uuid, p_query text default '') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if p_branch is null or p_query is null or length(p_query) > 100 then
    raise exception 'Invalid patient search.' using errcode = '22023';
  end if;
  select jsonb_build_object('patients', coalesce(jsonb_agg(to_jsonb(candidate) - 'position') filter (where position <= 20), '[]'::jsonb),
    'hasMore', count(*) > 20) into v_result from (
    select p.id, concat_ws(' ', p.first_name, nullif(p.middle_name,''), p.last_name) as name,
      row_number() over(order by p.last_name, p.first_name, p.id) as position
    from public.patients p join public.patient_branch_access pa on pa.patient_id = p.id and pa.clinic_id = p.clinic_id
    join public.branches b on b.id = pa.branch_id and b.clinic_id = pa.clinic_id
    where pa.branch_id = p_branch and b.is_active
      and private.has_role(p.clinic_id, p_branch, array['administrator','dentist','receptionist']::public.staff_role[])
      and (p_query = '' or strpos(lower(p.search_text), lower(p_query)) > 0)
    order by p.last_name, p.first_name, p.id limit 21
  ) candidate;
  return v_result;
end;
$$;

create function private.appointment_schedule(
  p_from timestamptz, p_to timestamptz, p_branch uuid default null, p_dentist uuid default null,
  p_patient text default '', p_status public.appointment_status default null, p_page integer default 1
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to <= p_from
    or p_to - p_from > interval '8 days' or p_page is null or p_page not between 1 and 10000
    or p_patient is null or length(p_patient) > 100 then
    raise exception 'Invalid calendar range or filters.' using errcode = '22023';
  end if;
  with matching as materialized (
    select a.id, a.branch_id, a.patient_id, a.dentist_staff_id, a.starts_at, a.ends_at, a.status, a.updated_at,
      concat_ws(' ', p.first_name, nullif(p.middle_name, ''), p.last_name) as patient_name,
      sp.display_name as dentist_name, b.name as branch_name
    from public.appointments a
    join public.patients p on p.id = a.patient_id and p.clinic_id = a.clinic_id
    join public.branches b on b.id = a.branch_id and b.clinic_id = a.clinic_id
    left join public.staff_profiles sp on sp.id = a.dentist_staff_id and sp.clinic_id = a.clinic_id
    where b.is_active and a.starts_at < p_to and a.ends_at > p_from
      and (p_branch is null or a.branch_id = p_branch) and (p_dentist is null or a.dentist_staff_id = p_dentist)
      and (p_status is null or a.status = p_status)
      and (p_patient = '' or strpos(lower(p.search_text), lower(p_patient)) > 0)
      and private.has_role(a.clinic_id, a.branch_id, array['administrator','dentist','receptionist','dental_assistant']::public.staff_role[])
      and exists(select 1 from public.patient_branch_access pa where pa.patient_id = a.patient_id and pa.branch_id = a.branch_id and pa.clinic_id = a.clinic_id)
  ), page as (
    select * from matching order by starts_at, id limit 100 offset (p_page - 1) * 100
  ) select jsonb_build_object('appointments', coalesce((select jsonb_agg(to_jsonb(page) order by starts_at, id) from page), '[]'::jsonb),
    'total', (select count(*) from matching)) into v_result;
  return v_result;
end;
$$;

create function public.save_appointment(
  p_branch uuid, p_patient uuid, p_dentist uuid, p_start timestamptz, p_duration integer,
  p_status public.appointment_status, p_id uuid default null, p_expected_updated_at timestamptz default null
) returns uuid language sql security invoker set search_path = '' as $$
  select private.save_appointment(p_branch, p_patient, p_dentist, p_start, p_duration, p_status, p_id, p_expected_updated_at);
$$;
create function public.appointment_dentists() returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.appointment_dentists();
$$;
create function public.appointment_patients(p_branch uuid, p_query text default '') returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.appointment_patients(p_branch, p_query);
$$;
create function public.appointment_schedule(
  p_from timestamptz, p_to timestamptz, p_branch uuid default null, p_dentist uuid default null,
  p_patient text default '', p_status public.appointment_status default null, p_page integer default 1
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.appointment_schedule(p_from, p_to, p_branch, p_dentist, p_patient, p_status, p_page);
$$;

revoke all on function private.touch_appointment_updated_at() from public, anon, authenticated;
revoke all on function private.save_appointment(uuid, uuid, uuid, timestamptz, integer, public.appointment_status, uuid, timestamptz),
  public.save_appointment(uuid, uuid, uuid, timestamptz, integer, public.appointment_status, uuid, timestamptz),
  private.appointment_dentists(), public.appointment_dentists(),
  private.appointment_patients(uuid, text), public.appointment_patients(uuid, text),
  private.appointment_schedule(timestamptz, timestamptz, uuid, uuid, text, public.appointment_status, integer),
  public.appointment_schedule(timestamptz, timestamptz, uuid, uuid, text, public.appointment_status, integer)
  from public, anon, authenticated;
grant execute on function private.save_appointment(uuid, uuid, uuid, timestamptz, integer, public.appointment_status, uuid, timestamptz),
  public.save_appointment(uuid, uuid, uuid, timestamptz, integer, public.appointment_status, uuid, timestamptz),
  private.appointment_dentists(), public.appointment_dentists(),
  private.appointment_patients(uuid, text), public.appointment_patients(uuid, text),
  private.appointment_schedule(timestamptz, timestamptz, uuid, uuid, text, public.appointment_status, integer),
  public.appointment_schedule(timestamptz, timestamptz, uuid, uuid, text, public.appointment_status, integer)
  to authenticated;
-- Direct writes remain revoked: the only staff mutation path performs authorization
-- and audit insertion in the same transaction. Existing appointment SELECT RLS stays in force.
comment on function public.save_appointment is 'Authorized, atomic scheduling and audit with optimistic concurrency. Exclusion constraint prevents overlapping dentist bookings.';
