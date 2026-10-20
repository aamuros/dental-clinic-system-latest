import { createFileRoute, Outlet } from '@tanstack/react-router'
import { getPatientFn } from '@/server/functions/patients'

export const Route = createFileRoute('/_app/patients/$patientId')({
  loader: ({ params }) => getPatientFn({ data: { id: params.patientId } }),
  component: Outlet,
})
