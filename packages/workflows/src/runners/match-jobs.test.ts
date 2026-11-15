import { describe, expect, it } from 'vitest'
import { matchJobs, tierOf, type KnownRunner, type PollingRunner, type QueuedJob, type RunnerState } from './match-jobs'

const now = new Date('2026-11-15T12:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms)
const settings = { coldWaitMs: 5000, warmWaitMs: 1000 }

const state = (changes: Partial<RunnerState> = {}): RunnerState => ({ platform: 'linux/amd64', kinds: ['container'], labels: [], capacity: { slots: 2 }, images: [], instances: [], ...changes })
const runner = (id: string, changes: Partial<RunnerState> = {}, more: Partial<PollingRunner> = {}): PollingRunner => ({ id, tenant: '1', labels: [], state: state(changes), polledAt: ago(10_000), ...more })
const job = (id: string, more: Partial<QueuedJob> = {}): QueuedJob => ({ id, tenant: '1', step: 'custom:ocr:1', queuedAt: ago(100), passedOverAt: null, ...more })

const warm = { instances: [{ step: 'custom:ocr:1', free: 1 }] }
const snapshot = { images: [{ step: 'custom:ocr:1', snapshot: true }] }
const image = { images: [{ step: 'custom:ocr:1' }] }

// Busy runners of tenant 1, running a job and holding no claim: one with the image, one with a warm instance.
const busyImage: KnownRunner = { tenant: '1', state: state({ capacity: { slots: 0 }, ...image }) }
const busyWarm: KnownRunner = { tenant: '1', state: state({ capacity: { slots: 0 }, instances: [{ step: 'custom:ocr:1', free: 0 }] }) }

// The runners holding a claim are known, and so are the busy ones given.
const match = (jobs: QueuedJob[], runners: PollingRunner[], busy: KnownRunner[] = [busyImage, busyWarm]) => matchJobs({ jobs, runners, known: [...runners, ...busy], now, settings })

describe('how hot a runner is for a step', () => {
  it('ranks a warm instance with room, a snapshot, the image, then nothing of it, by step version', () => {
    expect(tierOf(state(warm), 'custom:ocr:1')).toBe(1)
    expect(tierOf(state({ instances: [{ step: 'custom:ocr:1', free: 0 }], ...snapshot }), 'custom:ocr:1')).toBe(2)
    expect(tierOf(state(image), 'custom:ocr:1')).toBe(3)
    expect(tierOf(state({ ...warm, ...snapshot }), 'custom:ocr:2')).toBe(4)
  })
})

describe('matching jobs to the runners holding a claim', () => {
  it('gives a job the hottest runner, each tier before the next', () => {
    const runners = [runner('cold'), runner('image', image), runner('snapshot', snapshot), runner('warm', warm)]
    expect(match([job('j')], runners).placements).toEqual([{ job: 'j', runner: 'warm', tier: 1 }])
    // Once its wait for a warm instance passed
    expect(match([job('j', { passedOverAt: ago(1000) })], runners.slice(0, 3)).placements).toEqual([{ job: 'j', runner: 'snapshot', tier: 2 }])
    expect(match([job('j', { passedOverAt: ago(1000) })], runners.slice(0, 2)).placements).toEqual([{ job: 'j', runner: 'image', tier: 3 }])
    expect(match([job('j', { passedOverAt: ago(5000) })], runners.slice(0, 1)).placements).toEqual([{ job: 'j', runner: 'cold', tier: 4 }])
  })

  it('has a job whose best runner lacks its image wait up to the cold wait for one that has it, then take the best free', () => {
    const cold = [runner('cold')]
    expect(match([job('j')], cold)).toEqual({ placements: [], passedOver: ['j'] })
    // Its wait counts from the first pass that left it, not from its queueing
    expect(match([job('j', { queuedAt: ago(60_000) })], cold)).toEqual({ placements: [], passedOver: ['j'] })
    expect(match([job('j', { passedOverAt: ago(4999) })], cold)).toEqual({ placements: [], passedOver: [] })
    expect(match([job('j', { passedOverAt: ago(5000) })], cold).placements).toEqual([{ job: 'j', runner: 'cold', tier: 4 }])
    // A hot runner that polls meanwhile takes it at once
    expect(match([job('j', { passedOverAt: ago(2000) })], [...cold, runner('image', image)]).placements).toEqual([{ job: 'j', runner: 'image', tier: 3 }])
  })

  it('has a job whose best runner has its image wait up to the warm wait for a warm instance', () => {
    const hot = [runner('cold'), runner('snapshot', snapshot)]
    expect(match([job('j')], hot)).toEqual({ placements: [], passedOver: ['j'] })
    expect(match([job('j', { passedOverAt: ago(999) })], hot).placements).toEqual([])
    expect(match([job('j', { passedOverAt: ago(500) })], [...hot, runner('warm', warm)]).placements).toEqual([{ job: 'j', runner: 'warm', tier: 1 }])
    expect(match([job('j', { passedOverAt: ago(1000) })], hot).placements).toEqual([{ job: 'j', runner: 'snapshot', tier: 2 }])
  })

  it('waits for nothing with no waits set', () => {
    expect(matchJobs({ jobs: [job('j')], runners: [runner('cold')], known: [busyImage], now, settings: { coldWaitMs: 0, warmWaitMs: 0 } }).placements).toEqual([{ job: 'j', runner: 'cold', tier: 4 }])
  })

  it('has a job wait for a runner with its image only while one of its tenant has it, busy or not, else take a cold runner at once', () => {
    const cold = [runner('cold')]
    expect(match([job('j')], cold, [])).toEqual({ placements: [{ job: 'j', runner: 'cold', tier: 4 }], passedOver: [] })
    // A busy runner with a warm instance, even without room, has its image
    expect(match([job('j')], cold, [busyWarm])).toEqual({ placements: [], passedOver: ['j'] })
    expect(match([job('j')], cold, [busyImage])).toEqual({ placements: [], passedOver: ['j'] })
    // One of another tenant, or with another step's image, is no reason to wait
    expect(match([job('j')], cold, [{ ...busyImage, tenant: '2' }, { tenant: '1', state: state({ images: [{ step: 'custom:ocr:2' }] }) }]).placements).toEqual([{ job: 'j', runner: 'cold', tier: 4 }])
    // A job that waited takes the cold runner once the hot one is gone
    expect(match([job('j', { passedOverAt: ago(1000) })], cold, []).placements).toEqual([{ job: 'j', runner: 'cold', tier: 4 }])
  })

  it('has a job whose best runner has its image wait for a warm instance only while one of its tenant has one', () => {
    const hot = [runner('image', image)]
    expect(match([job('j')], hot, [busyImage])).toEqual({ placements: [{ job: 'j', runner: 'image', tier: 3 }], passedOver: [] })
    expect(match([job('j')], hot, [busyWarm])).toEqual({ placements: [], passedOver: ['j'] })
    expect(match([job('j')], [runner('snapshot', snapshot)], [])).toEqual({ placements: [{ job: 'j', runner: 'snapshot', tier: 2 }], passedOver: [] })
  })

  it('leaves a waiting job\'s runner to the jobs after it', () => {
    const jobs = [job('ocr', { queuedAt: ago(200) }), job('resize', { step: 'custom:resize:1', queuedAt: ago(100), passedOverAt: ago(1000) })]
    expect(match(jobs, [runner('r', { images: [{ step: 'custom:resize:1' }] })])).toEqual({ placements: [{ job: 'resize', runner: 'r', tier: 3 }], passedOver: ['ocr'] })
  })

  it('gives each runner one job a pass, the oldest job first, the runner that waited longest first among equals', () => {
    const runners = [runner('late', image, { polledAt: ago(1000) }), runner('early', image, { polledAt: ago(9000) })]
    const jobs = [job('new', { queuedAt: ago(10), passedOverAt: ago(1000) }), job('old', { queuedAt: ago(500), passedOverAt: ago(1000) }), job('third', { queuedAt: ago(5), passedOverAt: ago(1000) })]
    expect(match(jobs, runners).placements).toEqual([
      { job: 'old', runner: 'early', tier: 3 },
      { job: 'new', runner: 'late', tier: 3 },
    ])
  })

  it('takes turns across tenants, so one tenant\'s many jobs never hold back another\'s, and keeps each tenant to its own runners', () => {
    const waited = { passedOverAt: ago(10_000) }
    const jobs = [job('a1', { tenant: 'a', queuedAt: ago(900), ...waited }), job('a2', { tenant: 'a', queuedAt: ago(800), ...waited }), job('a3', { tenant: 'a', queuedAt: ago(700), ...waited }), job('b1', { tenant: 'b', queuedAt: ago(100), ...waited })]
    const runners = ['r1', 'r2', 'r3'].map((id) => runner(id, {}, { tenant: id === 'r3' ? 'b' : 'a' }))
    expect(match(jobs, runners).placements.map((placement) => [placement.job, placement.runner])).toEqual([['a1', 'r1'], ['b1', 'r3'], ['a2', 'r2']])
    expect(match([job('c', { tenant: 'c', ...waited })], runners).placements).toEqual([])
    expect(match([job('none', { tenant: null, ...waited })], [runner('mine', {}, { tenant: null })]).placements).toEqual([{ job: 'none', runner: 'mine', tier: 4 }])
  })

  it('gives no job to a runner without a free slot, one that runs no containers, or one without a label the job needs', () => {
    const waited = { passedOverAt: ago(10_000) }
    expect(match([job('j', waited)], [runner('full', { capacity: { slots: 0 }, ...warm }), runner('other', { kinds: ['wasm'], ...warm })])).toEqual({ placements: [], passedOver: [] })
    const gpu = job('j', { labels: ['gpu'], ...waited })
    expect(match([gpu], [runner('plain')]).placements).toEqual([])
    expect(match([gpu], [runner('advertised', { labels: ['gpu'] })]).placements).toEqual([{ job: 'j', runner: 'advertised', tier: 4 }])
    expect(match([gpu], [runner('recorded', {}, { labels: ['gpu'] })]).placements).toEqual([{ job: 'j', runner: 'recorded', tier: 4 }])
  })
})
