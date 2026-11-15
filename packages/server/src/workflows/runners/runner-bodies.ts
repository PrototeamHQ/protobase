import type { JobCompletion, RunnerState } from '@protobase/workflows'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const texts = (value: unknown, most: number) => Array.isArray(value) && value.length <= most && value.every((one) => typeof one === 'string' && one !== '' && one.length <= 200)
const count = (value: unknown) => Number.isInteger(value) && (value as number) >= 0

// How many images and instances one claim may list.
const listed = 1000

/** A registration's body, `{ token, platform, kinds }`, or why it is not one. */
export const registrationOf = (body: unknown): { token: string; platform: string; kinds: string[] } | { problem: string } => {
  if (!isObject(body) || typeof body.token !== 'string') return { problem: 'Send a JSON object with the token the runner was issued' }
  if (typeof body.platform !== 'string' || body.platform === '' || body.platform.length > 100) return { problem: 'platform is the runner\'s platform, such as "linux/amd64"' }
  if (!texts(body.kinds, 20)) return { problem: 'kinds is a list of the kinds of steps the runner runs, such as ["container"]' }
  return { token: body.token, platform: body.platform, kinds: body.kinds as string[] }
}

/**
 * What a runner says of itself as it claims a job: `platform`, `kinds`, `labels`, `capacity: { slots }`,
 * `images: [{ step, snapshot? }]` and `instances: [{ step, free }]`, the lists empty when left out; or why it is not.
 */
export const runnerStateOf = (body: unknown): RunnerState | { problem: string } => {
  if (!isObject(body)) return { problem: 'Send a JSON object with the runner\'s platform, kinds, capacity, images and instances' }
  const { platform, kinds, labels = [], capacity, images = [], instances = [] } = body
  if (typeof platform !== 'string' || platform === '' || platform.length > 100) return { problem: 'platform is the runner\'s platform, such as "linux/amd64"' }
  if (!texts(kinds, 20)) return { problem: 'kinds is a list of the kinds of steps the runner runs, such as ["container"]' }
  if (!texts(labels, 100)) return { problem: 'labels is a list of texts, such as ["gpu"]' }
  if (!isObject(capacity) || !count(capacity.slots)) return { problem: 'capacity is { slots }, the jobs the runner takes on now, a whole number of 0 or more' }
  const steps = (list: unknown, each: (item: Record<string, unknown>) => boolean) => Array.isArray(list) && list.length <= listed && list.every((item) => isObject(item) && typeof item.step === 'string' && item.step.length <= 200 && each(item))
  if (!steps(images, (image) => image.snapshot === undefined || typeof image.snapshot === 'boolean')) return { problem: `images is a list of at most ${listed} { step, snapshot? }, step such as "custom:ocr:4" and snapshot true or false` }
  if (!steps(instances, (instance) => count(instance.free))) return { problem: `instances is a list of at most ${listed} { step, free }, free a whole number of 0 or more` }
  return {
    platform,
    kinds: kinds as string[],
    labels: labels as string[],
    capacity: { slots: capacity.slots as number },
    images: (images as { step: string; snapshot?: boolean }[]).map(({ step, snapshot }) => ({ step, ...(snapshot !== undefined && { snapshot }) })),
    instances: (instances as { step: string; free: number }[]).map(({ step, free }) => ({ step, free })),
  }
}

/** A completion's body, `{ output }` or `{ error, cause? }`, or why it is not one. */
export const completionOf = (body: unknown): JobCompletion | { problem: string } => {
  if (!isObject(body)) return { problem: 'Send a JSON object with the output, or the error and cause' }
  if (Object.hasOwn(body, 'output')) return { output: body.output }
  if (typeof body.error !== 'string') return { problem: 'Send the step\'s output as output, or its failure as error, a name such as "Refused", and cause' }
  if (body.cause !== undefined && typeof body.cause !== 'string') return { problem: 'cause must be a string' }
  return { error: body.error, ...(body.cause !== undefined && { cause: body.cause as string }) }
}

/** A log's body, `{ lines }`, at most 100 texts, or why it is not one. */
export const logLinesOf = (body: unknown): string[] | { problem: string } => {
  if (!isObject(body) || !Array.isArray(body.lines) || body.lines.length > 100 || !body.lines.every((line) => typeof line === 'string')) return { problem: 'Send { lines }, a list of at most 100 texts' }
  return body.lines as string[]
}
