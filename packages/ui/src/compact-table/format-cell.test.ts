import { expect, it } from 'vitest'
import { formatCell } from './format-cell'

it('formatCell keeps null visible and shows objects as JSON', () => {
  expect([null, undefined, 42, 'a', true, { a: 1 }, [1, 2]].map(formatCell)).toEqual(['null', 'null', '42', 'a', 'true', '{"a":1}', '[1,2]'])
})
