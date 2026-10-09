import type { LinkProps } from '@protobase/layout'
import { Link } from '../../router'
import { isAppPath } from '../action-href'
import { propsOf, type BlockProps } from './block-props'

const style = 'font-medium text-primary-text hover:underline'

/** A path in the app goes through the router; other links (`mailto:`, `https:`) are ordinary anchors. Its text is its children, else the href. */
export const LinkBlock = ({ node }: BlockProps) => {
  const { href } = propsOf<LinkProps>(node)
  const label = node.children.filter((child): child is string => typeof child === 'string').join('') || href
  if (isAppPath(href)) return <Link to={href} className={style}>{label}</Link>
  return <a href={href} className={style} {...(href.startsWith('http') && { target: '_blank', rel: 'noreferrer' })}>{label}</a>
}
