import { TriangleAlert } from 'lucide-react'
import { isApiError } from '@protobase/client'

type Detail = { message: string; hint?: string }

const describe = (error: unknown): Detail[] => {
  if (!isApiError(error)) return [{ message: error instanceof Error ? error.message : 'Something went wrong' }]
  const detailed = error.errors.map((entry) => ({ message: entry.message, hint: entry.hint }))
  return detailed.length > 0 ? detailed : [{ message: error.message }]
}

export const ErrorBanner = ({ error, title }: { error: unknown; title: string }) => (
  <div role="alert" className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger-text">
    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
    <div>
      <p className="font-medium">{title}</p>
      {describe(error).map((detail) => (
        <p key={detail.message} className="text-xs">
          {detail.message}
          {detail.hint && <span className="text-muted-foreground"> {detail.hint}</span>}
        </p>
      ))}
    </div>
  </div>
)
