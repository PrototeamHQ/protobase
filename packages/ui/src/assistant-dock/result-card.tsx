import { CircleCheck, CircleX, GitCommitHorizontal } from 'lucide-react'
import { cn } from '../lib/cn'
import { formatCredits, type JobResult } from './model'

const headings = { live: 'Live now', failed: 'The change failed', capped: 'The change hit its limit' }

/** How a job ended: live with its commit, or failed or capped at no cost, with the database changes that stay live. */
export const ResultCard = ({ result }: { result: JobResult }) => {
  const live = result.outcome === 'live'
  const Icon = live ? CircleCheck : CircleX
  return (
    <section aria-label={headings[result.outcome]} className={cn('shrink-0 overflow-hidden rounded-lg border bg-background shadow-sm', live ? 'border-success/40' : 'border-danger/40')}>
      <header className={cn('flex items-center gap-2 px-3 py-2', live ? 'bg-success-soft text-success-text' : 'bg-danger-soft text-danger-text')}>
        <Icon className="size-3.5" />
        <h3 className="flex-1 text-[13px] font-semibold">{headings[result.outcome]}</h3>
        <span className="text-xs font-medium">{live ? formatCredits(result.credits) : 'No charge'}</span>
      </header>
      <div className="space-y-2.5 px-3 py-2.5">
        <p className="text-[13px]">{result.summary}</p>
        {result.commit && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitCommitHorizontal className="size-3.5" />
            {result.commit.url ? (
              <a className="font-mono text-primary-text hover:underline" href={result.commit.url} target="_blank" rel="noreferrer">{result.commit.sha.slice(0, 7)}</a>
            ) : (
              <span className="font-mono">{result.commit.sha.slice(0, 7)}</span>
            )}
          </div>
        )}
        {result.keptOnBranch && <p className="text-xs text-muted-foreground">GitHub did not accept the push. The code is kept on the branch <code className="font-mono">{result.keptOnBranch}</code>.</p>}
        {result.dbChanges.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold">{live ? 'Database changes' : 'Database changes that stay live'}</div>
            <ul className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
              {result.dbChanges.map((change) => <li key={change}>{change}</li>)}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
