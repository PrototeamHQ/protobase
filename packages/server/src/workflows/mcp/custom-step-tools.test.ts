import { describe, expect, it, vi } from 'vitest'
import type { ApprovalAnswer } from '../../assistant/approval'
import type { ListParams, RecordPage, ToolRecords } from '../../assistant/records'
import type { ReadableResources, ToolContext } from '../../assistant/tools'
import { badRequest, notFound } from '../../problem'
import type { Row } from '../../types'
import { customStepReadTools, customStepWriteTools, type CustomStepCalls } from './custom-step-tools'

const ocr = { name: 'ocr', label: 'Read text', container: { dockerfile: 'FROM alpine', files: {} }, input: { type: 'object' }, output: { type: 'object' } }
const step = { id: 's1', version: 2, error_prefix: 'Custom', errors: {}, ...ocr }
const versions = [{ id: 'v2', custom_step_id: 's1', version: 2, saved_by: 'ada', saved_at: '2026-11-15T10:00:00.000Z' }, { id: 'v1', custom_step_id: 's1', version: 1, saved_by: 'ada', saved_at: '2026-11-14T10:00:00.000Z' }]
const ready = { id: 'b1', version_id: 'v2', runner_id: 'r1', status: 'ready', digest: 'sha256:abc', log: 'step 1\nstep 2\ndone', started_at: '2026-11-15T10:00:00.000Z', finished_at: '2026-11-15T10:00:42.000Z' }
const failed = { id: 'b2', version_id: 'v1', runner_id: 'r1', status: 'failed', log: 'E: Unable to locate package jqq', started_at: '2026-11-14T10:00:00.000Z', finished_at: '2026-11-14T10:00:05.000Z' }

const page = (items: Row[]): RecordPage => ({ items, next_page_token: '', total_size_estimate: items.length })
// The records a caller reads, each list by its resource and the value its filter names.
const listing = (rows: Record<string, Row[]>) => async (resource: string, params: ListParams = {}) => {
  const value = /"([^"]*)"/.exec(params.filter ?? '')?.[1]
  return page((rows[resource] ?? []).filter((row) => value === undefined || Object.values(row).includes(value)))
}

const calls = (given: Partial<CustomStepCalls> = {}): CustomStepCalls => ({
  test: vi.fn(async () => '00000000-0000-4000-8000-000000000001'),
  online: vi.fn(async () => ({ ids: ['r1'], builds: true })),
  register: vi.fn(async () => ({ token: 'pbr_once_x', expires_at: '2026-11-15T11:00:00.000Z', command: 'curl -fsSL https://app.example/api/runners/install.sh | sh -s -- --token pbr_once_x', endpoint: 'https://app.example/api/runners/v1' })),
  ...given,
})

const contextWith = (records: Partial<ToolRecords>, answer: ApprovalAnswer = 'approved') => {
  const approve = vi.fn(async () => answer)
  const context = { session: { user: { id: 'ada', roles: ['keeper'] }, tenant: '1' }, show: () => {}, approve, records: { list: listing({}), get: async () => ({ record: step, etag: '"e2"' }), ...records } as ToolRecords, resources: async () => ({ models: [], views: [] }) as unknown as ReadableResources } satisfies ToolContext
  return { context, approve }
}

const tool = (name: string, given = calls()) => [...customStepReadTools(given), ...customStepWriteTools(given)].find((one) => one.name === name)!

