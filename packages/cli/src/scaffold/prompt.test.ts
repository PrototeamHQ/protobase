import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import type { Proposal } from '../infer/proposal'
import { interactive } from './prompt'

const proposal = (column: string): Proposal => ({ name: column, column, type: 'text', base: 'text', optional: false, readOnly: false, filterable: false, sortable: false })

// A terminal that types the next answer each time the prompt asks.
const terminal = (answers: string[]) => {
  const input = new PassThrough()
  const output = new PassThrough()
  let printed = ''
  output.on('data', (chunk: Buffer) => {
    printed += chunk
    if (chunk.toString().endsWith('(a): ')) input.write(`${answers.shift()}\n`)
  })
  return { input, output, printed: () => printed }
}

describe('interactive', () => {
  it('asks for each column until "all" accepts it and every one after it', async () => {
    const { input, output, printed } = terminal(['i', 'l'])
    const { decide, close } = interactive(input, output)
    const context = { table: 'shop.orders', required: false }
    expect(await decide(proposal('note'), context)).toBeNull()
    expect(await decide(proposal('status'), context)).toEqual(proposal('status'))
    expect(await decide(proposal('total'), context)).toEqual(proposal('total'))
    expect(await decide(proposal('placed_at'), { ...context, required: true })).toEqual(proposal('placed_at'))
    close()
    expect(printed().match(/\(a\): /g)).toHaveLength(2)
    expect(printed()).toContain('[a]ccept, accept a[l]l, [e]dit, [i]gnore')
    expect(printed()).toContain('accepting this and every remaining proposal')
  })
})
