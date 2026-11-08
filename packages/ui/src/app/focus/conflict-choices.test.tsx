import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ConflictChoices } from './conflict-choices'

describe('conflict choices', () => {
  it('names the field each choice settles', () => {
    const fields = [{ name: 'status', label: 'Status' }, { name: 'notes', label: 'Notes' }]
    const html = renderToStaticMarkup(<ConflictChoices fields={fields} onKeepMine={() => {}} onUseTheirs={() => {}} />)
    const labels = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((match) => match[1])
    expect(labels).toEqual(['Keep mine: Status', 'Use theirs: Status', 'Keep mine: Notes', 'Use theirs: Notes'])
  })
})