describe('save_custom_step', () => {
  it('creates a custom step once the user approves it, and says no runner builds it while none that builds is online', async () => {
    const create = vi.fn(async (_resource: string, data: Row) => ({ record: { ...data, id: 's1', version: 1 }, etag: '"e1"' }))
    const { context, approve } = contextWith({ create, list: listing({ workflow_custom_step_versions: [versions[1]!] }) })
    const answer = JSON.parse(await tool('save_custom_step', calls({ online: async () => ({ ids: [], builds: false }) })).run(ocr, context))
    expect(answer).toEqual({ id: 's1', name: 'ocr', version: 1, build: { status: 'no_runner' } })
    expect(create).toHaveBeenCalledWith('workflow_custom_steps', ocr)
    expect(approve).toHaveBeenCalledOnce()
  })

  it('answers the first build that ended, ready with its digest, or failed with the end of its log', async () => {
    const create = async (_resource: string, data: Row) => ({ record: { ...data, id: 's1', version: 2 }, etag: '"e2"' })
    const built = contextWith({ create, list: listing({ workflow_custom_step_versions: versions, workflow_custom_step_builds: [ready] }) })
    expect(JSON.parse(await tool('save_custom_step').run(ocr, built.context)).build).toEqual({ runner: 'r1', status: 'ready', digest: 'sha256:abc', seconds: 42, log_tail: 'step 1\nstep 2\ndone' })
    const broken = contextWith({ create: async (_resource, data) => ({ record: { ...data, id: 's1', version: 1 }, etag: '"e1"' }), list: listing({ workflow_custom_step_versions: versions, workflow_custom_step_builds: [failed] }) })
    expect(JSON.parse(await tool('save_custom_step').run(ocr, broken.context)).build).toEqual({ runner: 'r1', status: 'failed', seconds: 5, log_tail: 'E: Unable to locate package jqq' })
    // Under way, or about to be with a runner that builds online
    const building = contextWith({ create, list: listing({ workflow_custom_step_versions: versions }) })
    expect(JSON.parse(await tool('save_custom_step').run(ocr, building.context)).build).toEqual({ status: 'building' })
  })

  it('waits for the build to end with wait_seconds', async () => {
    const builds: Row[] = []
    const create = async (_resource: string, data: Row) => ({ record: { ...data, id: 's1', version: 2 }, etag: '"e2"' })
    const { context } = contextWith({ create, list: listing({ workflow_custom_step_versions: versions, workflow_custom_step_builds: builds }) })
    setTimeout(() => builds.push(ready), 300)
    expect(JSON.parse(await tool('save_custom_step').run({ ...ocr, wait_seconds: 5 }, context)).build.status).toBe('ready')
  })

  it("saves a step's next version with the etag it was read with, and refuses a stale one before asking", async () => {
    const update = vi.fn(async (_resource: string, _key: unknown, data: Row) => ({ record: { ...step, ...data, version: 3 }, etag: '"e3"' }))
    const { context, approve } = contextWith({ update, list: listing({ workflow_custom_step_versions: [{ ...versions[0]!, id: 'v3', version: 3 }] }) })
    const answer = JSON.parse(await tool('save_custom_step').run({ id: 's1', etag: '"e2"', container: { dockerfile: 'FROM alpine:3.20', files: {} } }, context))
    expect(answer).toMatchObject({ id: 's1', name: 'ocr', version: 3 })
    expect(update).toHaveBeenCalledWith('workflow_custom_steps', 's1', { container: { dockerfile: 'FROM alpine:3.20', files: {} } }, { etag: '"e2"' })
    approve.mockClear()
    expect(JSON.parse(await tool('save_custom_step').run({ id: 's1', etag: '"e1"', label: 'Other' }, context))).toMatchObject({ error: 'precondition-failed' })
    expect(approve).not.toHaveBeenCalled()
  })

  it('answers a refused manifest with its problems, each naming its field, and writes nothing unapproved', async () => {
    const problems = [{ field: 'container.dockerfile', message: 'has no FROM instruction to start with' }]
    const create = vi.fn(async () => Promise.reject(badRequest('invalid-custom-step', 'The custom step cannot be saved: container.dockerfile has no FROM instruction to start with', { problems })))
    const { context } = contextWith({ create })
    expect(JSON.parse(await tool('save_custom_step').run(ocr, context))).toEqual({ error: 'invalid-custom-step', message: expect.stringContaining('nothing was saved'), problems })
    const rejected = contextWith({ create }, 'rejected')
    create.mockClear()
    expect(await tool('save_custom_step').run(ocr, rejected.context)).toMatch(/did not approve/)
    expect(create).not.toHaveBeenCalled()
    expect(await tool('save_custom_step').run({ name: 'ocr' }, context)).toMatch(/^Pass/)
  })
})

