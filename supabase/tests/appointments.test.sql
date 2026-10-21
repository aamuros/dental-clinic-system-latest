begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into clinics(id,name) values ('12000000-0000-4000-8000-000000000001','Appointment Test'),('12000000-0000-4000-8000-000000000002','Other Appointment Clinic');
insert into branches(id,clinic_id,name,is_active) values
('22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','A',true),
('22000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001','B',true),
('22000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000002','Other',true),
('22000000-0000-4000-8000-000000000004','12000000-0000-4000-8000-000000000001','Inactive',false);
insert into auth.users(id) select ('32000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,8)i;
insert into staff_profiles(id,clinic_id,display_name,is_active)
select id, case when id::text like '%000008' then '12000000-0000-4000-8000-000000000002'::uuid else '12000000-0000-4000-8000-000000000001'::uuid end,
'Synthetic appointment staff', id::text not like '%000007' from auth.users where id::text like '32000000-%';
insert into staff_role_assignments(staff_id,clinic_id,branch_id,role) values
('32000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',null,'administrator'),
('32000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','receptionist'),
('32000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','dentist'),
('32000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002','dentist'),
('32000000-0000-4000-8000-000000000004','12000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','dental_assistant'),
('32000000-0000-4000-8000-000000000005','12000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','billing_staff'),
('32000000-0000-4000-8000-000000000006','12000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','dentist'),
('32000000-0000-4000-8000-000000000007','12000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','receptionist'),
('32000000-0000-4000-8000-000000000008','12000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000003','dentist');
insert into patients(id,clinic_id,first_name,last_name) values
('42000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','Visible','Patient'),
('42000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001','Hidden','Patient'),
('42000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000002','Other','Patient');
update patients set phone = '+63 (917) 123-4567', email = 'patient@example.test';
insert into patient_branch_access(patient_id,branch_id,clinic_id) values
('42000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001'),
('42000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001'),
('42000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001'),
('42000000-0000-4000-8000-000000000003','22000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000002');
create function pg_temp.book(
  starts timestamptz default '2090-02-01T01:00Z', duration integer default 30,
  branch uuid default '22000000-0000-4000-8000-000000000001', patient uuid default '42000000-0000-4000-8000-000000000001',
  dentist uuid default '32000000-0000-4000-8000-000000000003', status appointment_status default 'scheduled', id uuid default null
) returns uuid language sql as $$
select public.save_appointment(branch,patient,dentist,starts,duration,status,id,(select updated_at from appointments where appointments.id = book.id));
$$;
create temp table saved(label text primary key,id uuid);
grant all on saved to authenticated;
set local role anon;
select throws_ok($$select public.appointment_dentists()$$,'42501',null,'Anonymous dentist lookup denied');
select throws_ok($$select pg_temp.book()$$,'42501',null,'Anonymous booking denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select pg_temp.book()$$,'42501',null,'Missing identity denied');
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into saved values ('first',pg_temp.book());
select is((select count(*)::int from appointments),1,'Authorized receptionist creates appointment');
select is((select starts_at from appointments limit 1),'2090-02-01T01:00Z'::timestamptz,'Stores absolute time');
select is(jsonb_array_length(public.appointment_dentists()),2,'Narrow lookup exposes only authorized branch dentists');
select is(jsonb_array_length(public.appointment_patients('22000000-0000-4000-8000-000000000001')->'patients'),1,'Patient lookup excludes other-branch patients');
select is(jsonb_array_length(public.appointment_patients('22000000-0000-4000-8000-000000000002')->'patients'),0,'Patient lookup denies unauthorized branch');
select is(jsonb_array_length(public.appointment_patients('22000000-0000-4000-8000-000000000001','%')->'patients'),0,'Patient search treats wildcard literally');
select is(jsonb_array_length(public.appointment_patients('22000000-0000-4000-8000-000000000001','9171234567')->'patients'),1,'Booking patient search: 9171234567');
select is(jsonb_array_length(public.appointment_patients('22000000-0000-4000-8000-000000000001','917 123 4567')->'patients'),1,'Booking patient search: 917 123 4567');
select is(jsonb_array_length(public.appointment_patients('22000000-0000-4000-8000-000000000001','1234567')->'patients'),1,'Booking patient search: 1234567');
select is(jsonb_array_length(public.appointment_patients('22000000-0000-4000-8000-000000000001','0917')->'patients'),0,'Booking patient search: 0917');
select is(jsonb_array_length(public.appointment_patients('22000000-0000-4000-8000-000000000001','123%')->'patients'),0,'Booking patient search: 123%');
select is(jsonb_array_length(public.appointment_patients('22000000-0000-4000-8000-000000000001','123_')->'patients'),0,'Booking patient search: 123_');
select is(jsonb_array_length(public.appointment_patients('22000000-0000-4000-8000-000000000001','123!4567')->'patients'),0,'Booking patient search: 123!4567');
select is(jsonb_array_length(public.appointment_patients('22000000-0000-4000-8000-000000000001','PATIENT@EXAMPLE.TEST')->'patients'),1,'Booking patient search: PATIENT@EXAMPLE.TEST');
select is(jsonb_array_length(public.appointment_patients('22000000-0000-4000-8000-000000000001','visible PATIENT')->'patients'),1,'Booking patient search: visible PATIENT');
select is(jsonb_array_length(public.appointment_patients('22000000-0000-4000-8000-000000000002','9171234567')->'patients'),0,'Normalized lookup still denies unauthorized branch');
select throws_ok($$select pg_temp.book('2090-02-01T01:15Z')$$,'23P01',null,'Overlapping insert rejected');
select throws_ok($$select pg_temp.book('2090-02-01T00:45Z',60)$$,'23P01',null,'Containing overlap rejected');
select throws_ok($$select pg_temp.book(branch=>'22000000-0000-4000-8000-000000000002')$$,'42501',null,'Other branch booking denied');
select throws_ok($$select pg_temp.book(patient=>'42000000-0000-4000-8000-000000000002')$$,'42501',null,'Patient must have access at selected branch');
select throws_ok($$select pg_temp.book(patient=>'42000000-0000-4000-8000-000000000003')$$,'42501',null,'Cross-clinic patient denied');
select throws_ok($$select pg_temp.book(dentist=>'32000000-0000-4000-8000-000000000002')$$,'42501',null,'Receptionist cannot be selected as dentist');
select throws_ok($$select pg_temp.book(dentist=>'32000000-0000-4000-8000-000000000008')$$,'42501',null,'Cross-clinic dentist denied');
select throws_ok($$select pg_temp.book(dentist=>null)$$,'42501',null,'Dentist is required');
select throws_ok($$select pg_temp.book(starts=>'2000-01-01Z')$$,'22023',null,'Past booking denied');
select throws_ok($$select pg_temp.book(starts=>'infinity')$$,'22023',null,'Infinite timestamp denied');
select throws_ok($$select pg_temp.book(duration=>0)$$,'22023',null,'Zero duration denied');
select throws_ok($$select pg_temp.book(duration=>481)$$,'22023',null,'Excess duration denied');
select throws_ok($$select pg_temp.book(status=>'completed')$$,'22023',null,'New appointment cannot start completed');
select throws_ok($$select public.save_appointment('22000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000003','2090-02-01T01:00Z',30,'confirmed',(select id from saved where label='first'),'2000-01-01Z')$$,'PT409',null,'Stale update rejected');
select lives_ok($$select pg_temp.book(status=>'confirmed',id=>(select id from saved where label='first'))$$,'Confirmation succeeds');
select throws_ok($$select pg_temp.book(status=>'completed',id=>(select id from saved where label='first'))$$,'22023',null,'Cannot complete future visit');
insert into saved values ('adjacent',pg_temp.book('2090-02-01T01:30Z'));
insert into saved values ('other-dentist',pg_temp.book(dentist=>'32000000-0000-4000-8000-000000000006'));
select throws_ok($$select pg_temp.book('2090-02-01T01:15Z',id=>(select id from saved where label='adjacent'))$$,'23P01',null,'Overlapping reschedule rejected');
select lives_ok($$select pg_temp.book('2090-02-01T03:00Z',id=>(select id from saved where label='adjacent'))$$,'Non-overlapping reschedule succeeds');
select is((public.appointment_schedule('2090-02-01Z','2090-02-02Z')->>'total')::int,3,'Calendar includes authorized appointments');
select is((public.appointment_schedule('2090-02-01Z','2090-02-02Z',p_status=>'confirmed')->>'total')::int,1,'Filters status');
select is((public.appointment_schedule('2090-02-01Z','2090-02-02Z',p_dentist=>'32000000-0000-4000-8000-000000000006')->>'total')::int,1,'Filters dentist');
select is((public.appointment_schedule('2090-02-01Z','2090-02-02Z',p_patient=>'Visible')->>'total')::int,3,'Filters patient');
select is((public.appointment_schedule('2090-02-01Z','2090-02-02Z',p_patient=>'%')->>'total')::int,0,'Calendar treats wildcards literally');
select is((public.appointment_schedule('2090-02-01Z','2090-02-02Z',p_patient=>'9171234567')->>'total')::int,3,'Calendar patient search: 9171234567');
select is((public.appointment_schedule('2090-02-01Z','2090-02-02Z',p_patient=>'917 123 4567')->>'total')::int,3,'Calendar patient search: 917 123 4567');
select is((public.appointment_schedule('2090-02-01Z','2090-02-02Z',p_patient=>'1234567')->>'total')::int,3,'Calendar patient search: 1234567');
select is((public.appointment_schedule('2090-02-01Z','2090-02-02Z',p_patient=>'0917')->>'total')::int,0,'Calendar patient search: 0917');
select is((public.appointment_schedule('2090-02-01Z','2090-02-02Z',p_patient=>'123%')->>'total')::int,0,'Calendar patient search: 123%');
select is((public.appointment_schedule('2090-02-01Z','2090-02-02Z',p_patient=>'123_')->>'total')::int,0,'Calendar patient search: 123_');
select is((public.appointment_schedule('2090-02-01Z','2090-02-02Z',p_patient=>'123!4567')->>'total')::int,0,'Calendar patient search: 123!4567');
select is((public.appointment_schedule('2090-02-01Z','2090-02-02Z',p_patient=>'PATIENT@EXAMPLE.TEST')->>'total')::int,3,'Calendar patient search: PATIENT@EXAMPLE.TEST');
select throws_ok($$select public.appointment_schedule('2090-01-01Z','2090-02-02Z')$$,'22023',null,'Unbounded calendar requests denied');
select throws_ok($$insert into appointments(clinic_id,branch_id,patient_id,dentist_staff_id,starts_at,ends_at) values('12000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000003','2090-02-02T01:00Z','2090-02-02T01:30Z')$$,'42501',null,'Direct unaudited insert denied');
select throws_ok($$update appointments set status='cancelled'$$,'42501',null,'Direct unaudited update denied');
select throws_ok($$delete from appointments$$,'42501',null,'Staff deletion denied');
select throws_ok($$insert into audit_logs(clinic_id,actor_staff_id,action,resource_type) values('12000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000002','appointment.created','appointment')$$,'42501',null,'Audit forgery denied');
select lives_ok($$select pg_temp.book(status=>'cancelled',id=>(select id from saved where label='first'))$$,'Cancellation succeeds');
select throws_ok($$select pg_temp.book(id=>(select id from saved where label='first'))$$,'22023',null,'Cancelled visit is immutable');
select lives_ok($$select pg_temp.book()$$,'Cancellation releases slot');

select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*)::int from appointments),4,'Assistant can read branch schedule through RLS');
select throws_ok($$select pg_temp.book('2090-02-03T01:00Z')$$,'42501',null,'Assistant cannot book');
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000005","role":"authenticated","user_metadata":{"role":"administrator"}}',true);
select is((select count(*)::int from appointments),0,'Billing cannot read appointments through RLS');
select is((public.appointment_schedule('2090-02-01Z','2090-02-02Z')->>'total')::int,0,'Billing cannot read via RPC or forged metadata');
select is(jsonb_array_length(public.appointment_dentists()),0,'Billing cannot enumerate dentists');
select throws_ok($$select pg_temp.book()$$,'42501',null,'Billing cannot write');
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select throws_ok($$select pg_temp.book()$$,'42501',null,'Inactive staff denied');
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
select is((select count(*)::int from appointments),0,'Other clinic cannot read schedule');
select is((public.appointment_schedule('2090-02-01Z','2090-02-02Z')->>'total')::int,0,'Other clinic cannot read RPC schedule');
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select pg_temp.book(branch=>'22000000-0000-4000-8000-000000000002')$$,'23P01',null,'Same dentist conflicts across branches');
select throws_ok($$select pg_temp.book(branch=>'22000000-0000-4000-8000-000000000004')$$,'42501',null,'Inactive branch denied even for administrator');
select is((select count(*)::int from audit_logs where action='appointment.created'),4,'Every successful creation has audit event; failed writes have none');
select is((select count(*)::int from audit_logs where action='appointment.rescheduled'),1,'Reschedule audited');
select is((select count(*)::int from audit_logs where action='appointment.cancelled'),1,'Cancellation audited');
select is((select count(*)::int from audit_logs where action='appointment.status_changed'),2,'Status changes audited');
select is((select count(*)::int from audit_logs where actor_staff_id <> '32000000-0000-4000-8000-000000000002'),0,'Audit actor derives from verified identity');
reset role;
update appointments set starts_at=now()-interval '1 hour',ends_at=now()-interval '30 minutes' where id=(select id from saved where label='adjacent');
set local role authenticated;
select lives_ok($$select pg_temp.book((select starts_at from appointments where id=(select id from saved where label='adjacent')),status=>'completed',id=>(select id from saved where label='adjacent'))$$,'Past appointment can be completed');
select throws_ok($$select pg_temp.book((select starts_at from appointments where id=(select id from saved where label='adjacent')),status=>'cancelled',id=>(select id from saved where label='adjacent'))$$,'22023',null,'Completed appointment immutable');
insert into saved values ('transition',pg_temp.book('2090-03-01T01:00Z'));
select lives_ok($$select pg_temp.book('2090-03-01T01:00Z',status=>'confirmed',id=>(select id from saved where label='transition'))$$,'Transition test confirmation');
select throws_ok($$select pg_temp.book('2090-03-01T01:00Z',status=>'scheduled',id=>(select id from saved where label='transition'))$$,'22023',null,'Confirmed with unchanged schedule cannot become Scheduled');
select lives_ok($$select pg_temp.book('2090-03-01T02:00Z',status=>'scheduled',id=>(select id from saved where label='transition'))$$,'Confirmed rescheduled appointment can become Scheduled');
select is((select status::text from appointments where id=(select id from saved where label='transition')),'scheduled','Rescheduled status persisted');
select lives_ok($$select pg_temp.book('2090-03-01T02:00Z',status=>'confirmed',id=>(select id from saved where label='transition'))$$,'Rescheduled appointment can be confirmed again');
select throws_ok($$select pg_temp.book('2090-03-01T03:00Z',status=>'cancelled',id=>(select id from saved where label='transition'))$$,'22023',null,'Cannot combine cancellation and rescheduling');
select * from finish();
rollback;
