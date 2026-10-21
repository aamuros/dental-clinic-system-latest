-- One clinic-local date rule for patient writes. The optional instant allows
-- deterministic midnight-boundary regression tests; callers cannot override the
-- instant used by save_patient. No patient data or authorization is exposed.
create function private.clinic_local_date(p_timezone text, p_now timestamptz default statement_timestamp())
returns date language sql stable security invoker set search_path = '' as $$
  select (p_now at time zone p_timezone)::date;
$$;
revoke all on function private.clinic_local_date(text, timestamptz) from public, anon, authenticated;

-- Preserve existing patients, staff assignments, grants, and RLS read policies.
-- Demographic writes belong to administrators/receptionists. Branch sharing is
-- a separate administrative capability, enforced inside the atomic RPC.
create or replace function private.save_patient(
  p_details jsonb, p_branch_ids uuid[], p_patient_id uuid default null,
  p_expected_updated_at timestamptz default null, p_allow_duplicate boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_clinic uuid;
  v_actor uuid := auth.uid();
  v_id uuid := p_patient_id;
  v_branch uuid;
  v_existing public.patients%rowtype;
  v_first text := btrim(p_details->>'firstName');
  v_middle text := nullif(btrim(p_details->>'middleName'), '');
  v_last text := btrim(p_details->>'lastName');
  v_birth date;
  v_gender text := p_details->>'gender';
  v_phone text := nullif(btrim(p_details->>'phone'), '');
  v_email text := nullif(lower(btrim(p_details->>'email')), '');
  v_address text := nullif(btrim(p_details->>'address'), '');
  v_matches jsonb;
  v_roles public.staff_role[] := array['administrator', 'receptionist']::public.staff_role[];
begin
  select clinic_id into v_clinic from public.staff_profiles where id = v_actor and is_active;
  if v_clinic is null or not private.is_active_staff(v_clinic) then
    raise exception 'Access denied.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_branch_ids), 0) not between 1 and 100 then
    raise exception 'Select at least one authorized branch.' using errcode = '22023';
  end if;
  -- Serialize duplicate checks and writes per clinic, including concurrent registrations.
  perform pg_advisory_xact_lock(hashtextextended(v_clinic::text, 0));
  if v_id is not null then
    select * into v_existing from public.patients where id = v_id and clinic_id = v_clinic for update;
    if not found or not exists (
      select 1 from public.patient_branch_access pa join public.branches b on b.id = pa.branch_id
      where pa.patient_id = v_id and pa.clinic_id = v_clinic and b.is_active
        and private.has_role(v_clinic, pa.branch_id, v_roles)
    ) then
      raise exception 'Patient unavailable or access denied.' using errcode = '42501';
    end if;
    if p_expected_updated_at is null or v_existing.updated_at <> p_expected_updated_at then
      -- This is an application conflict, not a retryable transaction failure.
      raise exception 'This patient has changed. Reload the profile before editing.' using errcode = 'PT409';
    end if;
  end if;
  foreach v_branch in array p_branch_ids loop
    if v_branch is null or not exists(select 1 from public.branches where id = v_branch and clinic_id = v_clinic and is_active)
      or not private.has_role(v_clinic, v_branch, v_roles) then
      raise exception 'Select only branches you are authorized to manage.' using errcode = '42501';
    end if;
    -- Creating a patient grants one initial branch to a demographic writer.
    -- All additional sharing requires administrative authority on both the
    -- existing patient and each destination, even for multi-role staff.
    if (v_id is null and (select count(distinct branch_id) from unnest(p_branch_ids) branch_id) > 1)
      or (v_id is not null and not exists (
        select 1 from public.patient_branch_access
        where patient_id = v_id and branch_id = v_branch and clinic_id = v_clinic
      )) then
      if not private.has_role(v_clinic, v_branch, array['administrator']::public.staff_role[])
        or (v_id is not null and not exists (
          select 1 from public.patient_branch_access pa join public.branches b on b.id = pa.branch_id
          where pa.patient_id = v_id and pa.clinic_id = v_clinic and b.is_active
            and private.has_role(v_clinic, pa.branch_id, array['administrator']::public.staff_role[])
        )) then
        raise exception 'Only authorized administrators can assign additional branches.' using errcode = '42501';
      end if;
    end if;
  end loop;
  if v_first is null or length(v_first) not between 1 and 100
    or v_last is null or length(v_last) not between 1 and 100
    or length(v_middle) > 100 or length(v_address) > 500
    or v_gender is null or v_gender not in ('unspecified', 'female', 'male', 'non_binary', 'prefer_not_to_say')
    or (v_phone is not null and (length(v_phone) > 32 or v_phone !~ '^[+()0-9 .-]+$' or length(regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 7 and 20))
    or (v_email is not null and (length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then
    raise exception 'Invalid patient details.' using errcode = '22023';
  end if;
  if nullif(p_details->>'birthDate', '') is not null then
    if (p_details->>'birthDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Invalid birth date.' using errcode = '22023';
    end if;
    v_birth := (p_details->>'birthDate')::date;
    if v_birth < date '1900-01-01' or v_birth > private.clinic_local_date((select timezone from public.clinics where id = v_clinic)) then
      raise exception 'Invalid birth date.' using errcode = '22023';
    end if;
  end if;
  if not coalesce(p_allow_duplicate, false) then
    select coalesce(jsonb_agg(to_jsonb(matches)), '[]'::jsonb) into v_matches from (
      select p.id, p.first_name, p.last_name, p.birth_date from public.patients p
      where p.clinic_id = v_clinic and (v_id is null or p.id <> v_id)
        and private.can_access_patient(p.id, p.clinic_id)
        and ((lower(p.first_name) = lower(v_first) and lower(p.last_name) = lower(v_last))
          or (v_email is not null and lower(p.email) = v_email)
          or (v_phone is not null and regexp_replace(p.phone, '[^0-9]', '', 'g') = regexp_replace(v_phone, '[^0-9]', '', 'g')))
      order by p.created_at, p.id limit 10
    ) matches;
    if jsonb_array_length(v_matches) > 0 then
      return jsonb_build_object('status', 'duplicates', 'matches', v_matches);
    end if;
  end if;
  if v_id is null then
    insert into public.patients(clinic_id, first_name, middle_name, last_name, birth_date, gender, phone, email, address)
      values(v_clinic, v_first, v_middle, v_last, v_birth, v_gender, v_phone, v_email, v_address) returning id into v_id;
    insert into public.audit_logs(clinic_id, actor_staff_id, action, resource_type, resource_id)
      values(v_clinic, v_actor, 'patient.created', 'patient', v_id);
  else
    update public.patients set first_name = v_first, middle_name = v_middle, last_name = v_last,
      birth_date = v_birth, gender = v_gender, phone = v_phone, email = v_email, address = v_address,
      updated_at = clock_timestamp() where id = v_id;
    -- The existing touch trigger uses transaction time; advance the timestamp
    -- explicitly in the patient-specific trigger below for optimistic concurrency.
    insert into public.audit_logs(clinic_id, actor_staff_id, action, resource_type, resource_id)
      values(v_clinic, v_actor, 'patient.updated', 'patient', v_id);
  end if;
  foreach v_branch in array p_branch_ids loop
    insert into public.patient_branch_access(patient_id, branch_id, clinic_id)
      values(v_id, v_branch, v_clinic) on conflict do nothing;
    if found then
      insert into public.audit_logs(clinic_id, branch_id, actor_staff_id, action, resource_type, resource_id)
        values(v_clinic, v_branch, v_actor, 'patient.branch_assigned', 'patient', v_id);
    end if;
  end loop;
  return jsonb_build_object('status', 'saved', 'id', v_id);
end;
$$;

-- Index only the derived search expression; original phone values stay intact.
create index patients_phone_digits_trgm_idx on public.patients
  using gin ((regexp_replace(phone, '[^0-9]', '', 'g')) extensions.gin_trgm_ops);

-- Shared by directory search, booking lookup, and calendar patient filtering.
-- Phone normalization applies only to phone-shaped input: letters and SQL
-- wildcard/escape characters must never be silently discarded into a match.
create or replace function private.search_patient_ids(p_query text)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.patients p
  where p.clinic_id = (
    select clinic_id from public.staff_profiles where id = (select auth.uid()) and is_active
  )
    and length(p_query) between 1 and 100
    and (
      p.search_text ilike '%' || replace(replace(replace(p_query, '!', '!!'), '%', '!%'), '_', '!_') || '%' escape '!'
      or (
        p_query ~ '^[+()0-9 .-]+$'
        and nullif(regexp_replace(p_query, '[^0-9]', '', 'g'), '') is not null
        and regexp_replace(p.phone, '[^0-9]', '', 'g')
          like '%' || regexp_replace(p_query, '[^0-9]', '', 'g') || '%'
      )
    )
    and private.can_access_patient(p.id, p.clinic_id);
$$;

-- Keep branch/role checks, bounded results, and calendar range limits intact.
create or replace function private.appointment_patients(p_branch uuid, p_query text default '') returns jsonb
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
      and (p_query = '' or p.id in (select private.search_patient_ids(p_query)))
    order by p.last_name, p.first_name, p.id limit 21
  ) candidate;
  return v_result;
end;
$$;

create or replace function private.appointment_schedule(
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
      and (p_patient = '' or p.id in (select private.search_patient_ids(p_patient)))
      and private.has_role(a.clinic_id, a.branch_id, array['administrator','dentist','receptionist','dental_assistant']::public.staff_role[])
      and exists(select 1 from public.patient_branch_access pa where pa.patient_id = a.patient_id and pa.branch_id = a.branch_id and pa.clinic_id = a.clinic_id)
  ), page as (
    select * from matching order by starts_at, id limit 100 offset (p_page - 1) * 100
  ) select jsonb_build_object('appointments', coalesce((select jsonb_agg(to_jsonb(page) order by starts_at, id) from page), '[]'::jsonb),
    'total', (select count(*) from matching)) into v_result;
  return v_result;
end;
$$;


notify pgrst, 'reload schema';
