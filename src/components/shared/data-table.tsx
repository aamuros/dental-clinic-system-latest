import { useTable } from '@tanstack/react-table'
import type { ColumnDef, RowData } from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const features = {}

export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  caption,
  emptyMessage = 'No results.',
}: {
  columns: ColumnDef<typeof features, TData>[]
  data: TData[]
  getRowId: (row: TData) => string
  caption: string
  emptyMessage?: string
}) {
  const table = useTable({ features, columns, data, getRowId })
  const rows = table.getRowModel().rows
  return (
    <Table>
      <TableCaption className="sr-only">{caption}</TableCaption>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead key={header.id} colSpan={header.colSpan}>
                {!header.isPlaceholder && <table.FlexRender header={header} />}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={Math.max(1, table.getAllLeafColumns().length)}
              className="h-32 text-center text-muted-foreground"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
