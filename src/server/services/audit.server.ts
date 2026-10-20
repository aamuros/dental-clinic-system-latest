import '@tanstack/react-start/server-only'

export interface AuditEvent {
  action: string
  resourceType: string
  resourceId: string | null
  branchId: string | null
}

// Future workflow implementations must derive actor/clinic from verified context,
// append within the data mutation transaction, and never include clinical payloads.
// There is intentionally no generic client-callable audit insertion endpoint.
export interface AuditWriter {
  append(event: AuditEvent): Promise<void>
}
