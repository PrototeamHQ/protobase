import type { LinkProps } from '@protobase/layout'
import { appPath } from '@protobase/schema'
import { fillAddress } from '@protobase/schema/internal'
import { AppLink } from '../../use-app-address'
import { useLayoutRecord } from '../record-scope'
import { cn } from '../../../lib/cn'
import { buttonClass } from '../../../primitives/button'
import { propsOf, type BlockProps } from './block-props'

const linkStyle = 'font-medium text-primary-text hover:underline'

/**
 * `to` an address in the app, through the router, its `{field}`s filled from the record around it; an `href` (`mailto:`,
 * `https:`) is an ordinary anchor. It shows its children, text and spans inline, else where it leads.
 */
export const LinkBlock = ({ node, children, className }: BlockProps) => {
  const props = propsOf<LinkProps>(node)
  const record = useLayoutRecord()?.record
  // A button's look, to which classes add; otherwise classes of its own replace the link's look
  const style = props.variant ? cn(buttonClass({ variant: props.variant }), className) : (className ?? linkStyle)
  // Children that are only blank text show nothing, so the link shows where it leads instead
  const content = node.children.some((child) => typeof child !== 'string' || child.trim() !== '') ? children : undefined
  if (props.to) {
    const to = fillAddress(props.to, record)
    return <AppLink to={to} className={style}>{content ?? appPath(to)}</AppLink>
  }
  const href = props.href ?? ''
  return <a href={href} className={style} {...(href.startsWith('http') && { target: '_blank', rel: 'noreferrer' })}>{content ?? href}</a>
}
