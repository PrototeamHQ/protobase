import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ConflictChoices } from './conflict-choices'

const fields = [{ name: 'status', label: 'Status' }, { name: 'notes', label: 'Notes' }]

describe('conflict choices', () => {
  it('names the field each choice settles', () => {
    const html = renderToStaticMarkup(<ConflictChoices fields={fields} onKeepMine={() => {}} onUseTheirs={() => {}} />)
    const labels = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((match) => match[1])
    expect(labels).toEqual(['Keep mine: Status', 'Use theirs: Status', 'Keep mine: Notes', 'Use theirs: Notes'])
  })

  it('settles the field each choice names', () => {
    const settled: string[] = []
    // The choices hold no state, so their buttons are pressed as the elements they return
    const choices = ConflictChoices({ fields, onKeepMine: (name) => settled.push(`mine:${name}`), onUseTheirs: (name) => settled.push(`theirs:${name}`) })
    const buttons = (choices.props as { children: ReactElement<{ onClick: () => void }>[][] }).children.flat()
    for (const button of buttons) button.props.onClick()
    expect(settled).toEqual(['mine:status', 'theirs:status', 'mine:notes', 'theirs:notes'])
  })
})
