import type { FieldModel } from '@protobase/schema'
import { describe, expect, it } from 'vitest'
import { generateValue } from './generate-value'

const sse = (events: unknown[]) =>
  new Response(events.map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })

// A fake OpenAI-compatible endpoint that answers `answer` and keeps the request bodies.
const fakeModel = (answer: string, baseUrl = 'https://openrouter.ai/api/v1') => {
  const bodies: Array<{ messages: Array<{ role: string; content: string }>; reasoning?: unknown }> = []
  const fetch = (async (_: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)))
    return sse([{ choices: [{ delta: { content: answer } }] }, '[DONE]'])
  }) as typeof globalThis.fetch
  return { bodies, settings: { baseUrl, apiKey: 'key', model: 'some/model', fetch } }
}

const text: FieldModel = { name: 'summary', column: 'summary', type: 'text', nullable: true, readOnly: false, filterable: false, sortable: false, aliases: [] }
const priority: FieldModel = { ...text, name: 'priority', type: 'enum', enumValues: ['low', 'high'] }
const record = { title: 'Printer on fire', description: null }

describe('generateValue', () => {
  it('sends the same instruction and the prompt filled from the record, low reasoning on OpenRouter, and trims the answer', async () => {
    const model = fakeModel('  Fire in the printer. \n')
    expect(await generateValue(model.settings, { prompt: 'Sum up: {title}\n{description}', record, field: text })).toBe('Fire in the printer.')
    expect(model.bodies[0]).toMatchObject({
      messages: [
        { role: 'system', content: expect.stringContaining('Answer with the value only') },
        { role: 'user', content: 'Sum up: Printer on fire\n' },
      ],
      reasoning: { effort: 'low' },
    })
  })

  it("lists an enum's values, and asks for no reasoning on another endpoint", async () => {
    const model = fakeModel('high', 'http://localhost:11434/v1')
    expect(await generateValue(model.settings, { prompt: 'How urgent? {title}', record, field: priority })).toBe('high')
    expect(model.bodies[0]!.messages[1]!.content).toBe('How urgent? Printer on fire\n\nAnswer with exactly one of: low, high')
    expect(model.bodies[0]).not.toHaveProperty('reasoning')
  })

  it('is null for an empty answer, and without a request when every field the prompt reads is empty', async () => {
    expect(await generateValue(fakeModel(' ').settings, { prompt: '{title}', record, field: text })).toBeNull()
    const model = fakeModel('invented')
    expect(await generateValue(model.settings, { prompt: '{description} {title}', record: { title: ' ', description: null }, field: text })).toBeNull()
    expect(model.bodies).toEqual([])
  })
})
