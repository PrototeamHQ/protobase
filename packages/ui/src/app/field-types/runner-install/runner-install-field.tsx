import { useState } from 'react'
import { ApiError, type RunnerRegistration } from '@protobase/client'
import { builtInFieldTypes } from '@protobase/schema/internal'
import { CopyField } from '../../../account/copy-field'
import { useClient } from '../../../data/api-provider'
import { formatDateTime } from '../../../format/date'
import { Button } from '../../../primitives/button'
import type { FieldWidget, FieldWidgetProps } from '../field-widget'
import { text } from './messages'

// Why the server refused a token, said in the page's language: the runner registered or was revoked meanwhile, the
// caller may not change it, or another failure.
const refusalOf = (error: unknown) => {
  if (!(error instanceof ApiError)) return text('failed')
  if (error.slug === 'runner-registered') return text('registered')
  if (error.slug === 'runner-revoked') return text('revoked')
  if (error.status === 404) return text('notYours')
  return text('failed')
}

// A button that issues a new one-time token, then the one command that installs the runner with it, to copy, shown
// only here and now: the app keeps only the token's hash.
const InstallCommand = ({ value }: FieldWidgetProps<string>) => {
  const client = useClient()
  const [issued, setIssued] = useState<RunnerRegistration>()
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string>()
  if (value === null) return null
  const issue = async () => {
    setBusy(true)
    setRefused(undefined)
    await client.runnerRegistration(value).then(setIssued, (error: unknown) => setRefused(refusalOf(error)))
    setBusy(false)
  }
  return (
    <div className="grid gap-2">
      {issued && (
        <>
          <CopyField value={issued.command} copyLabel={text('copy')} />
          <p className="text-body text-muted-foreground">{text('shownOnce', { until: formatDateTime(Date.parse(issued.expires_at)) })}</p>
        </>
      )}
      {refused && (
        <p role="alert" className="text-body text-danger-text">
          {refused}
        </p>
      )}
      <Button size="sm" variant={issued ? 'secondary' : 'primary'} className="justify-self-start" loading={busy} onClick={() => void issue()}>
        {issued ? text('again') : text('issue')}
      </Button>
    </div>
  )
}

/**
 * The built-in `runner_install` field type, for a runner's id, as the `workflow_runners` resource shows its own:
 * `r.id.widget('runner_install')`. A button issues the runner a new one-time registration token and shows the one
 * command that installs it with that token, with a button to copy it, once; issuing again replaces the token. See the
 * workflows reference.
 */
export const runnerInstallField: FieldWidget = { of: [...builtInFieldTypes.runner_install], display: InstallCommand, cell: () => null }
