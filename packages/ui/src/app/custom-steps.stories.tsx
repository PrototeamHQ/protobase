import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, spyOn, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession, type ResourcePermissions } from '@protobase/client'
import { workflowResources } from '@protobase/schema/internal'
import { App } from './app'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Built-in pages/Custom steps and runners', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'lotte', email: 'lotte@example.test', name: 'Lotte de Vries', role: 'admin' })

// The pages `workflows({ customSteps: true })` adds, as an app gets them.
const custom = workflowResources('workflows', { customSteps: true })
const pairs = [
  [custom.customSteps!, custom.customStepsView!],
  [custom.customStepVersions!, custom.customStepVersionsView!],
  [custom.runners!, custom.runnersView!],
  [custom.customStepJobs!, custom.customStepJobsView!],
  [custom.customStepBuilds!, custom.customStepBuildsView!],
  [custom.workflowRuns, custom.workflowRunsView],
] as const
const resources = pairs.map(([resource]) => resource.toModel())
const views = pairs.map(([resource, view]) => view.toModel(resource.toModel() as never))

const step = '5e1a0000-0000-4000-8000-000000000001'
const version = '5e1a0000-0000-4000-8000-000000000011'
const earlier = '5e1a0000-0000-4000-8000-000000000010'
const box = '5e1a0000-0000-4000-8000-000000000021'
const fresh = '5e1a0000-0000-4000-8000-000000000022'
const run = '5e1a0000-0000-4000-8000-000000000031'
const job = '5e1a0000-0000-4000-8000-000000000041'

const container = {
  dockerfile: 'FROM mwader/static-ffmpeg:7.1.1 AS ffmpeg\nFROM debian:bookworm-slim\nCOPY --from=ffmpeg /ffmpeg /usr/local/bin/\nCOPY convert.sh /usr/local/bin/convert\nUSER 65532:65532',
  files: { 'convert.sh': '#!/bin/sh\nset -eu\nffmpeg -i "$PROTOBASE_IN/video/$(jq -r .video.name "$PROTOBASE_INPUT")" "$PROTOBASE_OUT/clip.mp4"' },
  command: ['convert'],
}
const manifest = { label: 'Convert a video', description: 'Scales a video and encodes it as H.264.', kind: 'container', container, input: { type: 'object', required: ['video'], properties: { video: { 'x-file': true } } }, output: { type: 'object', properties: { video: { 'x-file': true } } }, error_prefix: 'Ffmpeg', errors: { UnsupportedInput: 'the file is not a video FFmpeg can read' } }
const state = { platform: 'linux/amd64', kinds: ['container', 'build'], labels: [], capacity: { slots: 2 }, images: [{ step: 'custom:ffmpeg_convert:2' }], instances: [] }

