import { useQueryClient } from '@tanstack/react-query'
import { isApiError } from '@protobase/client'
import type { SourceStatus } from '../data/meta-data'
import { keys } from '../data/query-keys'
import { Button } from '../primitives/button'
import { Spinner } from '../primitives/spinner'

// What went wrong, in words for the person using the app: the API's own problem when it answered with one.
const reason = (error: Error) => {
  if (!isApiError(error)) return 'It did not answer.'
  if (error.status === 401 || error.status === 403) return `It did not accept your sign-in: ${error.message}`
  return error.message
}

/** Where a resource drawn from another API would be while that API's `/meta` loads, or when it cannot be read. */
export const SourceNotice = ({ status }: { status: SourceStatus }) => {
  const queryClient = useQueryClient()
  if (status.state !== 'error') {
    return (
      <div className="flex h-full min-h-48 items-center justify-center gap-2 text-[13px] text-muted-foreground">
        <Spinner /> Loading from {status.source.label}
      </div>
    )
  }
  return (
    <div className="flex h-full min-h-48 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-[15px] font-semibold">Cannot reach {status.source.label}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{reason(status.error)} The rest of the app works as before.</p>
        <Button className="mt-3" onClick={() => void queryClient.refetchQueries({ queryKey: keys.sourceMetas(status.source.url) })}>
          Try again
        </Button>
      </div>
    </div>
  )
}
