import { describe, expect, it } from 'vitest'
import type { FieldModel } from '@protobase/schema'
import type { FieldWidget } from './field-widget'
import { membersField } from './members/members-field'
import { shownWidget } from './shown-widget'

const field = (type: FieldModel['type'], extra: Partial<FieldModel> = {}) =>
  ({ name: 'score', column: 'score', type, nullable: true, readOnly: false, filterable: false, sortable: false, aliases: [], ...extra }) as FieldModel

const Stars = () => null
const rating: FieldWidget = { of: ['integer', 'decimal'], display: Stars }

describe('shownWidget', () => {
  it('is the registered field type the view chooses, with its props', () => {
    expect(shownWidget({ rating }, field('integer'), { widget: { name: 'rating', props: { max: 5 } } })).toEqual({ name: 'rating', widget: rating, props: { max: 5 } })
    expect(shownWidget({ rating }, field('decimal'), { widget: { name: 'rating' } })).toEqual({ name: 'rating', widget: rating, props: {} })
  })

  it('is none without a choice, for a field type no plugin registers, a storage type it does not show, or a sensitive field', () => {
    expect(shownWidget({ rating }, field('integer'), { label: 'Score' })).toBeUndefined()
    expect(shownWidget(undefined, field('integer'), { widget: { name: 'rating' } })).toBeUndefined()
    expect(shownWidget({ rating }, field('integer'), { widget: { name: 'toString' } })).toBeUndefined()
    expect(shownWidget({ rating }, field('text'), { widget: { name: 'rating' } })).toBeUndefined()
    expect(shownWidget({ rating }, field('integer', { sensitive: true }), { widget: { name: 'rating' } })).toBeUndefined()
  })

  it('is a built-in field type of that name, unless a plugin registers one of the same name', () => {
    expect(shownWidget(undefined, field('json'), { widget: { name: 'members' } })).toEqual({ name: 'members', widget: membersField, props: {} })
    expect(shownWidget(undefined, field('text'), { widget: { name: 'members' } })).toBeUndefined()
    const own: FieldWidget = { of: ['json'], display: Stars }
    expect(shownWidget({ members: own }, field('json'), { widget: { name: 'members' } })?.widget).toBe(own)
  })
})