const rows = {
  workflow_custom_steps: [{ id: step, name: 'ffmpeg_convert', version: 2, ...manifest, tenant_id: '1', created_at: '2026-11-14T09:00:00Z', updated_at: '2026-11-15T09:00:00Z' }],
  workflow_custom_step_versions: [
    { id: version, custom_step_id: step, version: 2, name: 'ffmpeg_convert', ...manifest, saved_by: 'lotte', tenant_id: '1', saved_at: '2026-11-15T09:00:00Z' },
    { id: earlier, custom_step_id: step, version: 1, name: 'ffmpeg_convert', ...manifest, container: { ...container, dockerfile: 'FROM debian:bookworm-slim' }, saved_by: 'lotte', tenant_id: '1', saved_at: '2026-11-14T09:00:00Z' },
  ],
  workflow_custom_step_builds: [
    { id: 'b2', runner_id: box, version_id: version, step: 'custom:ffmpeg_convert:2', status: 'ready', digest: 'sha256:5a1e0f9c', log: 'writing image sha256:5a1e0f9c', started_at: '2026-11-15T09:00:05Z', finished_at: '2026-11-15T09:01:10Z', tenant_id: '1' },
  ],
  workflow_runners: [
    { id: box, name: 'Video box', labels: ['gpu'], revoked: false, revoked_at: null, registration_expires_at: '2026-11-14T10:00:00Z', registered_at: '2026-11-14T09:10:00Z', platform: 'linux/amd64', kinds: ['container', 'build'], state, free_slots: 2, images: ['custom:ffmpeg_convert:2'], polled_at: '2026-11-15T09:30:00Z', polling_until: '2026-11-15T09:30:50Z', tenant_id: '1', created_at: '2026-11-14T09:00:00Z', updated_at: '2026-11-14T09:00:00Z' },
    { id: fresh, name: 'Spare box', labels: [], revoked: false, revoked_at: null, registration_expires_at: null, registered_at: null, platform: null, kinds: [], state: null, free_slots: null, images: [], polled_at: null, polling_until: null, tenant_id: '1', created_at: '2026-11-15T09:00:00Z', updated_at: '2026-11-15T09:00:00Z' },
  ],
  workflow_custom_step_jobs: [
    { id: job, run_id: run, state: 'Test', step: 'custom:ffmpeg_convert:2', version_id: version, input: { video: { configuration: 'videos', path: 'in/sample.mp4', name: 'sample.mp4', type: 'video/mp4', size: 1048576 } }, status: 'failed', runner_id: box, requeues: 0, lease_until: null, queued_at: '2026-11-15T09:20:00Z', claimed_at: '2026-11-15T09:20:01Z', finished_at: '2026-11-15T09:20:04Z', output: null, error: 'Custom.Failed', cause: 'jq: not found', logs: [{ at: '2026-11-15T09:20:03Z', message: 'convert: line 3: jq: not found' }], tenant_id: '1' },
  ],
  workflow_runs: [{ id: run, workflow_id: null, version: null, test_step: 'custom:ffmpeg_convert:2', input: { video: { configuration: 'videos', path: 'in/sample.mp4', name: 'sample.mp4', type: 'video/mp4', size: 1048576 } }, status: 'failed', error: 'Custom.Failed', cause: 'jq: not found', started_by: 'lotte', tenant_id: '1', created_at: '2026-11-15T09:20:00Z', finished_at: '2026-11-15T09:20:04Z', duration_ms: 4000 }],
}

const writable: ResourcePermissions = { read: true, create: true, update: true, delete: true, conditional: [] }
const readOnly: ResourcePermissions = { read: true, create: false, update: false, delete: false, conditional: [] }
const permissions: Record<string, ResourcePermissions> = {
  workflow_custom_steps: writable,
  workflow_custom_step_versions: readOnly,
  workflow_runners: writable,
  workflow_custom_step_jobs: readOnly,
  workflow_custom_step_builds: readOnly,
  workflow_runs: readOnly,
}

// The test run's one step, as its trace keeps it.
const testTrace = async () => ({
  steps: [{ scope: '', seq: 1, state: 'Test', type: 'custom:ffmpeg_convert:2', status: 'failed' as const, attempt: 1, input: rows.workflow_runs[0]!.input, next: null, error: 'Custom.Failed', cause: 'jq: not found', logs: [{ at: '2026-11-15T09:20:00Z', message: 'Queued for a runner' }], startedAt: '2026-11-15T09:20:00Z', finishedAt: '2026-11-15T09:20:04Z', recorded: true }],
})

/** The rows the fake server holds, so a play can check what a save stored. */
let stored: Record<string, Array<Record<string, unknown>>> = {}

const Pages = ({ path, registration, granted = permissions, seeded = rows }: { path: string; registration?: Parameters<typeof fakeApi>[0]['runnerRegistration']; granted?: Record<string, ResourcePermissions>; seeded?: typeof rows }) => {
  const [api] = useState(() => {
    const created = fakeApi({ resources, views, rows: structuredClone(seeded), permissions: granted, workflowRunTrace: testTrace, ...(registration && { runnerRegistration: registration }) })
    stored = created.rows
    return created
  })
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={path} />
    </div>
  )
}

/** A custom step's page to someone who may only read it: its Dockerfile, the files beside it and its command as code, and its versions. */
export const CustomStep: StoryObj = {
  tags: ['play'],
  render: () => <Pages path={`/workflow_custom_steps/${step}`} granted={{ ...permissions, workflow_custom_steps: readOnly }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText(/FROM mwader\/static-ffmpeg:7\.1\.1 AS ffmpeg/)).toBeVisible()
    expect(canvas.getByText('convert.sh')).toBeVisible()
    expect(canvas.getByText(/ffmpeg -i/)).toBeVisible()
    expect(canvas.getByText('["convert"]')).toBeVisible()
    const versions = within((await canvas.findByRole('heading', { name: 'Versions' })).closest('section')!)
    expect(await versions.findAllByRole('row')).toHaveLength(3)
  },
}

