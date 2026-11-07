import { Play } from 'lucide-react'
import type { ReactNode } from 'react'
import { buttonClass } from '../../../primitives/button'
import { Select } from '../../../primitives/select'
import { ErrorBanner } from '../../error-banner'
import { usePermissions } from '../../meta-gate'
import { can } from '../../permissions'
import { AppLink, useAppAddress } from '../../use-app-address'
import { runLabel, versionLabel } from './picker-labels'
import type { WorkflowPage } from './use-workflow-page'
import { useRunStatus } from './use-run-status'
import { closedRunAddress, runAddress, versionAddress, type WorkflowView } from './workflow-view'
import { text } from './messages'

const Picker = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground max-sm:w-full">
    {label}
    {children}
  </label>
)

/**
 * Above a workflow's graph: the version it shows, every saved one to choose from with the latest and the enabled one
 * marked; the run it shows, from its latest runs; and Test run, which starts one.
 */
export const WorkbenchToolbar = ({ view, page }: { view: WorkflowView; page: WorkflowPage }) => {
  const { go } = useAppAddress()
  const status = useRunStatus()
  const mayRun = can(usePermissions('workflow_runs'), 'create')
  const { latest, enabled, shown } = page
  const current = shown ?? latest
  // The version and run shown are offered even when they are older than the lists reach
  const versions = current === undefined || page.versions.some((each) => each.version === current) ? page.versions : [...page.versions, { version: current, savedAt: '' }]
  const opened: Record<string, unknown>[] = page.trace.run && view.run && !page.runs.some((run) => run.id === view.run) ? [{ ...page.trace.run, id: view.run }] : []
  const runs = [...opened, ...page.runs]
  const openRun = (id: string) => {
    if (id === '') return go(closedRunAddress(view, latest))
    const run = runs.find((each) => String(each.id) === id)
    if (run) go(runAddress(view.workflow, id, Number(run.version)))
  }
  if (page.versionsError) return <ErrorBanner title={text('versionsFailed')} error={page.versionsError} />
  if (page.runsError) return <ErrorBanner title={text('runsFailed')} error={page.runsError} />
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Picker label={text('version')}>
        <Select className="w-auto max-sm:w-full" value={current ?? ''} onChange={(event) => go(versionAddress(view.workflow, Number(event.target.value), latest))}>
          {versions.map(({ version, savedAt }) => (
            <option key={version} value={version}>
              {savedAt ? versionLabel(version, savedAt, { latest, enabled }) : text('versionNumber', { version })}
            </option>
          ))}
        </Select>
      </Picker>
      <Picker label={text('run')}>
        <Select className="w-auto max-sm:w-full" value={view.run ?? ''} onChange={(event) => openRun(event.target.value)}>
          <option value="">{text('noRun')}</option>
          {runs.map((run) => (
            <option key={String(run.id)} value={String(run.id)}>
              {runLabel(String(run.created_at), status.label(run.status), Number(run.version))}
            </option>
          ))}
        </Select>
      </Picker>
      {mayRun && (
        <AppLink to={{ kind: 'create', resource: 'workflow_runs', values: { workflow_id: view.workflow } }} className={buttonClass({ size: 'sm' })}>
          <Play className="mr-1.5 size-3.5" />
          {text('testRun')}
        </AppLink>
      )}
    </div>
  )
}
