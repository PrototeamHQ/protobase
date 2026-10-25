import { Spinner } from '../../primitives/spinner'
import { text } from '../messages'

/** An account block whose data is not in yet: why it could not be read, or that it is loading. */
export const AccountLoading = ({ error }: { error?: string }) =>
  error ? (
    <p role="alert" className="text-danger-text">
      {error}
    </p>
  ) : (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Spinner /> {text('loading')}
    </div>
  )
