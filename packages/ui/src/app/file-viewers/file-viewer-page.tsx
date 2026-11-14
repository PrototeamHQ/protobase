import { ArrowLeft } from 'lucide-react'
import type { AppAddress, ResourceModel } from '@protobase/schema'
import { formatSize } from '../../live/file-values'
import { cn } from '../../lib/cn'
import { buttonClass } from '../../primitives/button'
import { CustomBoundary } from '../pages/custom-boundary'
import type { ProjectUi } from '../pages/project-ui'
import { AppLink } from '../use-app-address'
import { fileViewerFor } from './built-in-viewers'
import { PageSkeleton } from './page-skeleton'
import { DownloadLink } from './download-link'
import { viewedFile, type FileViewer, type ViewedFile } from './file-viewer'
import { useSiblingFiles } from './use-sibling-files'
import { ViewedResourceContext } from './viewed-resource'
import { text } from './messages'

/** A record's file field with its file, and the viewer for its file's type when there is one. */
export type ViewedField = { field: string; file: ViewedFile; viewer?: FileViewer }

/** The file of `record`'s field `field`, with the viewer for its media type (`fileViewerFor`) when it has one. */
export const viewedField = (ui: ProjectUi, model: ResourceModel, record: Record<string, unknown>, field: string): ViewedField | undefined => {
  if (model.fields[field]?.type !== 'file') return
  const file = viewedFile(record[field])
  if (!file) return
  const viewer = fileViewerFor(ui, file.type)
  return viewer ? { field, file, viewer } : { field, file }
}

type FileViewerPageProps = {
  model: ResourceModel
  /** The record, as its page loaded it. */
  record: Record<string, unknown>
  viewed: ViewedField
  /** Where the way back leads: the record page the file was opened from. */
  back: AppAddress
}

/**
 * A record's file on the record's address with `?file=<field>`: a bar with the way back to the record, the file's name
 * and size and its download, then the viewer for its media type, with its siblings once read. A file with no viewer,
 * such as one a page links to, says so beside its download; a viewer that throws leaves the download in its place.
 */
export const FileViewerPage = ({ model, record, viewed, back }: FileViewerPageProps) => {
  const { file, viewer } = viewed
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 md:px-10">
        <AppLink to={back} className={cn(buttonClass({ variant: 'ghost', size: 'sm' }), 'gap-1.5')}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {text('backToRecord')}
        </AppLink>
        <h1 className="min-w-0 flex-1 truncate font-medium" title={file.name}>
          {file.name}
          {file.size !== undefined && <span className="ml-2 text-xs font-normal text-muted-foreground">{formatSize(file.size)}</span>}
        </h1>
        <DownloadLink file={file} />
      </div>
      <div className="flex-1">{viewer ? <ViewerWithSiblings model={model} record={record} file={file} viewer={viewer} /> : <NoPreview file={file} />}</div>
    </div>
  )
}

const ViewerWithSiblings = ({ model, record, file, viewer }: { model: ResourceModel; record: Record<string, unknown>; file: ViewedFile; viewer: FileViewer }) => {
  const { siblings, ready } = useSiblingFiles(model, record, file)
  if (!ready) return <PageSkeleton name={file.name} />
  const Viewer = viewer.component
  return (
    <ViewedResourceContext.Provider value={model.name}>
      <CustomBoundary name={file.type} fallback={<ViewerFailed file={file} />}>
        <Viewer file={file} siblings={siblings} />
      </CustomBoundary>
    </ViewedResourceContext.Provider>
  )
}

const NoPreview = ({ file }: { file: ViewedFile }) => (
  <div className="flex flex-col items-start gap-3 px-4 py-6 md:px-10" role="status">
    <p>{text('noPreview', { name: file.name })}</p>
    <DownloadLink file={file} />
  </div>
)

const ViewerFailed = ({ file }: { file: ViewedFile }) => (
  <div className="flex flex-col items-start gap-3 px-4 py-6 md:px-10" role="alert">
    <p>{text('couldNotShow', { name: file.name })}</p>
    <DownloadLink file={file} />
  </div>
)
