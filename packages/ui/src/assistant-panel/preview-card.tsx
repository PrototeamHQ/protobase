import { ExternalLink } from 'lucide-react'
import { Button } from '../primitives/button'
import { migrationSql } from './content'
import { DiffView } from './diff-view'

export const PreviewCard = ({ approved, onApprove }: { approved?: boolean; onApprove?: () => void }) => (
  <div className="shrink-0 overflow-hidden rounded-lg border border-primary-border bg-background shadow-sm">
    <div className="flex items-center gap-2 bg-primary-soft px-3 py-2">
      <ExternalLink className="size-3.5 text-primary-text" />
      <a className="min-w-0 flex-1 truncate text-[13px] font-medium text-primary-text hover:underline" href="#preview">
        preview-7f3a.protobase.app
      </a>
    </div>
    <div className="space-y-2 px-3 py-2.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>3 files changed</span>
        <span><span className="font-medium text-success-text">+4</span> <span className="font-medium text-danger-text">{'−'}1</span></span>
      </div>
      <div className="text-xs font-semibold">Migration, runs on approve</div>
      <div className="overflow-hidden rounded-md border border-border">
        <DiffView source={migrationSql} />
      </div>
      <Button variant="primary" className="w-full" disabled={approved} onClick={onApprove}>
        {approved ? 'Approved' : 'Approve'}
      </Button>
    </div>
  </div>
)
