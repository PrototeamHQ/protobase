import type { LinkProps } from '@protobase/layout'
import { appPath, fillAddress } from '@protobase/schema'
import { AppLink } from '../../use-app-address'
import { useLayoutRecord } from '../record-scope'
import { propsOf, type BlockProps } from './block-props'

const style = 'font-medium text-primary-text hover:underline'

/**
 * `to` an address in the app, through the router, its `{field}`s filled from the record around it; an `href` (`mailto:`,
 * `https:`) is an ordinary anchor. Its text is its children, else where it leads.
 */
export const LinkBlock = ({ node }: BlockProps) => {
  const props = propsOf<LinkProps>(node)
  const record = useLayoutRecord()?.record
  const text = node.children.filter((child): child is string => typeof child === 'string').join('')
  if (props.to) {
    const to = fillAddress(props.to, record)
    return <AppLink to={to} className={style}>{text || appPath(to)}</AppLink>
  }
  const href = props.href ?? ''
  return <a href={href} className={style} {...(href.startsWith('http') && { target: '_blank', rel: 'noreferrer' })}>{text || href}</a>
}
