import { Check, Paperclip } from 'lucide-react'
import { userById } from '../mocks'
import { Avatar } from '../primitives/avatar'
import { Badge } from '../primitives/badge'
import { cn } from '../lib/cn'
import { FileImage } from '../live/file-image'
import { fileShown, shownImage } from '../live/file-values'
import { valueColor } from '../live/value-color'
import type { ColumnSpec } from './column-spec'
import { cellText } from './cell-text'
import { viewerZone, zoneLabel } from '../format/zone'
import { TruncatedText } from './truncated-text'
import { ContactLink } from '../live/contact-link'

const muted = (text: string) => <span className="text-faint-foreground">{text}</span>

export const renderCell = (spec: ColumnSpec, value: unknown) => {
  if (value === null || value === undefined) return muted('—')
  const text = cellText(spec, value) ?? ''
  switch (spec.kind) {
    case 'text':
      return spec.link ? <ContactLink format={spec.link} value={text} className="block min-w-0 truncate" /> : <TruncatedText text={text} />
    case 'id':
      return <TruncatedText text={text} className="font-mono text-xs text-muted-foreground" />
    case 'money':
      return <span className="tabular-nums">{text}</span>
    case 'date':
      return <span className="tabular-nums text-muted-foreground">{text}</span>
    case 'datetime':
      return <span className="tabular-nums text-muted-foreground" title={`Shown in ${zoneLabel(Number(value), viewerZone())}`}>{text}</span>
    case 'number':
      return <span className="tabular-nums">{text}</span>
    case 'signed':
      return <span className={cn('tabular-nums', Number(value) < 0 ? 'text-danger-text' : 'text-success-text')}>{text}</span>
    case 'percent':
      return Number(value) === 0 ? muted('—') : <span className="tabular-nums">{text}</span>
    case 'status':
      return (
        <Badge tone={spec.tones?.[String(value)] ?? 'neutral'} color={valueColor(spec.colors, value)} shape={spec.shape}>
          {text}
        </Badge>
      )
    case 'relation':
      return <TruncatedText text={text} className="font-medium text-primary-text hover:underline" />
    case 'boolean':
      return value ? (
        <span className="inline-flex size-4 items-center justify-center rounded-full bg-success-soft text-success-text"><Check className="size-3" strokeWidth={3} /></span>
      ) : (
        muted('No')
      )
    case 'file': {
      const file = fileShown(value)
      if (!file) return muted('—')
      if ('missing' in file) return <TruncatedText text={file.name} className="text-danger-text" />
      const image = shownImage(value, { width: 20, height: 20 })
      return (
        <span className="inline-flex min-w-0 items-center gap-2">
          {image ? <FileImage image={image} className="size-5 shrink-0 rounded-sm object-cover" /> : <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />}
          <TruncatedText text={file.name} />
        </span>
      )
    }
    case 'user': {
      const user = userById(String(value))
      return (
        <span className="inline-flex items-center gap-2 truncate">
          <Avatar initials={user.initials} hue={user.hue} size="xs" className="ring-0" />
          <TruncatedText text={user.name} className="text-muted-foreground" />
        </span>
      )
    }
  }
}
