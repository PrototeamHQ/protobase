import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Field } from '../../../record-view/field'
import { ChecklistInput } from './checklist-input'

describe('ChecklistInput', () => {
  it('is a group named by its label and described by the help and error of its field', () => {
    const html = renderToStaticMarkup(
      <Field label="What you checked" help="Tick each detail." error="Tick the 1 box left.">
        <ChecklistInput label="What you checked" boxes={['The deploy is green']} ticked={[]} onChange={() => undefined} />
      </Field>,
    )
    const group = html.match(/<div id="([^"]+)" role="group" aria-label="What you checked" aria-describedby="([^"]+)" aria-invalid="true">/)
    expect(group).not.toBeNull()
    const [, id, describedBy] = group!
    expect(html).toContain(`<label for="${id}"`)
    expect(describedBy).toBe(`${id}-help ${id}-error`)
  })
})
