begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relname in
  ('clinics', 'branches', 'staff_profiles', 'staff_role_assignments', 'patients', 'patient_branch_access', 'appointments', 'audit_logs')), 8, 'All foundation tables have RLS');
select ok(not exists(select 1 from unnest(array['clinics', 'branches', 'staff_profiles', 'staff_role_assignments', 'patients', 'patient_branch_access', 'appointments', 'audit_logs']) t(name)
  where has_table_privilege('anon', 'public.' || name, 'select')), 'Anonymous role has no foundation table grants');
select ok((select not public from storage.buckets where id = 'patient-documents'), 'Patient documents bucket is private');
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'Anonymous callers cannot use authorization helpers');

-- Synthetic fixtures only. The entire test is rolled back, including Auth users.
insert into clinics(id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Test Clinic A'),
  ('10000000-0000-0000-0000-000000000002', 'Test Clinic B');
insert into branches(id, clinic_id, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Test Branch A1'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Test Branch A2'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Test Branch B1');
insert into auth.users(id) select ('30000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 8) i;
insert into staff_profiles(id, clinic_id, display_name, is_active) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Test Administrator', true),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Test Dentist', true),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Test Receptionist', true),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Test Inactive Staff', false),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Test Billing Staff', true),
  ('30000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'Test Assistant', true),
  ('30000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000002', 'Test Other Administrator', true);
insert into staff_role_assignments(staff_id, clinic_id, branch_id, role) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', null, 'administrator'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'dentist'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'receptionist'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'dentist'),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'billing_staff'),
  ('30000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'dental_assistant'),
  ('30000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000002', null, 'administrator');
insert into patients(id, clinic_id, first_name, last_name) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Synthetic', 'Patient A1'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Synthetic', 'Patient A2'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Synthetic', 'Patient B1'),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Synthetic', 'Unlinked Patient');
insert into patient_branch_access(patient_id, branch_id, clinic_id) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002');
insert into appointments(clinic_id, branch_id, patient_id, dentist_staff_id, starts_at, ends_at)
  select clinic_id, branch_id, patient_id,
    case branch_id
      when '20000000-0000-0000-0000-000000000001' then '30000000-0000-0000-0000-000000000002'::uuid
      when '20000000-0000-0000-0000-000000000002' then '30000000-0000-0000-0000-000000000001'::uuid
      else '30000000-0000-0000-0000-000000000008'::uuid
    end, '2030-01-01 01:00Z', '2030-01-01 02:00Z' from patient_branch_access
    where patient_id in (
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000003'
    );
insert into audit_logs(clinic_id, actor_staff_id, action, resource_type)
  values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'test.event', 'test');
insert into storage.objects(bucket_id, name) values ('patient-documents', 'synthetic-fixture.pdf');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is((select count(*)::integer from patients), 0, 'Authenticated request without an identity sees no patients');

select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from clinics), 1, 'Dentist can read own clinic');
select is((select count(*)::integer from branches), 1, 'Dentist sees assigned branch only');
select is((select count(*)::integer from patients), 1, 'Dentist sees explicitly linked branch patients');
select is((select count(*)::integer from patients where id = '40000000-0000-0000-0000-000000000002'), 0, 'Other branch patient is inaccessible');
select is((select count(*)::integer from patients where clinic_id = '10000000-0000-0000-0000-000000000002'), 0, 'Other clinic patients are inaccessible');
select is((select count(*)::integer from appointments), 1, 'Dentist sees assigned branch appointments');
select is((select count(*)::integer from staff_profiles), 1, 'Dentist sees own staff profile only');
select is((select count(*)::integer from audit_logs), 0, 'Dentist cannot read administrative audit logs');
select is((select count(*)::integer from storage.objects where bucket_id = 'patient-documents'), 0, 'Private document objects are inaccessible');
select throws_ok($$update staff_profiles set is_active = true$$, '42501', null, 'Staff cannot change protected profile records');
select throws_ok($$update staff_role_assignments set role = 'administrator'$$, '42501', null, 'Staff cannot elevate their own roles');
select throws_ok($$insert into staff_role_assignments(staff_id, clinic_id, role) values ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'administrator')$$, '42501', null, 'Staff cannot insert privileged assignments');
select throws_ok($$insert into patients(clinic_id, first_name, last_name) values ('10000000-0000-0000-0000-000000000001', 'Synthetic', 'Unauthorized')$$, '42501', null, 'Patient mutations are denied until audited workflows exist');
select throws_ok($$update patients set first_name = 'Changed'$$, '42501', null, 'Patient updates are denied');
select throws_ok($$delete from patients$$, '42501', null, 'Patient deletion is denied');
select throws_ok($$insert into audit_logs(clinic_id, actor_staff_id, action, resource_type) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'forged.event', 'test')$$, '42501', null, 'Staff cannot forge audit attribution');
select throws_ok($$update audit_logs set action = 'changed.event'$$, '42501', null, 'Audit updates are denied');
select throws_ok($$delete from audit_logs$$, '42501', null, 'Audit deletion is denied');
select throws_ok($$insert into storage.objects(bucket_id, name) values ('patient-documents', 'unauthorized.pdf')$$, '42501', null, 'Document uploads have no permissive policy');

