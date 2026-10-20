begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into clinics(id, name) values
  ('11000000-0000-0000-0000-000000000001', 'Patient Test Clinic'),
  ('11000000-0000-0000-0000-000000000002', 'Other Patient Test Clinic');
insert into branches(id, clinic_id, name, is_active) values
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Patient Branch A', true),
  ('21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 'Patient Branch B', true),
  ('21000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000002', 'Other Clinic Branch', true),
  ('21000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000001', 'Inactive Patient Branch', false);
insert into auth.users(id) select ('31000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 7) i;
insert into staff_profiles(id, clinic_id, display_name, is_active)
  select id, '11000000-0000-0000-0000-000000000001', 'Synthetic Patient Staff', id <> '31000000-0000-0000-0000-000000000006'
  from auth.users where id::text like '31000000-%';
insert into staff_role_assignments(staff_id, clinic_id, branch_id, role) values
  ('31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', null, 'administrator'),
  ('31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'receptionist'),
  ('31000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'dentist'),
  ('31000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'dental_assistant'),
  ('31000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'billing_staff'),
  ('31000000-0000-0000-0000-000000000006', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'receptionist');
insert into patients(id, clinic_id, first_name, last_name, birth_date, phone, email) values
  ('41000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Visible', 'Synthetic', '2000-02-29', '+63 917 123 4567', 'visible@example.test'),
  ('41000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 'Hidden', 'Synthetic', null, null, 'hidden@example.test'),
  ('41000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000002', 'Other', 'Synthetic', null, null, null);
insert into patient_branch_access(patient_id, branch_id, clinic_id) values
  ('41000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001'),
  ('41000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001'),
  ('41000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000002');

create function pg_temp.details(first_name text default 'New', last_name text default 'Synthetic') returns jsonb language sql as $$
  select jsonb_build_object('firstName', first_name, 'lastName', last_name, 'middleName', 'Middle', 'birthDate', '2000-02-29', 'gender', 'female', 'phone', '', 'email', '', 'address', 'Synthetic address');
$$;
-- Test helpers remain invokers: the authenticated identity still reaches the real RPC.
create function pg_temp.save(details jsonb default pg_temp.details(), branch_ids uuid[] default array['21000000-0000-0000-0000-000000000001']::uuid[], patient_id uuid default null, allow_duplicate boolean default false) returns jsonb language sql as $$
  select public.save_patient(details, branch_ids, patient_id, (select updated_at from public.patients where id = patient_id), allow_duplicate);
$$;
create temp table patient_save_results(label text primary key, result jsonb);
grant all on patient_save_results to authenticated;

set local role anon;
select throws_ok($$select public.save_patient('{}', array[]::uuid[])$$, '42501', null, 'Anonymous callers cannot save patients');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select pg_temp.save()$$, '42501', null, 'Missing identity cannot save patients');

select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
insert into patient_save_results values ('created', pg_temp.save());
select is((select result->>'status' from patient_save_results where label = 'created'), 'saved', 'Receptionist can register a patient');
select is((select count(*)::integer from patients where first_name = 'New' and middle_name = 'Middle' and birth_date = '2000-02-29' and gender = 'female' and address = 'Synthetic address'), 1, 'All supplied demographics are persisted and visible');
select is((select count(*)::integer from patient_branch_access where patient_id = (select (result->>'id')::uuid from patient_save_results where label = 'created')), 1, 'New patient is linked atomically to the selected branch');
select is((select count(*)::integer from patients where search_text ilike '%new middle synthetic%'), 1, 'Directory can search the complete patient name');
select is((select count(*)::integer from patients where search_text ilike '%visible synthetic%'), 1, 'Full-name search works without a middle name');
select throws_ok($$select pg_temp.save(pg_temp.details('Bad Branch'), array['21000000-0000-0000-0000-000000000002']::uuid[])$$, '42501', null, 'Receptionist cannot register in another branch');
select throws_ok($$select pg_temp.save(pg_temp.details('Bad Clinic'), array['21000000-0000-0000-0000-000000000003']::uuid[])$$, '42501', null, 'Cannot register across clinics');
select throws_ok($$select pg_temp.save(pg_temp.details(), array[]::uuid[])$$, '22023', null, 'Registration requires a branch');
select throws_ok($$select pg_temp.save(pg_temp.details(), array[null]::uuid[])$$, '42501', null, 'Null branch is rejected');
select throws_ok($$select pg_temp.save(pg_temp.details(' '))$$, '22023', null, 'RPC rejects blank names');
select throws_ok($$select pg_temp.save(pg_temp.details() || '{"birthDate":"2999-01-01"}')$$, '22023', null, 'RPC rejects future birth dates');
select throws_ok($$select pg_temp.save(pg_temp.details() || '{"birthDate":"2001-02-29"}')$$, '22008', null, 'RPC rejects impossible calendar dates');
select throws_ok($$select pg_temp.save(pg_temp.details() || '{"email":"invalid"}')$$, '22023', null, 'RPC rejects malformed email');
select throws_ok($$select pg_temp.save(pg_temp.details() || '{"phone":"123"}')$$, '22023', null, 'RPC rejects invalid phone');
select throws_ok($$select pg_temp.save(pg_temp.details() || '{"gender":"invalid"}')$$, '22023', null, 'RPC rejects invalid gender');
select throws_ok($$select pg_temp.save(pg_temp.details(), patient_id => '41000000-0000-0000-0000-000000000002')$$, '42501', null, 'Cannot edit a hidden branch patient');
select throws_ok($$select pg_temp.save(pg_temp.details(), patient_id => '41000000-0000-0000-0000-000000000003')$$, '42501', null, 'Cannot edit another clinic patient');

select is(pg_temp.save(pg_temp.details('visible', 'synthetic'))->>'status', 'duplicates', 'Duplicate names are case insensitive');
select is(pg_temp.save(pg_temp.details('Contact') || '{"email":"VISIBLE@EXAMPLE.TEST"}')->>'status', 'duplicates', 'Duplicate email comparison is normalized');
select is(pg_temp.save(pg_temp.details('Contact') || '{"phone":"+63 (917) 123-4567"}')->>'status', 'duplicates', 'Duplicate phone comparison ignores formatting');
select is((select count(*)::integer from patients where first_name = 'Contact'), 0, 'Duplicate warning does not write a patient');
select is(pg_temp.save(pg_temp.details('Visible', 'Synthetic'), allow_duplicate => true)->>'status', 'saved', 'Staff may explicitly confirm a separate duplicate record');
select is(pg_temp.save(pg_temp.details('Hidden', 'Synthetic'))->>'status', 'saved', 'Duplicate detection does not expose inaccessible branch patients');

select is(pg_temp.save(pg_temp.details('Updated'), patient_id => (select (result->>'id')::uuid from patient_save_results where label = 'created'))->>'status', 'saved', 'Receptionist can edit an authorized patient');
select is((select first_name from patients where id = (select (result->>'id')::uuid from patient_save_results where label = 'created')), 'Updated', 'Edited demographics are persisted');
select throws_ok($$select public.save_patient(pg_temp.details(), array['21000000-0000-0000-0000-000000000001']::uuid[], '41000000-0000-0000-0000-000000000001', '2000-01-01Z')$$, 'PT409', null, 'Stale edit cannot overwrite newer information');
select throws_ok($$select public.save_patient(pg_temp.details(), array['21000000-0000-0000-0000-000000000001']::uuid[], '41000000-0000-0000-0000-000000000001')$$, 'PT409', null, 'Edit requires a concurrency token');

select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(pg_temp.save(pg_temp.details('Dentist'))->>'status', 'saved', 'Dentist can register a patient');
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok($$select pg_temp.save()$$, '42501', null, 'Assistant cannot register patients');
select throws_ok($$select pg_temp.save(patient_id => '41000000-0000-0000-0000-000000000001')$$, '42501', null, 'Assistant cannot edit patients');
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select throws_ok($$select pg_temp.save()$$, '42501', null, 'Billing staff cannot register patients');
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$select pg_temp.save()$$, '42501', null, 'Inactive staff cannot register patients');
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000007","role":"authenticated","user_metadata":{"role":"administrator"}}', true);
select throws_ok($$select pg_temp.save()$$, '42501', null, 'Unassigned staff cannot elevate using editable metadata');

select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(pg_temp.save(pg_temp.details('Visible', 'Synthetic'), array['21000000-0000-0000-0000-000000000002']::uuid[], '41000000-0000-0000-0000-000000000001', true)->>'status', 'saved', 'Clinic administrator can assign a patient to a second branch');
select is((select count(*)::integer from patient_branch_access where patient_id = '41000000-0000-0000-0000-000000000001'), 2, 'Assignment preserves previous branch links');
select is((select count(*)::integer from audit_logs where resource_id = (select (result->>'id')::uuid from patient_save_results where label = 'created') and action = 'patient.created' and actor_staff_id = '31000000-0000-0000-0000-000000000002'), 1, 'Creation audit attributes the verified actor');
select is((select count(*)::integer from audit_logs where resource_id = (select (result->>'id')::uuid from patient_save_results where label = 'created') and action = 'patient.updated'), 1, 'Patient edit is audited');
select is((select count(*)::integer from audit_logs where resource_id = '41000000-0000-0000-0000-000000000001' and action = 'patient.branch_assigned' and branch_id = '21000000-0000-0000-0000-000000000002'), 1, 'Branch assignment has a branch-scoped audit event');
select is(pg_temp.save(pg_temp.details('Visible', 'Synthetic'), array['21000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002']::uuid[], '41000000-0000-0000-0000-000000000001', true)->>'status', 'saved', 'Repeated assignment is idempotent');
select is((select count(*)::integer from audit_logs where resource_id = '41000000-0000-0000-0000-000000000001' and action = 'patient.branch_assigned'), 1, 'Repeated assignment does not create duplicate audit events');
select throws_ok($$select pg_temp.save(pg_temp.details('Inactive'), array['21000000-0000-0000-0000-000000000004']::uuid[])$$, '42501', null, 'Clinic administrator cannot assign inactive branches');
select throws_ok($$select pg_temp.save(pg_temp.details('Cross Clinic'), array['21000000-0000-0000-0000-000000000003']::uuid[])$$, '42501', null, 'Clinic administrator cannot assign another clinic branch');
select throws_ok($$delete from patients$$, '42501', null, 'Patient deletion remains unavailable');
select throws_ok($$insert into patient_branch_access(patient_id, branch_id, clinic_id) values ('41000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001')$$, '42501', null, 'Direct unaudited branch writes stay revoked');
select ok(not exists(select 1 from audit_logs where clinic_id = '11000000-0000-0000-0000-000000000001' and actor_staff_id not in ('31000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000002','31000000-0000-0000-0000-000000000003')), 'Only authorized actors produce audit events');
reset role;

-- A failure in audit insertion must roll back the patient and branch links too.
create function pg_temp.fail_patient_audit() returns trigger language plpgsql as $$ begin raise exception 'Synthetic audit failure'; end $$;
create trigger test_fail_audit before insert on audit_logs for each row execute function pg_temp.fail_patient_audit();
set local role authenticated;
select throws_ok($$select pg_temp.save(pg_temp.details('Rollback'))$$, 'P0001', 'Synthetic audit failure', 'Audit failure aborts the entire save');
select is((select count(*)::integer from patients where first_name = 'Rollback'), 0, 'Failed audit leaves no partially registered patient');
reset role;
drop trigger test_fail_audit on audit_logs;

-- Existing sessions immediately lose write access when assignments are revoked.
delete from staff_role_assignments where staff_id = '31000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$select pg_temp.save()$$, '42501', null, 'Role revocation immediately removes write access');
reset role;
select * from finish();
rollback;
