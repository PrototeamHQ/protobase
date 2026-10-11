import { createElement, forwardRef, memo } from 'react'
import { describe, expect, it } from 'vitest'
import { defineUi } from './project-ui'
import { uiFromModule } from './ui-from-module'

const RepairBoard = () => createElement('div')
const CustomerRepairs = memo(() => createElement('ul'))
const Field = forwardRef<HTMLInputElement>((_, ref) => createElement('input', { ref }))
const OrdersPerDay = () => createElement('figure')
const send = () => undefined

describe('uiFromModule', () => {
  it('registers every component exported under a PascalCase name, beside those in components', () => {
    const ui = uiFromModule({ RepairBoard, CustomerRepairs, Field, statuses: ['ready'], Colours: { ready: 'green' }, default: defineUi({ components: { OrdersPerDay }, actions: { send } }) })
    expect(ui.components).toEqual({ OrdersPerDay, RepairBoard, CustomerRepairs, Field })
    expect(ui.actions).toEqual({ send })
  })

  it('takes a module with only named exports, or only a default', () => {
    expect(uiFromModule({ RepairBoard }).components).toEqual({ RepairBoard })
    expect(uiFromModule({ default: defineUi({ components: { OrdersPerDay } }) }).components).toEqual({ OrdersPerDay })
    expect(uiFromModule({})).toEqual({})
  })

  it('refuses a name exported as one component and given in components as another', () => {
    expect(() => uiFromModule({ RepairBoard, default: defineUi({ components: { RepairBoard: OrdersPerDay } }) })).toThrow('The component "RepairBoard" is exported by name and given in components as another one')
    expect(uiFromModule({ RepairBoard, default: defineUi({ components: { RepairBoard } }) }).components).toEqual({ RepairBoard })
  })
})
