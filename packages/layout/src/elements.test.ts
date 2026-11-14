import { describe, expect, it } from 'vitest'
import { Card, Link, Page, Stat, Table } from './blocks'
import { Box, Column, Row, Text } from './elements'
import { page } from './page'
import type { LayoutNode } from './node'

const problems = (tree: LayoutNode) => {
  try {
    page('test', tree)
    return []
  } catch (error) {
    return (error as Error).message.split('\n').slice(1).map((line) => line.replace(/^\s+- /, ''))
  }
}

describe('plain elements', () => {
  it('build a page of their own from boxes, rows, columns, text and links, each with its classes', () => {
    const tree = Page({
      title: 'Welcome',
      children: Column({
        className: 'gap-6',
        children: [
          Text({ as: 'h1', className: 'text-4xl font-bold', children: 'Hello' }),
          Row({ className: 'items-center gap-3', children: [Box({ className: 'size-12 rounded-full bg-primary' }), Text({ children: ['Read the ', Link({ href: 'https://example.com/guide', className: 'underline', children: 'guide' })] })] }),
        ],
      }),
    })
    expect(problems(tree)).toEqual([])
    const column = tree.children[0] as LayoutNode
    expect(column).toEqual({ type: 'Column', props: { className: 'gap-6' }, children: expect.any(Array) })
    expect(column.children[0]).toEqual({ type: 'Text', props: { as: 'h1', className: 'text-4xl font-bold' }, children: ['Hello'] })
  })

  it('send their classes as they are, in the JSON a client gets', () => {
    const box = Box({ className: 'md:grid-cols-[1fr_2fr] hover:bg-muted/50' })
    expect(JSON.parse(JSON.stringify(box))).toEqual({ type: 'Box', props: { className: 'md:grid-cols-[1fr_2fr] hover:bg-muted/50' }, children: [] })
  })

  it('take classes on every block too, and only text', () => {
    expect(problems(Page({ title: 'x', className: 'bg-muted', children: [Card({ title: 'c', className: 'ring-2' }), Stat({ label: 's', value: 1, className: 'col-span-2' })] }))).toEqual([])
    const tree: LayoutNode = { type: 'Page', props: { title: 'x' }, children: [{ type: 'Table', props: { resource: 'tasks', className: ['p-4'] }, children: [] }] }
    expect(problems(tree)).toEqual(['<Page> › <Table resource="tasks">: "className" must be text'])
    expect(Table({ resource: 'tasks', className: 'p-4' }).props.className).toBe('p-4')
  })

  it('let a Text hold a piece of its line as a Text span, and a Link look like a button', () => {
    expect(problems(Page({ title: 'x', children: [Text({ children: ['Hi ', Text({ as: 'span', className: 'font-semibold', children: 'Sam' })] }), Link({ href: 'https://example.com', variant: 'primary', children: 'Go' })] }))).toEqual([])
    expect(problems(Page({ title: 'x', children: Text({ children: Text({ children: 'a' }) }) }))).toEqual(['<Page> › <Text>: holds text, <Link>s, <Text as="span">s and field components such as <TextField> only; put other elements beside it in a <Row> or <Column>'])
  })

  it('refuse a link inside a link, through a Text span too, naming where the inner one is', () => {
    const tree = Page({
      title: 'x',
      children: [
        Link({ href: 'https://example.com/a', children: Link({ href: 'https://example.com/b', children: 'b' }) }),
        Link({ href: 'https://example.com/a', children: Text({ as: 'span', children: ['see ', Link({ href: 'https://example.com/b', children: 'b' })] }) }),
      ],
    })
    expect(problems(tree)).toEqual([
      '<Page> › <Link>: holds another link at <Link>; a link cannot contain a link',
      '<Page> › <Link>: holds another link at <Text> › <Link>; a link cannot contain a link',
    ])
  })

  it('let links stand beside each other in a Text, and a link hold a span without one', () => {
    const tree = Page({
      title: 'x',
      children: [
        Text({ children: [Link({ href: 'https://example.com/a', children: 'a' }), ' or ', Link({ href: 'https://example.com/b', children: 'b' })] }),
        Link({ href: 'https://example.com/a', children: Text({ as: 'span', className: 'font-semibold', children: 'a' }) }),
      ],
    })
    expect(problems(tree)).toEqual([])
  })

  it('keep a Text to text and links, and its as to a paragraph, a span or a heading', () => {
    const tree = Page({ title: 'x', children: [Text({ children: [Box({})] }), { type: 'Text', props: { as: 'div' }, children: ['a'] }] })
    expect(problems(tree)).toEqual([
      '<Page> › <Text>: holds text, <Link>s, <Text as="span">s and field components such as <TextField> only; put other elements beside it in a <Row> or <Column>',
      '<Page> › <Text>: "as" must be p, span, h1, h2, h3, h4',
    ])
  })
})
