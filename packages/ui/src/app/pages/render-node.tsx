import { Fragment, useMemo, type ComponentType } from 'react'
import { fillProps, formatMessage, isInlineChild, isLayoutNode, pointerOf, scopeValue, type LayoutChild, type LayoutNode, type LayoutValue, type ReaderTexts } from '@protobase/layout'
import { fillText, unmarkFieldRefs, valueText } from '@protobase/schema/internal'
import { ActionBlock } from './blocks/action'
import type { BlockProps } from './blocks/block-props'
import { CardBlock } from './blocks/card'
import { CardRowBlock } from './blocks/card-row'
import { ChartBlock } from './blocks/chart'
import { TimelineBlock } from './blocks/timeline/timeline'
import { GraphBlock } from './blocks/graph/graph-block'
import { ComposerBlock } from './blocks/composer'
import { DetailsBlock, SummaryBlock } from './blocks/details'
import { DiffBlock } from './blocks/diff'
import { FieldBlock } from './blocks/field'
import { GridBlock } from './blocks/grid'
import { ImageBlock } from './blocks/image'
import { BooleanFieldBlock, ChipFieldBlock, DateFieldBlock, NumberFieldBlock, TextFieldBlock, UrlFieldBlock } from './blocks/inline-field'
import { LinkBlock } from './blocks/link'
import { ModalFormBlock } from './blocks/modal-form'
import { PageBlock } from './blocks/page-block'
import { ProgressBlock } from './blocks/progress'
import { RecordCardBlock } from './blocks/record-card'
import { RecordCardsBlock } from './blocks/record-cards'
import { RecordRowBlock } from './blocks/record-row'
import { SettingsBlock } from './blocks/settings'
import { ShowBlock } from './blocks/show'
import { MatchBlock, SwitchBlock } from './blocks/switch'
import { StatBlock } from './blocks/stat'
import { TableBlock } from './blocks/table'
import { TabBlock, TabsBlock } from './blocks/tabs'
import { ThreadBlock } from './blocks/thread'
import { BoxBlock, ColumnBlock, RowBlock, TextBlock } from './blocks/plain'
import { ArrayFieldBlock } from './blocks/array-field'
import { RecordsIteratorBlock } from './blocks/records-iterator'
import { SelectInputBlock } from './blocks/select-input'
import { ReferenceArrayFieldBlock } from './blocks/reference-array-field'
import { ReferenceFieldBlock } from './blocks/reference-field'
import { ReferenceManyFieldBlock } from './blocks/reference-many-field'
import { UsersBlock } from '../../users/users-block'
import { ConnectedAccountsBlock } from '../../account/blocks/connected-accounts-block'
import { PersonalMailBlock } from '../../account/blocks/personal-mail-block'
import { ConnectedAppsBlock } from '../../account/blocks/connected-apps-block'
import { PersonalAccessTokensBlock } from '../../account/blocks/personal-access-tokens-block'
import { ConnectionsBlock } from '../../account/blocks/connections-block'
import { DeleteAccountBlock } from '../../account/blocks/delete-account-block'
import { DevicesBlock } from '../../account/blocks/devices-block'
import { PasskeysBlock } from '../../account/blocks/passkeys-block'
import { PasswordBlock } from '../../account/blocks/password-block'
import { ProfileBlock } from '../../account/blocks/profile-block'
import { TwoFactorBlock } from '../../account/blocks/two-factor-block'
import { ComponentElement } from './component-reads'
import { CustomBoundary } from './custom-boundary'
import { CustomChosen } from './custom-chosen'
import { CustomOrFallback } from './custom-or-fallback'
import { Problem } from './problem'
import { useProjectUi } from './project-ui'
import { usePageParamValues } from './page-params'
import { useScopeStack, valueScopeOf } from './record-scope'
import { text } from './messages'
import { useAppTexts, withPropTexts } from './app-texts'

