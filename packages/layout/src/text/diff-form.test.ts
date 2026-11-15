import { describe, expect, it } from 'vitest'
import { Diff } from '../diff'
import { renderText } from './render-text'

const patch = '--- a/README.md\n+++ b/README.md\n@@ -1,3 +1,3 @@\n # Invoices\n-```sh\n+````sh\n bun install\n'
const options = { record: { patch, empty: '', none: null } }

describe('Diff as text', () => {
  it('fences the patch as a diff block', () => {
    expect(renderText(Diff({ source: 'patch' }), { record: { patch: '@@ -1 +1 @@\n-a\n+b\n' } })).toBe('```diff\n@@ -1 +1 @@\n-a\n+b\n```')
  })

  it('keeps a patch holding backtick fences inside its own, longer fence', () => {
    expect(renderText(Diff({ source: 'patch' }), options)).toBe(`\`\`\`\`\`diff\n${patch.slice(0, -1)}\n\`\`\`\`\``)
  })

  it('shows emptyText for an empty field, and nothing without it or without a record', () => {
    expect(renderText(Diff({ source: 'empty', emptyText: 'No changes' }), options)).toBe('No changes')
    expect(renderText(Diff({ source: 'none' }), options)).toBe('')
    expect(renderText(Diff({ source: 'patch' }))).toBe('')
  })
})