describe('get_custom_step', () => {
  it('reads a step by its name with its manifest, its versions newest first and each one\'s builds', async () => {
    const { context } = contextWith({ list: listing({ workflow_custom_steps: [step], workflow_custom_step_versions: versions, workflow_custom_step_builds: [ready, failed] }) })
    const answer = JSON.parse(await tool('get_custom_step').run({ name: 'ocr' }, context))
    expect(answer).toMatchObject({ id: 's1', name: 'ocr', version: 2, etag: '"e2"', step: { label: 'Read text', container: ocr.container } })
    expect(answer.versions).toEqual([
      { version: 2, type: 'custom:ocr:2', saved_by: 'ada', saved_at: versions[0]!.saved_at, builds: [{ runner: 'r1', status: 'ready', digest: 'sha256:abc', seconds: 42, log_tail: 'step 1\nstep 2\ndone' }] },
      { version: 1, type: 'custom:ocr:1', saved_by: 'ada', saved_at: versions[1]!.saved_at, builds: [{ runner: 'r1', status: 'failed', seconds: 5, log_tail: 'E: Unable to locate package jqq' }] },
    ])
    expect(JSON.parse(await tool('get_custom_step').run({ name: 'ocr', version: 1 }, context)).versions.map((one: Row) => one.version)).toEqual([1])
  })

  it('refuses a name the caller may read no step of, and a version it has not', async () => {
    const { context } = contextWith({ list: listing({ workflow_custom_steps: [step], workflow_custom_step_versions: versions }) })
    expect(JSON.parse(await tool('get_custom_step').run({ name: 'nope' }, context))).toMatchObject({ error: 'not-found' })
    expect(JSON.parse(await tool('get_custom_step').run({ name: 'ocr', version: 7 }, context))).toMatchObject({ error: 'not-found' })
    expect(await tool('get_custom_step').run({ name: 'Not A Name' }, context)).toMatch(/^Pass/)
  })
})

describe('test_custom_step', () => {
  const run = '00000000-0000-4000-8000-000000000001'
  const job = { id: 'j1', run_id: run, status: 'failed', error: 'Custom.Failed', cause: 'jq: not found', logs: [{ at: '', message: 'converting' }, { at: '', message: 'jq: not found' }], queued_at: '2026-11-15T10:00:00.000Z', finished_at: '2026-11-15T10:00:03.000Z' }
  const video = { configuration: 'videos', path: 'in/sample.mp4', name: 'sample.mp4', type: 'video/mp4', size: 12 }

  it('runs a test of the version once the user approves it, its arguments with store, and answers its job', async () => {
    const given = calls()
    const get = async (resource: string) => (resource === 'workflow_runs' ? { record: { status: 'failed', error: 'Custom.Failed', cause: 'jq: not found' }, etag: '' } : { record: step, etag: '"e2"' })
    const { context, approve } = contextWith({ get, list: listing({ workflow_custom_steps: [step], workflow_custom_step_jobs: [job] }) })
    const answer = JSON.parse(await tool('test_custom_step', given).run({ name: 'ocr', version: 2, input: { video, height: 720 }, store: { configuration: 'videos' } }, context))
    expect(answer).toEqual({ run_id: run, job_id: 'j1', status: 'failed', error: 'Custom.Failed', cause: 'jq: not found', log_tail: 'converting\njq: not found', seconds: 3 })
    expect(given.test).toHaveBeenCalledWith(context.session, 'custom:ocr:2', { video, height: 720, store: { configuration: 'videos' } })
    expect(approve).toHaveBeenCalledWith(expect.objectContaining({ title: 'Test custom:ocr:2 on this input?', code: expect.stringContaining('"height": 720') }))
  })

  it('answers queued while no job is, and the run\'s failure when it failed before one', async () => {
    const queued = contextWith({ get: async (resource: string) => (resource === 'workflow_runs' ? { record: { status: 'running' }, etag: '' } : { record: step, etag: '' }), list: listing({ workflow_custom_steps: [step] }) })
    expect(JSON.parse(await tool('test_custom_step').run({ name: 'ocr', version: 2, input: {} }, queued.context))).toEqual({ run_id: run, job_id: null, status: 'queued' })
    const gone = contextWith({ get: async (resource: string) => (resource === 'workflow_runs' ? { record: { status: 'failed', error: 'States.Runtime', cause: 'custom:ocr:2 is not a custom step of this app' }, etag: '' } : { record: step, etag: '' }), list: listing({ workflow_custom_steps: [step] }) })
    expect(JSON.parse(await tool('test_custom_step').run({ name: 'ocr', version: 2, input: {} }, gone.context))).toEqual({ run_id: run, job_id: null, status: 'failed', error: 'States.Runtime', cause: 'custom:ocr:2 is not a custom step of this app' })
  })

  it('refuses a step the caller may not read, a test refused, and arguments it cannot take, before or without running', async () => {
    const given = calls({ test: vi.fn(async () => Promise.reject(notFound('custom:ocr:9 is no custom step version of yours'))) })
    const { context, approve } = contextWith({ list: listing({ workflow_custom_steps: [step] }) })
    expect(JSON.parse(await tool('test_custom_step', given).run({ name: 'nope', version: 1, input: {} }, context))).toMatchObject({ error: 'not-found' })
    expect(approve).not.toHaveBeenCalled()
    expect(JSON.parse(await tool('test_custom_step', given).run({ name: 'ocr', version: 9, input: {} }, context))).toMatchObject({ error: 'not-found' })
    expect(await tool('test_custom_step').run({ name: 'ocr', version: 2, input: { store: { configuration: 'a' } }, store: { configuration: 'b' } }, context)).toMatch(/store once/)
    expect(await tool('test_custom_step').run({ name: 'ocr', version: '2', input: {} }, context)).toMatch(/^Pass/)
    const rejected = contextWith({ list: listing({ workflow_custom_steps: [step] }) }, 'rejected')
    const unasked = calls()
    expect(await tool('test_custom_step', unasked).run({ name: 'ocr', version: 2, input: {} }, rejected.context)).toMatch(/did not approve/)
    expect(unasked.test).not.toHaveBeenCalled()
  })
})

