import { describe, expect, it } from 'vitest'
import { Card, Page, RecordCard, Tab, Tabs } from './blocks'
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

const tab = (name: string, label = name) => Tab({ name, label, children: Card({ title: label }) })

describe('tabs', () => {
  it('accepts one Tabs in the Page, with tabs of their own names, beside other elements', () => {
    expect(problems(Page({ title: 'Account', children: [Card({ title: 'Note' }), Tabs({ children: [tab('profile'), tab('security'), tab('two-step')] })] }))).toEqual([])
  })

  it('wants a name and a label on each tab', () => {
    expect(problems(Page({ title: 'x', children: Tabs({ children: { type: 'Tab', props: { name: 'a' }, children: [] } }) }))).toEqual(['<Page> › <Tabs> › <Tab name="a">: "label" is required'])
  })

  it('wants tab names that fit in an address, each once', () => {
    expect(problems(Page({ title: 'x', children: Tabs({ children: [tab('profile'), tab('Sign in'), tab('profile')] }) }))).toEqual([
      '<Page> › <Tabs>: tab name "Sign in" must start with a lowercase letter and hold only letters, digits and dashes',
      '<Page> › <Tabs>: two tabs are named "profile"',
    ])
  })

  it('wants only tabs in a Tabs, and at least one', () => {
    expect(problems(Page({ title: 'x', children: Tabs({ children: [tab('a'), Card({ title: 'Loose' }), 'text'] }) }))).toEqual(['<Page> › <Tabs>: holds only <Tab> elements'])
    expect(problems(Page({ title: 'x', children: Tabs({}) }))).toEqual(['<Page> › <Tabs>: holds no <Tab>'])
  })

  it('wants a Tab directly in a Tabs, and one Tabs directly in the Page', () => {
    expect(problems(Page({ title: 'x', children: Card({ children: tab('a') }) }))).toEqual(['<Page> › <Card> › <Tab name="a">: <Tab> only sits directly in a <Tabs>'])
    expect(problems(Page({ title: 'x', children: RecordCard({ resource: 'plans', children: Tabs({ children: tab('a') }) }) }))).toEqual(['<Page> › <RecordCard resource="plans"> › <Tabs>: <Tabs> only sits directly in the <Page>'])
    expect(problems(Page({ title: 'x', children: [Tabs({ children: tab('a') }), Tabs({ children: tab('b') })] }))).toEqual(["<Page> › <Tabs>: a page holds one <Tabs>, as its tabs take the page's address"])
  })
})
