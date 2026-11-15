import { defineBlock } from './create-node'
import type { InlineFieldProps } from './inline-fields'

/**
 * A unified patch the record holds in a text field, as `diff -u` or `git diff` writes it: one column on a phone, old
 * and new side by side on wider screens. Text that is no patch shows as it is.
 */
export type DiffProps = InlineFieldProps

export const Diff = defineBlock<DiffProps>('Diff', false)