select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*)::integer from patients), 1, 'Receptionist can read branch patient identities');
select is((select count(*)::integer from appointments), 1, 'Receptionist can read branch appointments');

select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is((select count(*)::integer from patients), 1, 'Billing staff can read branch patient identities');
select is((select count(*)::integer from appointments), 0, 'Billing staff cannot read appointment records');

select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000007","role":"authenticated"}', true);
select is((select count(*)::integer from patients), 1, 'Assistant can read branch patient identities');
select is((select count(*)::integer from appointments), 1, 'Assistant can read branch appointments');

select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is((select count(*)::integer from patients), 0, 'Inactive staff see no patients');
select is((select count(*)::integer from appointments), 0, 'Inactive staff see no appointments');

select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000006","role":"authenticated","user_metadata":{"role":"administrator"}}', true);
select is((select count(*)::integer from patients), 0, 'Unprovisioned user cannot gain access via editable metadata');
select is((select count(*)::integer from clinics), 0, 'Unprovisioned user sees no clinic');

select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from patients), 2, 'Clinic administrator can read linked identities across clinic branches');
select is((select count(*)::integer from appointments), 2, 'Clinic administrator sees own clinic appointments');
select is((select count(*)::integer from audit_logs), 1, 'Clinic administrator can read own clinic audit logs');
select is((select count(*)::integer from patients where id = '40000000-0000-0000-0000-000000000004'), 0, 'An unlinked patient remains inaccessible');
select throws_ok($$delete from audit_logs$$, '42501', null, 'Application administrators cannot delete audit events');

reset role;
-- Existing JWTs must lose access as soon as the staff record is deactivated.
update staff_profiles set is_active = false where id = '30000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from patients), 0, 'Deactivation takes effect without waiting for token refresh');
reset role;
update staff_profiles set is_active = true where id = '30000000-0000-0000-0000-000000000002';
update branches set is_active = false where id = '20000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((select count(*)::integer from patients), 0, 'Inactive branch removes branch staff patient access');
reset role;

select throws_ok($$insert into patient_branch_access(patient_id, branch_id, clinic_id) values ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002')$$, '23503', null, 'Foreign keys prevent cross-clinic patient links');
select throws_ok($$insert into staff_role_assignments(staff_id, clinic_id, role) values ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'administrator')$$, '23503', null, 'Foreign keys prevent cross-clinic role assignments');
select throws_ok($$insert into staff_role_assignments(staff_id, clinic_id, role) values ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'dentist')$$, '23514', null, 'Non-administrator roles require an explicit branch');

