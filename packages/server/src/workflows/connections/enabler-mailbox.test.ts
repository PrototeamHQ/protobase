import { describe, expect, it, vi } from 'vitest'
import { PersonalMailError } from '../../personal-mail/personal-mail-error'
import { enablerMailbox } from './enabler-mailbox'

const message = { to: 'client@example.com', subject: 'Invoice 7', text: 'Attached.' }

describe('enablerMailbox', () => {
  it("sends from the mailbox of whoever turned the run's version on, read at each send", async () => {
    const sent: string[] = []
    let enabler: string | null = 'ada'
    const mailbox = enablerMailbox(async () => enabler, (userId) => ({ send: async () => void sent.push(userId) }))
    await mailbox.send(message)
    enabler = 'grace'
    await mailbox.send(message)
    expect(sent).toEqual(['ada', 'grace'])
  })

  it('sends nothing and fails not_linked when nobody turned it on as themselves, or they may no longer', async () => {
    const send = vi.fn(async () => {})
    await expect(enablerMailbox(async () => null, () => ({ send })).send(message)).rejects.toEqual(new PersonalMailError('not_linked'))
    expect(send).not.toHaveBeenCalled()
  })
})
