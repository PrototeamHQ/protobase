import { describe, expect, it } from 'vitest'
import * as ui from '../../packages/ui/src/index'
import optOuts from '../../packages/ui/src/plugins/unstable-blocks.json' with { type: 'json' }
import { buildingBlocks, unexported } from './building-blocks'
import { uiSources } from './ui-sources'

const sources = {
  'primitives/badge.tsx': 'export const Badge = () => null\nexport const badgeTone = "neutral"',
  'primitives/use-hover.ts': 'export const useHover = () => false',
  'primitives/tip.tsx': 'export function Tip() { return null }',
  'auth/sign-in-page.tsx': "import { Badge, badgeTone } from '../primitives/badge'\nimport { useHover } from '../primitives/use-hover'\nimport { Tip } from '../primitives/tip'\nexport const SignInPage = () => null",
  'auth/sign-in-route.tsx': "import { SignInPage } from './sign-in-page'\nimport type { Tip } from '../primitives/tip'",
}

describe('buildingBlocks', () => {
  it('finds the components and hooks another area imports, not what its own area or a type import uses', () => {
    expect(buildingBlocks(sources)).toEqual(['primitives/badge#Badge', 'primitives/tip#Tip', 'primitives/use-hover#useHover'])
  })
})

describe('unexported', () => {
  const blocks = ['primitives/badge#Badge', 'primitives/use-hover#useHover']

  it('fails on a building block the stable entry does not export', () => {
    expect(unexported(blocks, ['Badge'], { pending: [], unstable: {} })).toEqual({ missing: ['primitives/use-hover#useHover'], stale: [] })
  })

  it('passes when an opt-out names it', () => {
    expect(unexported(blocks, ['Badge'], { pending: [], unstable: { 'primitives/use-hover#useHover': 'reads a browser API plugins cannot rely on' } })).toEqual({ missing: [], stale: [] })
    expect(unexported(blocks, ['Badge'], { pending: ['primitives/use-hover#useHover'], unstable: {} })).toEqual({ missing: [], stale: [] })
  })

  it('finds an opt-out of a block that is stable now, or no building block', () => {
    expect(unexported(blocks, ['Badge', 'useHover'], { pending: ['primitives/use-hover#useHover', 'primitives/gone#Gone'], unstable: {} })).toEqual({ missing: [], stale: ['primitives/gone#Gone', 'primitives/use-hover#useHover'] })
  })
})

// The components and hooks Protobase's own screens share are exported from the stable entry, so an app imports them
// rather than copying them. One that stays off it is named in unstable-blocks.json: under `unstable` with why, or
// under `pending` until someone decides. Making one stable is a line in src/index.ts and its name in
// plugin-api.exports.json, and taking it off `pending`.
describe('@protobase/ui', () => {
  const { missing, stale } = unexported(buildingBlocks(uiSources('packages/ui/src')), Object.keys(ui), optOuts)

  it('exports each building block from its stable entry, or opts it out', () => {
    expect(missing, 'export these from packages/ui/src/index.ts, or opt them out in packages/ui/src/plugins/unstable-blocks.json').toEqual([])
  })

  it('opts out no block that is stable or no building block', () => {
    expect(stale, 'take these off packages/ui/src/plugins/unstable-blocks.json').toEqual([])
  })
})