const blocks: Record<string, ComponentType<BlockProps>> = {
  Page: PageBlock,
  Grid: GridBlock,
  Card: CardBlock,
  Stat: StatBlock,
  RecordCard: RecordCardBlock,
  Field: FieldBlock,
  Diff: DiffBlock,
  Table: TableBlock,
  CardRow: CardRowBlock,
  RecordRow: RecordRowBlock,
  RecordCards: RecordCardsBlock,
  Chart: ChartBlock,
  Timeline: TimelineBlock,
  Graph: GraphBlock,
  Progress: ProgressBlock,
  Image: ImageBlock,
  ModalForm: ModalFormBlock,
  Thread: ThreadBlock,
  Composer: ComposerBlock,
  Action: ActionBlock,
  Show: ShowBlock,
  Switch: SwitchBlock,
  Match: MatchBlock,
  Link: LinkBlock,
  Settings: SettingsBlock,
  Tabs: TabsBlock,
  Tab: TabBlock,
  Users: UsersBlock,
  Profile: ProfileBlock,
  Password: PasswordBlock,
  Passkeys: PasskeysBlock,
  TwoFactor: TwoFactorBlock,
  ConnectedAccounts: ConnectedAccountsBlock,
  PersonalMail: PersonalMailBlock,
  Connections: ConnectionsBlock,
  Devices: DevicesBlock,
  ConnectedApps: ConnectedAppsBlock,
  PersonalAccessTokens: PersonalAccessTokensBlock,
  DeleteAccount: DeleteAccountBlock,
  Box: BoxBlock,
  Row: RowBlock,
  Column: ColumnBlock,
  Text: TextBlock,
  ReferenceManyField: ReferenceManyFieldBlock,
  ReferenceArrayField: ReferenceArrayFieldBlock,
  ArrayField: ArrayFieldBlock,
  RecordsIterator: RecordsIteratorBlock,
  ReferenceField: ReferenceFieldBlock,
  SelectInput: SelectInputBlock,
  Details: DetailsBlock,
  Summary: SummaryBlock,
  TextField: TextFieldBlock,
  NumberField: NumberFieldBlock,
  DateField: DateFieldBlock,
  BooleanField: BooleanFieldBlock,
  UrlField: UrlFieldBlock,
  ChipField: ChipFieldBlock,
}

// The blocks that put their classes on an element of their own; the others draw none, or several, and get a <div> for them.
const ownClasses = new Set(['Page', 'Grid', 'Card', 'Stat', 'RecordCard', 'Field', 'Diff', 'Table', 'CardRow', 'RecordRow', 'RecordCards', 'Chart', 'Timeline', 'Graph', 'Progress', 'Image', 'Thread', 'Link', 'Tabs', 'Settings', 'Show', 'Switch', 'Action', 'Box', 'Row', 'Column', 'Text', 'ReferenceField', 'SelectInput', 'Details', 'Summary', 'TextField', 'NumberField', 'DateField', 'BooleanField', 'UrlField', 'ChipField'])

/** A child and its place in the page's tree, the JSON Pointer its planned read names it by; none outside a page. */
type Placed = { child: LayoutChild; at?: string }

const placed = (children: LayoutChild[], at: string | undefined, ...steps: string[]): Placed[] =>
  children.map((child, index) => ({ child, ...(at !== undefined && { at: pointerOf(at, ...steps, index) }) }))

/** A text child with its `{{path}}`s filled from the records around it and the page's parameters, as a prop's are. */
const FilledText = ({ text }: { text: string }) => {
  const stack = useScopeStack()
  const params = usePageParamValues()
  const scope = { ...valueScopeOf(stack), params }
  return <>{fillText(text, (path) => valueText(scopeValue(scope, path)))}</>
}

const textChild = (text: string, key: number) => (text.includes('{{') ? <FilledText key={key} text={text} /> : <Fragment key={key}>{text}</Fragment>)

/** Text and links as they run in one line. */
const renderInline = (run: Placed[]) => run.map(({ child, at }, position) => (typeof child === 'string' ? textChild(child, position) : <RenderNode key={position} node={child} at={at} />))

/** Text, links and field components run together as one paragraph, like a sentence with a link in it; other elements stand alone. */
const renderChildren = (children: Placed[]) => {
  const runs: Placed[][] = []
  for (const entry of children) {
    const last = runs.at(-1)
    if (isInlineChild(entry.child) && last && isInlineChild(last[0]!.child)) last.push(entry)
    else runs.push([entry])
  }
  return runs.map((run, index) => {
    const [first] = run
    if (!isInlineChild(first!.child)) return <RenderNode key={index} node={first!.child as LayoutNode} at={first!.at} />
    return (
      <p key={index} className="leading-6">
        {renderInline(run)}
      </p>
    )
  })
}

const isElements = (value: LayoutValue): value is LayoutNode | LayoutNode[] => isLayoutNode(value) || (Array.isArray(value) && value.length > 0 && value.every(isLayoutNode))

