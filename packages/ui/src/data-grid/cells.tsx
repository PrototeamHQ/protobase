import { Check } from 'lucide-react'
import { enumLabel } from '@protobase/schema'
import { formatDate, formatDateTime } from '../format/date'
import { formatInt, formatPercent, formatSigned } from '../format/number'
import { formatMoney } from '../format/money'
import { userById } from '../mocks'
import { Avatar } from '../primitives/avatar'
import { Badge } from '../primitives/badge'
import { cn } from '../lib/cn'
import type { ColumnSpec } from './column-spec'

const muted = (text: string) => <span className="text-faint-foreground">{text}</span>

const relationLabel = (value: unknown) => (typeof value === 'object' && value !== null && 'name' in value ? String(value.name) : String(value))

export const renderCell = (spec: ColumnSpec, value: unknown) => {
  if (value === null || value === undefined) return muted('—')
  switch (spec.kind) {
    case 'text':
      return <span className="truncate">{String(value)}</span>
    case 'id':
      return <span className="truncate font-mono text-xs text-muted-foreground">{String(value)}</span>
    case 'money':
      return <span className="tabular-nums">{formatMoney(Number(value), spec.currency)}</span>
    case 'date':
      return <span className="tabular-nums text-muted-foreground">{formatDate(Number(value))}</span>
    case 'datetime':
      return <span className="tabular-nums text-muted-foreground">{formatDateTime(Number(value))}</span>
    case 'number':
      return <span className="tabular-nums">{formatInt(Number(value))}</span>
    case 'signed':
      return <span className={cn('tabular-nums', Number(value) < 0 ? 'text-danger-text' : 'text-success-text')}>{formatSigned(Number(value))}</span>
    case 'percent':
      return Number(value) === 0 ? muted('—') : <span className="tabular-nums">{formatPercent(Number(value))}</span>
    case 'status':
      return <Badge tone={spec.tones?.[String(value)] ?? 'neutral'}>{enumLabel(String(value), spec.labels)}</Badge>
    case 'relation':
      return <span className="truncate font-medium text-primary-text hover:underline">{relationLabel(value)}</span>
    case 'boolean':
      return value ? (
        <span className="inline-flex size-4 items-center justify-center rounded-full bg-success-soft text-success-text"><Check className="size-3" strokeWidth={3} /></span>
      ) : (
        muted('No')
      )
    case 'user': {
      const user = userById(String(value))
      return (
        <span className="inline-flex items-center gap-2 truncate">
          <Avatar initials={user.initials} hue={user.hue} size="xs" className="ring-0" />
          <span className="truncate text-muted-foreground">{user.name}</span>
        </span>
      )
    }
  }
}
