import { describe, expect, it } from 'vitest'
import { declaredComponents } from './component-names'

describe('declaredComponents', () => {
  it('reads the names declared with component() of @protobase/layout, typed or not, renamed or through a namespace', () => {
    const code = `import { component, page } from '@protobase/layout'
import { component as declare } from '@protobase/layout'
import * as layout from '@protobase/layout'
export const RepairBoard = component<{ by: string }>('RepairBoard')
export const CustomerRepairs = declare("CustomerRepairs")
export const UsageChart = layout.component('UsageChart')
`
    expect(declaredComponents(code, 'ui.ts')).toEqual(['RepairBoard', 'CustomerRepairs', 'UsageChart'])
  })

  it('reads layout files with JSX', () => {
    const code = `/** @jsxImportSource @protobase/layout */
import { Page, component, page } from '@protobase/layout'
export const OrdersPerDay = component<{ days: 7 | 30 }>('OrdersPerDay')
export const overview = page('overview', <Page title="Overview"><OrdersPerDay days={30} /></Page>)
`
    expect(declaredComponents(code, 'page.tsx')).toEqual(['OrdersPerDay'])
  })

  it('ignores other functions called component, and modules without @protobase/layout', () => {
    expect(declaredComponents(`import { component } from './mine'\ncomponent('Board')\n`, 'a.ts')).toEqual([])
    expect(declaredComponents(`import { page } from '@protobase/layout'\nconst component = (name: string) => name\ncomponent('Board')\n`, 'a.ts')).toEqual([])
  })
})
