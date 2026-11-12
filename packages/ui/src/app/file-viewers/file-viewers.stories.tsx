import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ComponentType } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { createStaticSession, type ResourcePermissions } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app'
import { defineUi } from '../pages/project-ui'
import { fakeApi } from '../testing/fake-api'
import { fileNamed, type FileViewerProps } from './file-viewer'
import { useFileText } from './use-file-text'

const meta = { title: 'Record page/File viewers', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const reportType = 'application/vnd.example.report+json'

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly().filterable(), title: f.text() })
  .primaryKey((r) => r.id)

const attachments = resource('attachments')
  .table('attachments')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    task_id: f.relation('tasks').optional().filterable(),
    file: f.file(),
  })
  .primaryKey((r) => r.id)

const tasksView = view<typeof tasks>('tasks').title((r) => r.title).names({ singular: 'Task', plural: 'Tasks' })
const attachmentsView = view<typeof attachments>('attachments').names({ singular: 'File', plural: 'Files' }).list((r) => ({ columns: [r.file, r.task_id] }))

const json = (value: unknown) => `data:${reportType};base64,${btoa(JSON.stringify(value))}`
const pngUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const report = { title: 'Weekly report', chart: 'chart.png' }

const rows = {
  tasks: [{ id: 7, title: 'Ship the report' }],
  attachments: [
    { id: 1, task_id: 7, file: { uri: 'private:1/a.report.json?name=weekly.report.json&size=48', name: 'weekly.report.json', type: reportType, size: 48, url: json(report) } },
    { id: 2, task_id: 7, file: { uri: 'private:1/b.png?name=chart.png&size=70', name: 'chart.png', type: 'image/png', size: 70, url: pngUrl } },
    { id: 3, task_id: null, file: { uri: 'private:1/c.json?name=notes.json&size=2', name: 'notes.json', type: 'application/json', size: 2, url: 'data:application/json,{}' } },
  ],
}

const permissions: Record<string, ResourcePermissions> = {
  tasks: { read: true, create: false, update: false, delete: false, conditional: [] },
  attachments: { read: true, create: true, update: true, delete: false, conditional: [] },
}

// An app's own viewer: it reads the file, and shows the sibling its JSON names by file name.
const ReportViewer = ({ file, siblings }: FileViewerProps) => {
  const read = useFileText(file)
  if (!read.data) return <p className="p-6">Reading…</p>
  const shown = JSON.parse(read.data) as typeof report
  const chart = fileNamed(siblings, shown.chart)
  return (
    <article className="space-y-3 p-6">
      <h2 className="text-lg font-semibold">{shown.title}</h2>
      {chart && <img src={chart.url} alt={`Chart: ${chart.name}`} className="size-16 border" />}
    </article>
  )
}

const Broken = (): never => {
  throw new Error('This viewer cannot draw the file')
}

const Files = ({ path, viewer }: { path: string; viewer: ComponentType<FileViewerProps> }) => {
  const [api] = useState(() => fakeApi({ resources: [tasks.toModel(), attachments.toModel()], views: [tasksView.toModel(), attachmentsView.toModel()], rows, permissions }))
  const ui = defineUi({ fileViewers: { [reportType]: { component: viewer } } })
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={path} ui={ui} />
    </div>
  )
}

/** A file of a type an app registered a viewer for opens in it, with the files beside it; other files still download. */
export const OpenInItsViewer: StoryObj = {
  tags: ['play'],
  render: () => <Files path="/attachments/1" viewer={ReportViewer} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('link', { name: 'weekly.report.json' }))
    expect(await canvas.findByRole('heading', { name: 'Weekly report' })).toBeTruthy()
    expect(await canvas.findByRole('img', { name: 'Chart: chart.png' })).toHaveAttribute('src', pngUrl)
    expect(canvas.getByRole('link', { name: 'Download' })).toHaveAttribute('download', 'weekly.report.json')
    await userEvent.click(canvas.getByRole('link', { name: 'Back to the record' }))
    expect(await canvas.findByRole('link', { name: 'weekly.report.json' })).toBeTruthy()
  },
}

/** A file no viewer is registered for links to its download, as before. */
export const DownloadWithoutAViewer: StoryObj = {
  tags: ['play'],
  render: () => <Files path="/attachments/3" viewer={ReportViewer} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('link', { name: 'notes.json' })).toHaveAttribute('href', 'data:application/json,{}')
  },
}

/** A viewer that throws leaves the file's download in its place. */
export const ViewerThatThrows: StoryObj = {
  tags: ['play'],
  render: () => <Files path="/attachments/1?file=file" viewer={Broken} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('alert')).toHaveTextContent('weekly.report.json could not be shown here.')
    expect(canvas.getAllByRole('link', { name: 'Download' })).toHaveLength(2)
  },
}