/** Editing a custom step's container: the Dockerfile, a file added by its path, and the command one argument a line. */
export const EditContainer: StoryObj = {
  tags: ['play'],
  render: () => <Pages path={`/workflow_custom_steps/${step}`} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const dockerfile = (await canvas.findByDisplayValue(/FROM mwader\/static-ffmpeg/)) as HTMLTextAreaElement
    await userEvent.type(dockerfile, '\nRUN apt-get install -y jq')
    await userEvent.click(canvas.getByRole('button', { name: 'Add a file' }))
    const added = within(canvas.getByRole('group', { name: 'File 2' }))
    await userEvent.type(added.getByRole('textbox', { name: 'Path' }), 'presets/720.txt')
    await userEvent.type(canvas.getByRole('textbox', { name: 'Text of presets/720.txt' }), 'scale=-2:720')
    const command = canvas.getByRole('textbox', { name: /Command, one argument a line/ })
    await userEvent.type(command, '{enter}--preset{enter}720')
    await userEvent.click(canvas.getByRole('button', { name: 'Remove convert.sh' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    const saved = () => stored.workflow_custom_steps![0]!.container as typeof container
    await waitFor(() => expect(saved().files).toEqual({ 'presets/720.txt': 'scale=-2:720' }))
    expect(saved().command).toEqual(['convert', '--preset', '720'])
    expect(saved().dockerfile.slice(container.dockerfile.length)).toBe('\nRUN apt-get install -y jq')
  },
}

// A step whose command's last argument is a script of two lines.
const script = ['sh', '-c', 'echo first\necho second']
const scripted = { ...rows, workflow_custom_steps: [{ ...rows.workflow_custom_steps[0]!, container: { ...container, command: script } }] }

/** A command with an argument of two lines shows as a JSON list, and an edit of the Dockerfile alone keeps it exactly. */
export const EditKeepsCommand: StoryObj = {
  tags: ['play'],
  render: () => <Pages path={`/workflow_custom_steps/${step}`} seeded={scripted} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const dockerfile = await canvas.findByDisplayValue(/FROM mwader\/static-ffmpeg/)
    expect(canvas.getByRole('textbox', { name: /Command, one argument a line, or a JSON list/ })).toHaveValue(JSON.stringify(script))
    await userEvent.type(dockerfile, '\nRUN true')
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    const saved = () => stored.workflow_custom_steps![0]!.container as typeof container
    await waitFor(() => expect(saved().dockerfile.endsWith('\nRUN true')).toBe(true))
    expect(saved().command).toEqual(script)
  },
}

/** A version's page: its builds, one per runner, and the jobs that ran it. */
export const Version: StoryObj = {
  tags: ['play'],
  render: () => <Pages path={`/workflow_custom_step_versions/${version}`} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const builds = within((await canvas.findByRole('heading', { name: 'Builds' })).closest('section')!)
    expect(await builds.findByText('sha256:5a1e0f9c')).toBeVisible()
    const jobs = within((await canvas.findByRole('heading', { name: 'Jobs' })).closest('section')!)
    expect(await jobs.findByText('Custom.Failed')).toBeVisible()
  },
}

/** The runners, with their platform, last claim, free slots and the images they hold. */
export const Runners: StoryObj = {
  tags: ['play'],
  render: () => <Pages path="/workflow_runners" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = (await canvas.findByText('Video box')).closest('[role="row"]') as HTMLElement
    expect(within(row).getByText('linux/amd64')).toBeVisible()
    expect(within(row).getByText('2')).toBeVisible()
    expect(within(row).getByText(/custom:ffmpeg_convert:2/)).toBeVisible()
  },
}

