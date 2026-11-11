import type { ComposerProps } from '@protobase/layout'
import { MessageComposer } from '../../conversation/message-composer'
import { propsOf, type BlockProps } from './block-props'

/** A box that sends a message: each send creates a record of `resource` with the text in `field` and the `values`. */
export const ComposerBlock = ({ node }: BlockProps) => {
  const { resource, field, values, placeholder } = propsOf<ComposerProps>(node)
  return <MessageComposer resource={resource} field={field} values={values} placeholder={placeholder} />
}
