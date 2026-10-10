import { useMutation } from '@tanstack/react-query'
import { FileText, Paperclip, Upload } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import type { FieldModel, FieldViewModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import { cn } from '../lib/cn'
import { acceptOf, fileShown, formatSize, isPreviewable, type FileDraft } from '../live/file-values'
import { humanize } from '../live/naming'
import { Button } from '../primitives/button'
import { ErrorBanner } from './error-banner'

export type FileFieldProps = {
  field: FieldModel
  hints?: FieldViewModel
  /** The resource the field belongs to, which the upload goes to. */
  resource: string
  /** The stored file object, a `FileDraft` after an upload, or null. */
  value: unknown
  locked?: boolean
  invalid?: boolean
  onChange: (value: unknown) => void
}

const Thumbnail = ({ url, type }: { url?: string; type: string }) =>
  url && isPreviewable(type) ? (
    <img src={url} alt="" className="size-10 shrink-0 rounded border border-border object-cover" />
  ) : (
    <span className="flex size-10 shrink-0 items-center justify-center rounded border border-border bg-muted text-muted-foreground">
      <FileText className="size-4" />
    </span>
  )

/** The file as it is: thumbnail or icon, name (a link while it has a URL), type and size, and what the server corrected. */
const FileSummary = ({ value }: { value: unknown }) => {
  const shown = fileShown(value)
  if (!shown) return <div className="py-1.5 text-[13px] text-muted-foreground">—</div>
  if ('missing' in shown) return <div className="py-1.5 text-[13px] text-danger-text">The file is missing from storage</div>
  const url = 'url' in shown ? shown.url : undefined
  const corrected = 'corrected' in shown ? shown.corrected : undefined
  return (
    <div className="flex min-w-0 items-center gap-3 py-1">
      <Thumbnail url={url} type={shown.type} />
      <div className="min-w-0 text-[13px]">
        {url && !url.startsWith('blob:') ? (
          <a href={url} target="_blank" rel="noreferrer" className="block truncate font-medium text-primary-text hover:underline">{shown.name}</a>
        ) : (
          <span className="block truncate font-medium">{shown.name}</span>
        )}
        <span className="block truncate text-xs text-muted-foreground">
          {shown.type}
          {shown.size !== undefined && ` · ${formatSize(shown.size)}`}
          {corrected && ` · sent as ${corrected.from}`}
        </span>
      </div>
    </div>
  )
}

/**
 * A file field: drop a file or choose one, and it uploads at once with progress; Save then stores it with the record.
 * The type shown is the one the server detected, so a `photo.png` that is a JPEG says so.
 */
export const FileField = ({ field, hints, resource, value, locked, invalid, onChange }: FileFieldProps) => {
  const client = useClient()
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | undefined>()
  const [dragging, setDragging] = useState(false)
  const label = hints?.label ?? humanize(field.name)
  const upload = useMutation({
    mutationFn: async (file: File) => {
      setProgress(0)
      const uploaded = await client.upload(resource, field.name, file, { onProgress: (sent, total) => setProgress(total > 0 ? sent / total : 0) })
      return { uploaded, ...(isPreviewable(uploaded.file.type) && { preview: URL.createObjectURL(file) }) } satisfies FileDraft
    },
    onSuccess: (draft) => onChange(draft),
    onSettled: () => setProgress(undefined),
  })

  if (locked || field.readOnly) return <FileSummary value={value} />

  const choose = (files: FileList | null) => {
    const file = files?.[0]
    if (file) upload.mutate(file)
  }
  const drop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    choose(event.dataTransfer.files)
  }
  const picker = <input ref={input} type="file" hidden accept={acceptOf(field)} aria-label={`Choose a file for ${label}`} onChange={(event) => choose(event.target.files)} />
  const error = upload.error && <div className="mt-2"><ErrorBanner title="Not uploaded" error={upload.error} /></div>

  if (upload.isPending) {
    return (
      <div className="py-1.5" role="status" aria-label={`Uploading ${label}`}>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
        </div>
        <span className="text-xs text-muted-foreground">Uploading… {Math.round((progress ?? 0) * 100)}%</span>
      </div>
    )
  }

  if (fileShown(value)) {
    return (
      <div>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1"><FileSummary value={value} /></div>
          <Button size="sm" onClick={() => input.current?.click()}>Replace</Button>
          {field.nullable && <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Remove</Button>}
        </div>
        {picker}
        {error}
      </div>
    )
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className={cn(
          'flex items-center gap-3 rounded-md border border-dashed px-3 py-2.5 text-[13px] text-muted-foreground',
          dragging ? 'border-primary bg-primary/5' : invalid ? 'border-danger' : 'border-border-strong',
        )}
      >
        <Upload className="size-4 shrink-0" />
        <span className="flex-1">Drop a file here or</span>
        <Button size="sm" onClick={() => input.current?.click()}>
          <Paperclip className="size-3.5" />
          Choose a file
        </Button>
      </div>
      {picker}
      {error}
    </div>
  )
}
