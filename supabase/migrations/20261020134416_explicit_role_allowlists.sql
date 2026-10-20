-- Future enum additions must not implicitly inherit access to patient links.
alter policy branches_read on public.branches using (
  is_active and private.has_role(clinic_id, id, array[
    'administrator', 'dentist', 'dental_assistant', 'receptionist', 'billing_staff'
  ]::public.staff_role[])
);
alter policy patient_branch_access_read on public.patient_branch_access using (
  private.has_role(clinic_id, branch_id, array[
    'administrator', 'dentist', 'dental_assistant', 'receptionist', 'billing_staff'
  ]::public.staff_role[])
);
