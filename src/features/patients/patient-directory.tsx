import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { Plus, Search, UsersRound } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { hasPermission } from '@/lib/auth/permissions'
import { PATIENT_PAGE_SIZE } from '@/server/functions/patients'
import type { PatientDirectory } from '@/server/functions/patients'
import type { DirectorySearch } from './schemas'
import type { Workspace } from '@/types/auth'
import { formatBirthDate, formatRegistrationDate } from './patient-utils'

export function PatientDirectoryPage({
  workspace,
  data,
  search,
}: {
  workspace: Workspace
  data: PatientDirectory
  search: DirectorySearch
}) {
  const navigate = useNavigate({ from: '/patients/' })
  const loading = useRouterState({ select: (state) => state.isLoading })
  const canCreate = workspace.branches.some((branch) =>
    hasPermission(workspace.staff, 'patients.write', {
      clinicId: workspace.clinic.id,
      branchId: branch.id,
    }),
  )
  const pages = Math.max(1, Math.ceil(data.total / PATIENT_PAGE_SIZE))
  const filtered = !!(search.q || search.branchId)
  return (
    <>
      <PageHeader
        title="Patients"
        description="Patient details and contact information for your branches."
        action={
          canCreate && (
            <Button asChild>
              <Link to="/patients/new">
                <Plus aria-hidden="true" />
                Register patient
              </Link>
            </Button>
          )
        }
      />
      <form
        key={`${search.q}:${search.branchId}:${search.sort}`}
        className="mb-6 grid items-end gap-3 sm:grid-cols-[minmax(12rem,1fr)_auto_auto_auto]"
        onSubmit={(event) => {
          event.preventDefault()
          const values = new FormData(event.currentTarget)
          void navigate({
            search: {
              q: String(values.get('q') ?? ''),
              branchId: String(values.get('branchId') ?? ''),
              sort: String(values.get('sort')) as DirectorySearch['sort'],
              page: 1,
            },
          })
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="patient-search">Search patients</Label>
          <Input
            id="patient-search"
            name="q"
            type="search"
            maxLength={100}
            placeholder="Name, phone, or email"
            defaultValue={search.q}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="branch-filter">Branch</Label>
          <NativeSelect
            id="branch-filter"
            name="branchId"
            defaultValue={search.branchId}
          >
            <option value="">All accessible branches</option>
            {workspace.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="patient-sort">Sort by</Label>
          <NativeSelect
            id="patient-sort"
            name="sort"
            defaultValue={search.sort}
          >
            <option value="name">Name (A–Z)</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary" disabled={loading}>
          <Search aria-hidden="true" />
          {loading ? 'Loading…' : 'Apply'}
        </Button>
      </form>
      <div
        className="mb-3 flex items-center justify-between gap-3 text-sm"
        role="status"
      >
        <p className="text-muted-foreground">
          {data.total.toLocaleString()}{' '}
          {data.total === 1 ? 'patient' : 'patients'}
        </p>
        {filtered && (
          <Link
            to="/patients"
            search={{ q: '', branchId: '', sort: 'name', page: 1 }}
            className="underline underline-offset-4"
          >
            Clear filters
          </Link>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border" aria-busy={loading}>
        {data.patients.length ? (
          <Table>
            <TableCaption className="sr-only">Patient directory</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Birth date</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Registered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.patients.map((patient) => (
                <TableRow key={patient.id}>
                  <TableCell>
                    <Link
                      to="/patients/$patientId"
                      params={{ patientId: patient.id }}
                      className="font-medium underline-offset-4 hover:underline focus-visible:underline"
                    >
                      {patient.last_name}, {patient.first_name}
                      {patient.middle_name ? ` ${patient.middle_name}` : ''}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatBirthDate(patient.birth_date)}
                  </TableCell>
                  <TableCell>
                    <p>{patient.phone || '—'}</p>
                    {patient.email && (
                      <p className="text-xs text-muted-foreground">
                        {patient.email}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {patient.patient_branch_access
                      .map((link) => link.branches?.name)
                      .filter(Boolean)
                      .join(', ')}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatRegistrationDate(
                      patient.created_at,
                      workspace.clinic.timezone,
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={UsersRound}
            title={
              filtered
                ? 'No matching patients'
                : search.page > 1
                  ? 'No patients on this page'
                  : 'No patients yet'
            }
            description={
              filtered
                ? 'Try another name, contact detail, or branch.'
                : search.page > 1
                  ? 'Return to the first page to see current records.'
                  : 'Register a patient to start your branch directory.'
            }
            action={
              search.page > 1 ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    void navigate({ search: { ...search, page: 1 } })
                  }
                >
                  First page
                </Button>
              ) : canCreate && !filtered ? (
                <Button asChild>
                  <Link to="/patients/new">Register patient</Link>
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
      <nav
        aria-label="Patient pagination"
        className="mt-5 flex flex-wrap items-center justify-between gap-4"
      >
        <p className="text-xs text-muted-foreground">
          Page {search.page} of {pages} · {PATIENT_PAGE_SIZE} per page
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={loading || search.page <= 1}
            onClick={() =>
              void navigate({ search: { ...search, page: search.page - 1 } })
            }
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={loading || search.page >= pages}
            onClick={() =>
              void navigate({ search: { ...search, page: search.page + 1 } })
            }
          >
            Next
          </Button>
        </div>
      </nav>
    </>
  )
}
