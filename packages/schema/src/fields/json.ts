import { z } from 'zod'
import { maxJsonDepth, withinJsonDepth } from './json-depth'

// The depth check runs first and a value it refuses stops the pipe, since z.json() walks a value recursively and
// overflows the stack on one nested thousands of levels deep.
export const json = {
  type: 'json',
  constraints: [],
  build: () =>
    z.preprocess((value, ctx) => {
      if (!withinJsonDepth(value)) ctx.addIssue({ code: 'custom', message: `Nested deeper than ${maxJsonDepth} levels`, params: { max_depth: maxJsonDepth } })
      return value
    }, z.json()),
} as const
