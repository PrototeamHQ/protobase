import { describe, expect, it } from 'vitest'
import { pinType } from '@protobase/workflows'
import { triggerId } from './definition'
import type { Box } from './graph-layout'
import { keyPart, layoutKey, placedBoxes, triggerLayoutKey, withoutKey, workflowLayoutOf } from './manual-layout'
import { breakId, makeId } from './pins/pure-ids'
import { statusKey } from './pins/node-pins'

const box = (x: number, y: number, width = 100, height = 50): Box => ({ x, y, width, height })
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe('workflowLayoutOf', () => {
  it("reads each view's positions with a finite x and y, from the value or its JSON text, and nothing else", () => {
    const pins = { Save: { x: 420, y: 180, note: 'left out' }, Odd: { x: '1', y: 2 }, Far: { x: Infinity, y: 0 }, None: null }
    expect(workflowLayoutOf({ pins, simple: { Save: { x: 1, y: 2 } }, other: { Save: { x: 3, y: 4 } } })).toEqual({ pins: { Save: { x: 420, y: 180 } }, simple: { Save: { x: 1, y: 2 } } })
    expect(workflowLayoutOf('{"simple":{"Save":{"x":1,"y":2}}}')).toEqual({ pins: {}, simple: { Save: { x: 1, y: 2 } } })
    expect(workflowLayoutOf({ pins: [1], simple: 'no' })).toEqual({ pins: {}, simple: {} })
    for (const nothing of [undefined, null, '', 'not json', [1], 3]) expect(workflowLayoutOf(nothing)).toEqual({ pins: {}, simple: {} })
  })
})

describe('layoutKey', () => {
  it("keys a step by its name, the trigger by its own key, a Break by what it takes apart and a Make by the argument it builds", () => {
    const type = pinType(undefined)
    expect(layoutKey('Each/Save')).toBe('Save')
    expect(layoutKey(triggerId)).toBe(triggerLayoutKey)
    expect(layoutKey(breakId('Each/Save', ['record']), { kind: 'break', id: breakId('Each/Save', ['record']), source: 'Each/Save', path: ['record'], type, outputs: [] })).toBe('Save.record')
    expect(layoutKey(breakId(triggerId, ['customer']), { kind: 'break', id: breakId(triggerId, ['customer']), source: triggerId, path: ['customer'], type, outputs: [] })).toBe('$trigger.customer')
    expect(layoutKey(breakId('Save', [statusKey]), { kind: 'break', id: breakId('Save', [statusKey]), source: 'Save', path: [statusKey], type, outputs: [] })).toBe('Save.#status')
    expect(layoutKey(makeId('Save', 'record'), { kind: 'make', id: makeId('Save', 'record'), target: 'Save', key: 'record', type, inputs: [] })).toBe('Save.#make.record')
  })

  it('keys a Break of the whole of what a step gives apart from the step, and every node apart from every other', () => {
    const type = pinType(undefined)
    const broken = (source: string, path: string[]) => layoutKey(breakId(source, path), { kind: 'break', id: breakId(source, path), source, path, type, outputs: [] })
    const made = (target: string, key: string) => layoutKey(makeId(target, key), { kind: 'make', id: makeId(target, key), target, key, type, inputs: [] })
    expect(broken('Save', [])).toBe('Save.#break')
    expect(broken(triggerId, [])).toBe('$trigger.#break')
    const keys = [layoutKey('Save'), broken('Save', []), broken('Save', ['#break']), broken('Save', ['a', 'b']), broken('Save', ['a.b']), broken('Save', ['#make', 'data']), made('Save', 'data'), layoutKey('Save.a'), layoutKey('$trigger'), layoutKey(triggerId), broken('Save', ['%2E'])]
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain('Save.a%2Eb')
    expect(keyPart('$trigger')).toBe('%24trigger')
    expect(keyPart('#x.y%')).toBe('%23x%2Ey%25')
  })

  it('forgets one position, keeping the others', () => {
    expect(withoutKey({ Save: { x: 1, y: 2 }, Tell: { x: 3, y: 4 } }, 'Save')).toEqual({ Tell: { x: 3, y: 4 } })
  })
})

describe('placedBoxes', () => {
  const root = () => undefined

  it("gives ELK's boxes as they are while no node was moved", () => {
    const laidOut = new Map([['A', box(0, 0)]])
    expect(placedBoxes(laidOut, new Map(), root)).toBe(laidOut)
    expect(placedBoxes(laidOut, new Map([['Gone', { x: 5, y: 5 }]]), root)).toBe(laidOut)
  })

  it('keeps a moved node where it was put, and moves a node ELK laid out under it down below it', () => {
    const laidOut = new Map([['A', box(0, 0)], ['B', box(200, 0)], ['C', box(400, 0)]])
    const boxes = placedBoxes(laidOut, new Map([['A', { x: 180, y: 20 }]]), root)
    expect(boxes.get('A')).toEqual(box(180, 20))
    expect(boxes.get('B')).toEqual(box(200, 102))
    expect(boxes.get('C')).toEqual(box(400, 0))
    // Pushed below one, a node is pushed below the next it lands on
    const stacked = placedBoxes(new Map([['A', box(0, 0)], ['B', box(0, 200)], ['C', box(0, 400)]]), new Map([['A', { x: 0, y: 380 }], ['B', { x: 0, y: 460 }]]), root)
    expect(stacked.get('C')).toEqual(box(0, 542))
    expect(laidOut.get('B')).toEqual(box(200, 0))
  })

  it('grows a Map around a node moved inside it, and moves what the grown Map now covers', () => {
    const parents: Record<string, string> = { Inner: 'Map' }
    const laidOut = new Map([['Map', box(0, 0, 200, 150)], ['Inner', box(24, 48)], ['After', box(250, 0)]])
    const boxes = placedBoxes(laidOut, new Map([['Inner', { x: 300, y: 48 }]]), (id) => parents[id])
    expect(boxes.get('Map')).toEqual(box(0, 0, 424, 150))
    expect(boxes.get('Inner')).toEqual(box(300, 48))
    expect(overlap(boxes.get('Map')!, boxes.get('After')!)).toBe(false)
    expect(boxes.get('After')).toEqual(box(250, 182))
  })
})
