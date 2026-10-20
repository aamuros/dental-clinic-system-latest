import {
  LayoutDashboard,
  UsersRound,
  CalendarDays,
  ScanLine,
  Stethoscope,
  WalletCards,
  Package,
  UserRoundCog,
  ChartNoAxesCombined,
  Settings2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Permission } from '@/lib/auth/permissions'

export const modules = [
  {
    id: 'dashboard',
    path: '/dashboard',
    label: 'Dashboard',
    description: 'An overview of your clinic’s daily operations.',
    empty: '',
    icon: LayoutDashboard,
    permission: 'dashboard.read',
    group: 'Workspace',
  },
  {
    id: 'patients',
    path: '/patients',
    label: 'Patients',
    description:
      'Manage patient identities and contact information across your clinic.',
    empty:
      'Patient management will be available here. No patient records are displayed in this preview.',
    icon: UsersRound,
    permission: 'patients.read',
    group: 'Workspace',
  },
  {
    id: 'appointments',
    path: '/appointments',
    label: 'Appointments',
    description: 'Coordinate your team’s schedule and patient visits.',
    empty:
      'Appointment scheduling will be available here. Your clinic schedule has not been connected.',
    icon: CalendarDays,
    permission: 'appointments.read',
    group: 'Workspace',
  },
  {
    id: 'dental-charting',
    path: '/dental-charting',
    label: 'Dental Charting',
    description: 'Record clinical findings and maintain patient dental charts.',
    empty: 'Dental charting will be available in a future release.',
    icon: ScanLine,
    permission: 'clinical.read',
    group: 'Workspace',
  },
  {
    id: 'treatments',
    path: '/treatments',
    label: 'Treatments',
    description: 'Organize treatment plans and follow the progress of care.',
    empty: 'Treatment planning will be available in a future release.',
    icon: Stethoscope,
    permission: 'clinical.read',
    group: 'Workspace',
  },
  {
    id: 'billing',
    path: '/billing',
    label: 'Billing & Payments',
    description: 'Manage invoices, payments, and outstanding balances.',
    empty:
      'Billing will be available in a future release. No financial data is displayed in this preview.',
    icon: WalletCards,
    permission: 'billing.read',
    group: 'Workspace',
  },
  {
    id: 'inventory',
    path: '/inventory',
    label: 'Inventory',
    description: 'Keep track of dental supplies and clinic stock.',
    empty: 'Inventory management will be available in a future release.',
    icon: Package,
    permission: 'inventory.read',
    group: 'Workspace',
  },
  {
    id: 'staff',
    path: '/staff',
    label: 'Staff Management',
    description: 'Manage your clinic team and their access.',
    empty:
      'Staff management will be available in a future release. Contact your administrator for account changes.',
    icon: UserRoundCog,
    permission: 'staff.read',
    group: 'Administration',
  },
  {
    id: 'reports',
    path: '/reports',
    label: 'Reports',
    description: 'Review clinic activity and operational reports.',
    empty: 'Reports will be available as clinic workflows are enabled.',
    icon: ChartNoAxesCombined,
    permission: 'reports.read',
    group: 'Administration',
  },
  {
    id: 'settings',
    path: '/settings',
    label: 'Settings',
    description: 'Configure clinic preferences and administration.',
    empty: 'Clinic settings will be available in a future release.',
    icon: Settings2,
    permission: 'settings.read',
    group: 'Administration',
  },
] as const satisfies readonly {
  id: string
  path: string
  label: string
  description: string
  empty: string
  icon: LucideIcon
  permission: Permission
  group: string
}[]

export type ModuleId = (typeof modules)[number]['id']
