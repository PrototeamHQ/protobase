import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LayoutChild, LayoutNode } from '@protobase/layout'
import type { ResourceModel } from '@protobase/schema'
import { RecordScope } from '../record-scope'
import { RenderNode } from '../render-node'

const node = (type: string, props: LayoutNode['props'] = {}, children: LayoutChild[] = []): LayoutNode => ({ type, props, children })
const task = { model: { name: 'tasks', fields: {}, primaryKey: ['id'] } as unknown as ResourceModel, record: { id: 7, labels: ['urgent', 'small'], checks: [{ name: 'lint' }, { name: 'types' }] }, key: '7' }

// Each item's card is titled from it, so the titles show what each item read
const titles = (source: string, title: string) =>
  [...renderToStaticMarkup(<RecordScope value={task}><RenderNode node={node('ArrayField', { source }, [node('RecordsIterator', {}, [node('Card', { title })])])} /></RecordScope>).matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((match) => match[1])

describe('ArrayField and RecordsIterator', () => {
  it('draw the children once per text item, read as this, with nothing around them', () => {
    expect(titles('labels', '{{@index}}: {{this}}')).toEqual(['0: urgent', '1: small'])
  })

  it('read object items by key, and still reach the record around them', () => {
    expect(titles('checks', '{{name}} of {{../id}}')).toEqual(['lint of 7', 'types of 7'])
  })

  it('draw nothing for a field that holds no list', () => {
    expect(titles('id', '{{this}}')).toEqual([])
  })
})
