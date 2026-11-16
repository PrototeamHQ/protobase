import { evaluateCondition, fillProps, formatMessage, isLayoutNode, parseCondition, scopeValue, type LayoutChild, type LayoutNode, type LayoutValue, type ReaderTexts, type ValueScope } from '@protobase/layout'
import { fillText, valueText } from '@protobase/schema/internal'
import { Fragment, type ReactNode } from 'react'
import { Body, Button, Column, Container, Head, Hr, Html, Img, Link, Preview, Row, Section, Text } from 'react-email'
import type { MailingApp } from '../mailing-app'

// A template's tree drawn for one send: its placeholders filled from the data, its conditions and lists evaluated,
// its <Trans> in the send's language, and each block as the React Email component that draws it, on the look of
// Protobase's own mail.

const styles = {
  body: { backgroundColor: '#f4f4f5', fontFamily: 'Helvetica, Arial, sans-serif', color: '#18181b' },
  container: { backgroundColor: '#ffffff', padding: '24px', maxWidth: '480px' },
  rule: { borderColor: '#e4e4e7' },
  footer: { color: '#71717a', fontSize: '13px', margin: '0' },
  footerLink: { color: '#71717a' },
  button: { backgroundColor: '#0f766e', color: '#ffffff', padding: '12px 20px', borderRadius: '6px', fontWeight: 600 },
  headings: { h1: { fontSize: '20px' }, h2: { fontSize: '17px' }, h3: { fontSize: '15px' }, h4: { fontSize: '14px' } } as Record<string, object>,
}

export type DrawInput = { texts: ReaderTexts | undefined; app: MailingApp }

const isObject = (value: unknown): value is Record<string, LayoutValue> => typeof value === 'object' && value !== null && !Array.isArray(value)

// The props drawn as text or addresses, beside those fillProps fills
const ownTextProps = ['href', 'src', 'alt']

const filled = (node: LayoutNode, scope: ValueScope): LayoutNode => {
  const props = { ...fillProps(node, scope).props }
  for (const name of ownTextProps) if (typeof props[name] === 'string') props[name] = fillText(props[name], (path) => valueText(scopeValue(scope, path)))
  return { ...node, props }
}

const holds = (when: LayoutValue | undefined, scope: ValueScope) => {
  if (typeof when !== 'string') return false
  const parsed = parseCondition(when)
  if (!parsed.ok) return false
  return evaluateCondition(parsed, Object.fromEntries(parsed.paths.map((path) => [path, scopeValue(scope, path)])))
}

/** The text a `<Trans>` or a written text gives, with its tags as their elements. */
export const transNodes = (node: LayoutNode, scope: ValueScope, input: DrawInput): ReactNode => {
  const components = isObject(node.props.components) ? node.props.components : {}
  const tags = Object.fromEntries(
    Object.entries(components).flatMap(([tag, element]) => (isLayoutNode(element) ? [[tag, (chunks: unknown[]) => draw({ ...element, children: [...element.children] }, scope, input, chunks as ReactNode[])]] : [])),
  )
  const formatted = formatMessage<ReactNode>(input.texts, String(node.props.i18nKey), isObject(node.props.values) ? node.props.values : {}, tags)
  return Array.isArray(formatted) ? formatted.map((part, index) => <Fragment key={index}>{part}</Fragment>) : formatted
}

const drawChildren = (children: readonly LayoutChild[], scope: ValueScope, input: DrawInput): ReactNode[] =>
  children.map((child, index) => (typeof child === 'string' ? <Fragment key={index}>{fillText(child, (path) => valueText(scopeValue(scope, path)))}</Fragment> : <Fragment key={index}>{draw(child, scope, input)}</Fragment>))