describe('list_runners', () => {
  it('lists the runners with which are online, their free slots and the images they hold', async () => {
    const state = { platform: 'linux/amd64', kinds: ['container', 'build'], labels: [], capacity: { slots: 2 }, images: [{ step: 'custom:ocr:2' }], instances: [] }
    const runners = [{ id: 'r1', name: 'Box', labels: ['gpu'], revoked: false, registered_at: '2026-11-15T09:00:00.000Z', platform: 'linux/amd64', kinds: ['container', 'build'], state, polled_at: '2026-11-15T10:00:00.000Z' }, { id: 'r2', name: 'New', labels: [], revoked: false, registered_at: null, platform: null, kinds: [], state: null, polled_at: null }]
    const { context } = contextWith({ list: listing({ workflow_runners: runners }) })
    expect(JSON.parse(await tool('list_runners').run({}, context))).toEqual({
      runners: [
        { id: 'r1', name: 'Box', online: true, revoked: false, registered: true, labels: ['gpu'], platform: 'linux/amd64', kinds: ['container', 'build'], free_slots: 2, images: ['custom:ocr:2'], polled_at: '2026-11-15T10:00:00.000Z' },
        { id: 'r2', name: 'New', online: false, revoked: false, registered: false, labels: [], platform: null, kinds: [], free_slots: null, images: [], polled_at: null },
      ],
    })
  })
})

describe('create_runner_token', () => {
  it('makes a runner once the user approves it, and gives its install command once', async () => {
    const given = calls()
    const create = vi.fn(async (_resource: string, data: Row) => ({ record: { id: 'r9', labels: [], ...data }, etag: '' }))
    const { context, approve } = contextWith({ create })
    const answer = JSON.parse(await tool('create_runner_token', given).run({ name: 'Video box', labels: ['gpu'] }, context))
    expect(answer).toEqual({ id: 'r9', name: 'Video box', labels: ['gpu'], command: expect.stringContaining('--token pbr_once_x'), expires_at: '2026-11-15T11:00:00.000Z', endpoint: 'https://app.example/api/runners/v1' })
    expect(create).toHaveBeenCalledWith('workflow_runners', { name: 'Video box', labels: ['gpu'] })
    expect(given.register).toHaveBeenCalledWith(context.session, 'r9')
    expect(approve).toHaveBeenCalledWith(expect.objectContaining({ title: 'Make the runner Video box and issue its install command?' }))
  })

  it('says a runner was made when its token was refused, and makes none unapproved', async () => {
    const create = vi.fn(async (_resource: string, data: Row) => ({ record: { id: 'r9', ...data }, etag: '' }))
    const { context } = contextWith({ create })
    const refused = calls({ register: async () => Promise.reject(notFound('No runner with this key that you may change')) })
    expect(JSON.parse(await tool('create_runner_token', refused).run({ name: 'Box' }, context))).toEqual({ error: 'not-found', message: 'The runner r9 was made, but its token was not issued: No runner with this key that you may change' })
    const rejected = contextWith({ create }, 'rejected')
    create.mockClear()
    expect(await tool('create_runner_token').run({ name: 'Box' }, rejected.context)).toMatch(/did not approve/)
    expect(create).not.toHaveBeenCalled()
  })
})