-- Broader contract checks for the foundation's write boundaries and constraints.
select ok(not exists (
  select 1 from unnest(array['clinics', 'branches', 'staff_profiles', 'staff_role_assignments', 'patients', 'patient_branch_access', 'appointments', 'audit_logs']) t(name)
  where has_table_privilege('authenticated', 'public.' || name, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
), 'Every foundation table denies all authenticated mutation and bypass privileges');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.prosecdef
    and not (coalesce(p.proconfig, array[]::text[]) @> array['search_path=""'])
), 'Privileged authorization helpers pin an empty search path');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'EXECUTE')
), 'Anonymous users cannot execute any private helper');

select throws_ok($$insert into appointments(clinic_id, branch_id, patient_id, starts_at, ends_at) values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '2030-01-01 02:00Z', '2030-01-01 01:00Z')$$, '23514', null, 'Appointments must end after their start');
select throws_ok($$insert into appointments(clinic_id, branch_id, patient_id, dentist_staff_id, starts_at, ends_at) values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '2030-01-01 01:00Z', '2030-01-01 02:00Z')$$, '23503', null, 'Appointment patients require an explicit link to the scheduled branch');
select throws_ok($$insert into appointments(clinic_id, branch_id, patient_id, dentist_staff_id, starts_at, ends_at) values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000008', '2030-01-01 03:00Z', '2030-01-01 04:00Z')$$, '23503', null, 'Appointments cannot reference another clinic staff member');
select throws_ok($$insert into staff_role_assignments(staff_id, clinic_id, branch_id, role) values ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'dentist')$$, '23505', null, 'Duplicate branch role assignments are rejected');
select throws_ok($$insert into patients(clinic_id, first_name, last_name) values ('10000000-0000-0000-0000-000000000001', '   ', 'Synthetic')$$, '23514', null, 'Blank patient identities are rejected');
select throws_ok($$delete from auth.users where id = '30000000-0000-0000-0000-000000000001'$$, '23503', null, 'Auth deletion cannot silently cascade away a staff identity');

insert into patients(id, clinic_id, first_name, last_name, created_at, updated_at)
  values ('40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Synthetic', 'Timestamp Fixture', '2000-01-01Z', '2000-01-01Z');
update patients set first_name = 'Updated Synthetic' where id = '40000000-0000-0000-0000-000000000005';
select ok((select updated_at > created_at from patients where id = '40000000-0000-0000-0000-000000000005'), 'Trusted updates advance the updated_at timestamp');

update branches set is_active = true where id = '20000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000008","role":"authenticated"}', true);
select is((select count(*)::integer from patients), 1, 'Other clinic administrator sees only their own clinic patient');
select is((select count(*)::integer from staff_profiles), 1, 'Other clinic administrator cannot read clinic A staff');
select is((select count(*)::integer from audit_logs), 0, 'Other clinic administrator cannot read clinic A audit records');
reset role;

-- Branch-scoped administrators cannot acquire clinic-wide administrative reads.
update staff_profiles set is_active = true where id = '30000000-0000-0000-0000-000000000004';
delete from staff_role_assignments where staff_id = '30000000-0000-0000-0000-000000000004';
insert into staff_role_assignments(staff_id, clinic_id, branch_id, role)
  values ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'administrator');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is((select count(*)::integer from patients), 1, 'Branch administrator cannot read another branch patient');
select is((select count(*)::integer from staff_profiles), 1, 'Branch administrator cannot list clinic-wide staff');
select is((select count(*)::integer from audit_logs), 0, 'Branch administrator cannot read clinic-wide audit events');
reset role;

insert into staff_role_assignments(staff_id, clinic_id, branch_id, role)
  values ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'dentist');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from patients), 2, 'Explicit multiple branch assignments allow both linked patient groups');
reset role;
delete from staff_role_assignments where staff_id = '30000000-0000-0000-0000-000000000002';
set local role authenticated;
select is((select count(*)::integer from patients), 0, 'Role revocation takes effect for an existing JWT immediately');
select is((select count(*)::integer from branches), 0, 'Revoked staff cannot retain branch access');
reset role;

set local role anon;
select throws_ok('select * from patients', '42501', null, 'Anonymous patient reads are rejected');
select throws_ok('select * from appointments', '42501', null, 'Anonymous appointment reads are rejected');
reset role;
select * from finish();
rollback;
