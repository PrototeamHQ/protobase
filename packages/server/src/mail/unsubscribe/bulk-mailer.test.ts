import { describe, expect, it } from 'vitest'
import type { MailMessage } from '../mail-message'
import { bulkMailer } from './bulk-mailer'
import { unsubscribeLinks } from './unsubscribe-links'

const links = unsubscribeLinks({ appUrl: 'https://shop.example.com', path: '/api/unsubscribe', secret: 'test secret' })

const recording = () => {
  const sent: MailMessage[] = []
  return { sent, mailer: { send: async (message: MailMessage) => { sent.push(message); return { messageId: '<1@shop.example.com>' } } } }
}

// Bob unsubscribed from the newsletter.
const unsubscribed = async (topic: string, recipients: readonly string[]) => recipients.filter((recipient) => topic === 'newsletter' && recipient === 'bob@example.com')

const newsletter = { subject: 'News', text: 'Hi', bulk: true, topic: 'newsletter' }

describe('bulk mail', () => {
  it("carries both one-click headers, with each recipient's own link", async () => {
    const { sent, mailer } = recording()
    const mail = bulkMailer(mailer, { links, unsubscribed })
    expect(await mail.send({ to: 'Ada@Example.com', ...newsletter })).toEqual({ messageId: '<1@shop.example.com>', skipped: [] })
    await mail.send({ to: 'cy@example.com', ...newsletter, headers: { 'List-Unsubscribe': '<https://elsewhere.example>', 'X-Campaign': 'may' } })
    const [ada, cy] = sent.map((message) => message.headers!)
    expect(ada!['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(ada!['List-Unsubscribe']).toMatch(/^<https:\/\/shop\.example\.com\/api\/unsubscribe\/[\w-]+\.[\w-]+>$/)
    expect(links.read(ada!['List-Unsubscribe']!.slice(1, -1).split('/').at(-1)!)).toEqual({ recipient: 'ada@example.com', topic: 'newsletter' })
    expect(cy!['List-Unsubscribe']).not.toBe(ada!['List-Unsubscribe'])
    expect(cy!['X-Campaign']).toBe('may')
    expect(sent[0]).not.toHaveProperty('bulk')
    expect(sent[0]).not.toHaveProperty('topic')
  })

  it('is not sent to whoever unsubscribed from its topic, and says so', async () => {
    const { sent, mailer } = recording()
    const mail = bulkMailer(mailer, { links, unsubscribed })
    expect(await mail.send({ to: 'bob@example.com', ...newsletter })).toEqual({ skipped: ['bob@example.com'] })
    expect(sent).toEqual([])
    await mail.send({ to: 'bob@example.com', ...newsletter, topic: 'digest' })
    expect(sent).toHaveLength(1)
  })

  it('is refused without a topic, to several recipients, or with unsubscribe off', async () => {
    const { sent, mailer } = recording()
    const mail = bulkMailer(mailer, { links, unsubscribed })
    await expect(mail.send({ to: 'ada@example.com', subject: 'News', text: 'Hi', bulk: true })).rejects.toThrow(/without a topic/)
    await expect(mail.send({ to: 'ada@example.com', ...newsletter, topic: 'News Letter' })).rejects.toThrow(/lowercase letter/)
    await expect(mail.send({ to: 'ada@example.com, cy@example.com', ...newsletter })).rejects.toThrow(/one plain address a message/)
    await expect(bulkMailer(mailer, undefined).send({ to: 'ada@example.com', ...newsletter })).rejects.toThrow(/unsubscribe: true/)
    expect(sent).toEqual([])
  })
})

describe('transactional mail', () => {
  it('goes out unchanged, without unsubscribe headers or a skip list', async () => {
    const { sent, mailer } = recording()
    const mail = bulkMailer(mailer, { links, unsubscribed })
    expect(await mail.send({ to: 'bob@example.com', subject: 'Reset', text: 'Code', topic: 'newsletter' })).toEqual({ messageId: '<1@shop.example.com>' })
    expect(await bulkMailer(mailer, undefined).send({ to: 'bob@example.com', subject: 'Reset', text: 'Code' })).toEqual({ messageId: '<1@shop.example.com>' })
    expect(sent).toEqual([{ to: 'bob@example.com', subject: 'Reset', text: 'Code' }, { to: 'bob@example.com', subject: 'Reset', text: 'Code' }])
  })
})
