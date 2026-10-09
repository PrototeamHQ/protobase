import { FileCode2 } from 'lucide-react'
import { diffStats, parseDiff } from './diff'
import { DiffView } from './diff-view'

export type ChangedFile = { path: string; diff: string; start?: number }

export const ChangeCard = ({ files }: { files: ChangedFile[] }) => (
  <div className="shrink-0 overflow-hidden rounded-lg border border-border-strong bg-background shadow-sm">
    {files.map((file) => {
      const stats = diffStats(parseDiff(file.diff))
      return (
        <div key={file.path} className="border-b border-border last:border-b-0">
          <div className="flex items-center gap-2 bg-surface px-3 py-1.5">
            <FileCode2 className="size-3.5 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{file.path}</span>
            <span className="text-[11px] font-medium text-success-text">+{stats.added}</span>
            {stats.removed > 0 && <span className="text-[11px] font-medium text-danger-text">{'−'}{stats.removed}</span>}
          </div>
          <DiffView source={file.diff} start={file.start} />
        </div>
      )
    })}
  </div>
)
