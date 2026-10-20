import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { ComponentProps } from 'react'

export function SearchInput({
  label = 'Search',
  ...props
}: ComponentProps<typeof Input> & { label?: string }) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        aria-label={label}
        placeholder={label}
        className="pl-9"
        {...props}
      />
    </div>
  )
}