/** Element props (`actions={...}`) rendered like children; the block decides where they go and in which record. */
const renderSlots = (node: LayoutNode, at: string | undefined) =>
  Object.fromEntries(Object.entries(node.props).flatMap(([name, value]) => (isElements(value) ? [[name, <>{renderChildren(slotted(value, at, name))}</>]] : [])))

// One element in a prop is at the prop itself, a list of them each at its index
const slotted = (value: LayoutNode | LayoutNode[], at: string | undefined, name: string): Placed[] =>
  Array.isArray(value) ? placed(value, at, 'props', name) : [{ child: value, ...(at !== undefined && { at: pointerOf(at, 'props', name) }) }]

const isObject = (value: unknown): value is Record<string, LayoutValue> => typeof value === 'object' && value !== null && !Array.isArray(value)

// A <Trans> child as the text it runs as: its message in the user's language, each tag the element `components` gives
// it with the text inside the tag as its children
const transChildren = (node: LayoutNode, texts: ReaderTexts | undefined): LayoutChild[] => {
  const components = isObject(node.props.components) ? node.props.components : {}
  const tags = Object.fromEntries(Object.entries(components).flatMap(([tag, element]) => (isLayoutNode(element) ? [[tag, (chunks: unknown[]) => ({ ...element, children: [...element.children, ...(chunks as LayoutChild[])] })]] : [])))
  const formatted = formatMessage<LayoutNode>(texts, String(node.props.i18nKey), isObject(node.props.values) ? node.props.values : {}, tags)
  return Array.isArray(formatted) ? formatted.map((part) => (typeof part === 'string' || isLayoutNode(part) ? part : String(part))) : [formatted]
}

/**
 * One element of a composed page: a built-in block, or the project's component registered under its name. A block's
 * `{{path}}`s are filled from the records around it and the page's parameters before it draws. `at` is its place in
 * the page's tree, by which a block finds its planned read.
 */
export const RenderNode = ({ node: written, at }: { node: LayoutNode; at?: string }) => {
  const { components } = useProjectUi()
  const stack = useScopeStack()
  const params = usePageParamValues()
  const texts = useAppTexts()
  const node = useMemo(() => withPropTexts(fillProps(written, { ...valueScopeOf(stack), params }), texts), [written, stack, params, texts])
  if (node.type === 'Trans' && !node.custom) return <>{renderInline(transChildren(node, texts).map((child) => ({ child })))}</>
  if (node.custom) {
    const Custom = components?.[node.type]
    // Field references reach the component as the names they reference; its children draw in the record its
    // `select` chose, and its declared reads reach it through useComponentReads
    const children = node.children.length > 0 ? <CustomChosen node={node}>{renderChildren(placed(node.children, at, 'children'))}</CustomChosen> : undefined
    return (
      <CustomOrFallback name={node.type} registered={Boolean(Custom)} fallback={node.fallback && <>{renderChildren(placed(node.fallback, at, 'fallback'))}</>}>
        {Custom && (
          <ComponentElement node={node} {...(at !== undefined && { at })}>
            <Custom {...unmarkFieldRefs(node.props)}>{children}</Custom>
          </ComponentElement>
        )}
      </CustomOrFallback>
    )
  }
  const Block = blocks[node.type]
  if (!Block) return <Problem>{text.rich('unknownBlock', { type: node.type })}</Problem>
  const className = typeof node.props.className === 'string' ? node.props.className : undefined
  const children = placed(node.children, at, 'children')
  // A Text and a Summary are one line, and a Link a piece of one: what they hold runs inline, in no paragraph of its own
  const block = (
    <Block node={node} at={at} slots={renderSlots(node, at)} className={className}>
      {node.type === 'Text' || node.type === 'Link' || node.type === 'Summary' ? renderInline(children) : renderChildren(node.type === 'Switch' ? children.filter(({ child }) => typeof child !== 'string') : children)}
    </Block>
  )
  const classed = className === undefined || ownClasses.has(node.type) ? block : <div className={className}>{block}</div>
  // A block with a fallback, such as a Graph's, draws it where the block cannot draw, as a custom component's does
  if (!node.fallback) return classed
  return (
    <CustomBoundary name={node.type} resetKey={node} fallback={<>{renderChildren(placed(node.fallback, at, 'fallback'))}</>}>
      {classed}
    </CustomBoundary>
  )

}
