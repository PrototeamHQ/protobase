import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { StepError } from '@protobase/workflows'
import { localFiles } from '../files/local-files'
import type { FilesRuntime } from '../files/runtime'
import { tempDir } from '../files/testing/temp-dir'
import type { MailMessage } from '../mail/mail-message'
import { builtInStep } from './testing/built-in-step'
import { storeRunFile } from './run-files'

const context = (runId = 'run-1') => ({ runId, signal: new AbortController().signal, idempotencyKey: `${runId}//3`, log: () => undefined, redact: (text: string) => text })
const failure = (promise: Promise<unknown>) => promise.then(() => undefined, (error: unknown) => (error instanceof StepError ? [error.error, error.reason] : error))

describe('the app:mail.send step', () => {
  const sent: MailMessage[] = []
  const mailer = { send: async (message: MailMessage) => void sent.push(message) }
  let folder: Awaited<ReturnType<typeof tempDir>>
  let files: FilesRuntime

  beforeAll(async () => {
    folder = await tempDir()
    files = { providers: { private: localFiles({ dir: folder.dir }) } } as unknown as FilesRuntime
  })
  afterAll(() => folder.remove())

  it("sends from the app's sender with a Message-ID that is the same for each try, attaching the run's own files", async () => {
    const pdf = await storeRunFile(files, 'run-1', new TextEncoder().encode('%PDF-1.4'), 'report.pdf', 'application/pdf')
    const step = builtInStep('app:mail.send', { mail: mailer, files: () => files })
    const args = { to: ['finance@example.com', 'ops@example.com'], subject: 'Report', text: 'Attached', attachments: [pdf] }
    expect(await step(args, context())).toEqual({ message_id: '<run-1..3@workflows.invalid>' })
    expect(sent.at(-1)).toMatchObject({ to: 'finance@example.com, ops@example.com', subject: 'Report', text: 'Attached', headers: { 'Message-ID': '<run-1..3@workflows.invalid>' } })
    expect(sent.at(-1)!.attachments).toEqual([{ filename: 'report.pdf', content: expect.any(Uint8Array), contentType: 'application/pdf' }])
    expect(sent.at(-1)).not.toHaveProperty('from')
  })

  it("refuses a line break in a header, too many recipients, another run's file, and an app without mail", async () => {
    const step = builtInStep('app:mail.send', { mail: mailer, files: () => files })
    const before = sent.length
    expect(await failure(step({ to: 'a@example.com\r\nBcc: all@example.com', subject: 'Hi', text: '' }, context()))).toEqual(['Mail.InvalidArguments', 'to must be one line'])
    expect(await failure(step({ to: 'a@example.com', subject: 'Hi\nBcc: all@example.com', text: '' }, context()))).toEqual(['Mail.InvalidArguments', 'subject must be one line'])
    expect(await failure(step({ to: Array.from({ length: 51 }, (_, index) => `p${index}@example.com`), subject: 'Hi', text: '' }, context()))).toEqual(['Mail.InvalidArguments', 'to must be one address or a list of 1 to 50'])
    const other = await storeRunFile(files, 'run-2', new Uint8Array([1]), 'x.bin', 'application/octet-stream')
    expect(await failure(step({ to: 'a@example.com', subject: 'Hi', text: '', attachments: [other] }, context()))).toEqual(['States.TaskFailed', 'attachments[0] is not a file this run stored; a step takes only the files of its own run'])
    const elsewhere = { uri: 'private:acme/2992db9c.pdf?name=contract.pdf&size=10', name: 'contract.pdf', type: 'application/pdf', size: 10 }
    expect(await failure(step({ to: 'a@example.com', subject: 'Hi', text: '', attachments: [elsewhere] }, context()))).toEqual(['States.TaskFailed', 'attachments[0] is not a file this run stored; a step takes only the files of its own run'])
    expect(await failure(builtInStep('app:mail.send', { files: () => files })({ to: 'a@example.com', subject: 'Hi', text: '' }, context()))).toEqual(['States.TaskFailed', 'The app sends no mail: set its mailer, or PROTOBASE_SMTP_URL and PROTOBASE_MAIL_FROM'])
    expect(sent.length).toBe(before)
  })

  it('refuses an address list inside one recipient, which would pass the count', async () => {
    const step = builtInStep('app:mail.send', { mail: mailer, files: () => files })
    expect(await failure(step({ to: 'a@example.com, b@example.com', subject: 'Hi', text: '' }, context()))).toEqual(['Mail.InvalidArguments', 'to must be one address; give several as a list'])
    expect(await failure(step({ to: ['a@example.com', 'b@example.com; c@example.com'], subject: 'Hi', text: '' }, context()))).toEqual(['Mail.InvalidArguments', 'to[1] must be one address; give several as a list'])
  })
})