// A list's items, each its own record of the stack while its children draw
const drawList = (node: LayoutNode, scope: ValueScope, input: DrawInput): ReactNode => {
  const items = scopeValue(scope, String(node.props.source))
  if (!Array.isArray(items)) return null
  const iterator = node.children.find((child): child is LayoutNode => typeof child !== 'string' && child.type === 'RecordsIterator')
  const each = iterator ? iterator.children : node.children
  return items.map((item, index) => <Fragment key={index}>{drawChildren(each, { ...scope, stack: [...scope.stack, { record: item, row: { index, count: items.length } }] }, input)}</Fragment>)
}

/** One element of a template's tree as React Email draws it, `extra` after its own children, such as a tag's text. */
export const draw = (written: LayoutNode, scope: ValueScope, input: DrawInput, extra: ReactNode[] = []): ReactNode => {
  const node = filled(written, scope)
  const children = [...drawChildren(node.children, scope, input), ...extra]
  const text = (value: LayoutValue | undefined) => (isLayoutNode(value) ? transNodes(value, scope, input) : valueText(value))
  switch (node.type) {
    case 'Trans':
      return transNodes(node, scope, input)
    case 'Fragment':
    case 'Box':
      return node.type === 'Box' ? <Section>{children}</Section> : <>{children}</>
    case 'Row':
      return <Row>{children}</Row>
    case 'Column':
      return <Column>{children}</Column>
    case 'Text': {
      const as = String(node.props.as ?? 'p')
      if (as === 'strong' || as === 'em' || as === 'span') {
        const Tag = as
        return <Tag>{children}</Tag>
      }
      if (as in styles.headings) {
        const Tag = as as 'h1'
        return <Tag style={styles.headings[as]}>{children}</Tag>
      }
      return <Text>{children}</Text>
    }
    case 'Link':
      return <Link href={String(node.props.href ?? '')}>{children}</Link>
    case 'Button':
      return (
        <Button href={String(node.props.href)} style={styles.button}>
          {children}
        </Button>
      )
    case 'Image':
      return <Img src={String(node.props.src ?? '')} alt={text(node.props.alt) as string} {...(typeof node.props.width === 'number' && { width: node.props.width })} {...(typeof node.props.height === 'number' && { height: node.props.height })} />
    case 'Divider':
      return <Hr style={styles.rule} />
    case 'Show':
      return holds(node.props.when, scope) ? <>{children}</> : node.props.fallback === undefined ? null : typeof node.props.fallback === 'string' ? node.props.fallback : drawChildren([node.props.fallback].flat() as LayoutChild[], scope, input)
    case 'Switch': {
      const match = node.children.find((child): child is LayoutNode => typeof child !== 'string' && child.type === 'Match' && holds(filled(child, scope).props.when, scope))
      if (match) return <>{drawChildren(match.children, scope, input)}</>
      return node.props.fallback === undefined ? null : typeof node.props.fallback === 'string' ? node.props.fallback : drawChildren([node.props.fallback].flat() as LayoutChild[], scope, input)
    }
    case 'ArrayField':
      return drawList(node, scope, input)
    case 'RecordsIterator':
      return <>{children}</>
    case 'Field': {
      const value = valueText(scopeValue(scope, String(node.props.source)))
      const label = node.props.label === false ? undefined : node.props.label === undefined ? String(node.props.source) : text(node.props.label)
      return (
        <Text>
          {label !== undefined && <strong>{label}: </strong>}
          {value}
        </Text>
      )
    }
    default:
      // The inline field components show their value as text
      return valueText(scopeValue(scope, String(node.props.source)))
  }
}

/** The whole email: its preview line, the body on a card, and a footer naming the app, linked to its home page. */
export const drawEmail = (tree: LayoutNode, scope: ValueScope, input: DrawInput & { lang: string; preview?: string }) => (
  <Html lang={input.lang}>
    <Head />
    {input.preview !== undefined && input.preview !== '' && <Preview>{input.preview}</Preview>}
    <Body style={styles.body} lang={input.lang}>
      <Container style={styles.container}>
        {drawChildren(tree.children, scope, input)}
        <Hr style={styles.rule} />
        <Text style={styles.footer}>
          <Link href={input.app.url} style={styles.footerLink}>
            {input.app.name}
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
)