/** A runner that never registered: a fresh install command, shown once, to copy, and revoking it after asking. */
export const InstallAndRevoke: StoryObj = {
  tags: ['play'],
  render: () => <Pages path={`/workflow_runners/${fresh}`} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    await userEvent.click(await canvas.findByRole('button', { name: 'New install command' }))
    const command = await canvas.findByText(/^curl -fsSL https:\/\/app\.example\.test\/api\/runners\/install\.sh \| sh -s -- --token pbr_once_/)
    expect(command).toBeVisible()
    expect(canvas.getByText(/It is shown only now/)).toBeVisible()
    const writeText = spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    await userEvent.click(canvas.getByRole('button', { name: 'Copy the install command' }))
    expect(writeText).toHaveBeenCalledWith(command.textContent)
    expect(await canvas.findByRole('button', { name: 'Copied' })).toBeVisible()
    writeText.mockRestore()
    expect(canvas.getByRole('button', { name: 'Issue another' })).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: /^Revoke/ }))
    const dialog = within(await page.findByRole('dialog', { name: 'Revoke?' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(stored.workflow_runners!.find((runner) => runner.id === fresh)!.revoked).toBe(true))
  },
}

/** A runner that registered meanwhile: the server refuses a new token, and the page says why. */
export const InstallRefused: StoryObj = {
  tags: ['play'],
  render: () => <Pages path={`/workflow_runners/${fresh}`} registration={async () => Promise.reject(new ApiError({ type: 'urn:protobase:problem:runner-registered', title: 'Conflict', status: 409, detail: 'This runner registered already' }))} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'New install command' }))
    expect(await canvas.findByRole('alert')).toHaveTextContent('This runner registered already: make a new runner to register another machine.')
  },
}

/** A runner that registered shows no install command, and its jobs. */
export const RegisteredRunner: StoryObj = {
  tags: ['play'],
  render: () => <Pages path={`/workflow_runners/${box}`} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('heading', { name: 'Machine' })).toBeVisible()
    expect(canvas.queryByRole('button', { name: 'New install command' })).toBeNull()
    const jobs = within((await canvas.findByRole('heading', { name: 'Jobs' })).closest('section')!)
    expect(await jobs.findByText('custom:ffmpeg_convert:2')).toBeVisible()
  },
}

/** A job's page: how it ended, its error and cause, and the lines its container wrote. */
export const Job: StoryObj = {
  tags: ['play'],
  render: () => <Pages path={`/workflow_custom_step_jobs/${job}`} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('jq: not found')).toBeVisible()
    expect(canvas.getByText('Custom.Failed')).toBeVisible()
    expect(canvas.getByRole('heading', { name: 'Logs' })).toBeVisible()
    expect(canvas.getByText(/convert: line 3: jq: not found/)).toBeVisible()
  },
}

/** A custom step's test run, of no workflow, opens on its own page: the step it tested, its one step's trace, and the way to its job. */
export const TestRun: StoryObj = {
  tags: ['play'],
  render: () => <Pages path={`/workflow_runs/${run}`} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('Tested step')).toBeVisible()
    expect(canvas.getAllByText('custom:ffmpeg_convert:2').length).toBeGreaterThan(0)
    // No way to a workflow it has not: neither replay nor re-run
    expect(canvas.queryByRole('button', { name: /Replay without writing/ })).toBeNull()
    expect(canvas.queryByRole('link', { name: /Re-run from a step/ })).toBeNull()
    const jobs = await canvas.findByRole('link', { name: "Open this run's jobs" })
    expect(canvas.getAllByText(/jq: not found/).length).toBeGreaterThan(0)
    await userEvent.click(jobs)
    const row = (await canvas.findByText('custom:ffmpeg_convert:2', { selector: '[role="row"] *' })).closest('[role="row"]') as HTMLElement
    expect(within(row).getByText('Failed')).toBeVisible()
    expect(canvas.queryByText('Tested step')).toBeNull()
  },
}

/** The runs list names a test run by the step it tested, and opening it keeps to its own page. */
export const RunsList: StoryObj = {
  tags: ['play'],
  render: () => <Pages path="/workflow_runs" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const cell = await canvas.findByText('custom:ffmpeg_convert:2')
    const row = cell.closest('[role="row"]') as HTMLElement
    await userEvent.click(within(row).getAllByRole('link')[0]!)
    // Its own page, not a workflow's
    expect(await canvas.findByText('Tested step')).toBeVisible()
  },
}
