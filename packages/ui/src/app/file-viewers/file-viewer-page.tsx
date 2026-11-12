import { ArrowLeft, Download } from 'lucide-react'
import type { ResourceModel } from '@protobase/schema'
import { formatSize } from '../../live/file-values'
import { cn } from '../../lib/cn'
import { buttonClass } from '../../primitives/button'
import { Skeleton } from '../../primitives/skeleton'
import { CustomBoundary } from '../pages/custom-boundary'
import type { ProjectUi } from '../pages/project-ui'
import { AppLink } from '../use-app-address'
import { viewedFile, viewerFor, type FileViewer, type ViewedFile } from './file-viewer'
import { useSiblingFiles } from './use-sibling-files'
import { text } from './messages'

/** A record's file field and the viewer registered for its file's type; `undefined` when the field has no such file. */
export type ViewedField = { field: string; file: ViewedFile; viewer: FileViewer }

/** The file of `record`'s field `field` with the viewer `ui` registers for its media type, when it has one. */
export const viewedField = (ui: ProjectUi, model: ResourceModel, record: Record<string, unknown>, field: string): ViewedField | undefined => {
  if (model.fields[field]?.type !== 'file') return
  const file = viewedFile(record[field])
  const viewer = file && viewerFor(ui.fileViewers, file.type)
  return file && viewer ? { field, file, viewer } : undefined
}

const DownloadLink = ({ file, className }: { file: ViewedFile; className?: string }) => (
  <a href={file.url} download={file.name} className={cn(buttonClass({ size: 'sm' }), 'gap-1.5', className)}>
    <Download className="size-4" aria-hidden="true" />
    {text('download')}
  </a>
)

type FileViewerPageProps = {
  model: ResourceModel
  recordKey: string
  /** The record, as its page loaded it. */
  record: Record<string, unknown>
  viewed: ViewedField
}

/**
 * A record's file opened in the viewer for its media type, on the record's address with `?file=<field>`: a bar with the
 * way back to the record, the file's name and size and its download, then the viewer, with its siblings once read. A
 * viewer that throws leaves the download in its place.
 */
export const FileViewerPage = ({ model, recordKey, record, viewed }: FileViewerPageProps) => {
  const { file, viewer } = viewed
  const { siblings, ready } = useSiblingFiles(model, record, file)
  const Viewer = viewer.component
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 md:px-10">
        <AppLink to={{ kind: 'record', resource: model.name, key: recordKey }} className={cn(buttonClass({ variant: 'ghost', size: 'sm' }), 'gap-1.5')}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {text('backToRecord')}
        </AppLink>
        <h1 className="min-w-0 flex-1 truncate font-medium" title={file.name}>
          {file.name}
          {file.size !== undefined && <span className="ml-2 text-xs font-normal text-muted-foreground">{formatSize(file.size)}</span>}
        </h1>
        <DownloadLink file={file} />
      </div>
      <div className="flex-1">
        {ready ? (
          <CustomBoundary name={file.type} fallback={<ViewerFailed file={file} />}>
            <Viewer file={file} siblings={siblings} />
          </CustomBoundary>
        ) : (
          <div className="space-y-3 px-4 py-6 md:px-10">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-40" />
          </div>
        )}
      </div>
    </div>
  )
}

const ViewerFailed = ({ file }: { file: ViewedFile }) => (
  <div className="flex flex-col items-start gap-3 px-4 py-6 md:px-10" role="alert">
    <p>{text('couldNotShow', { name: file.name })}</p>
    <DownloadLink file={file} />
  </div>
)
