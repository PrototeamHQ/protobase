import { Fragment, useMemo, type ComponentType } from 'react'
import { fillProps, isInlineChild, isLayoutNode, type LayoutChild, type LayoutNode, type LayoutValue } from '@protobase/layout'
import { unmarkFieldRefs } from '@protobase/schema/internal'
import { ActionBlock } from './blocks/action'
import type { BlockProps } from './blocks/block-props'
import { CardBlock } from './blocks/card'
import { CardRowBlock } from './blocks/card-row'
import { ChartBlock } from './blocks/chart'
import { ComposerBlock } from './blocks/composer'
import { DetailsBlock, SummaryBlock } from './blocks/details'
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
import { CustomOrFallback } from './custom-or-fallback'
import { Problem } from './problem'
import { useProjectUi } from './project-ui'
import { useScopeStack, valueScopeOf } from './record-scope'
import { text } from './messages'

const blocks: Record<string, ComponentType<BlockProps>> = {
  Page: PageBlock,
  Grid: GridBlock,
  Card: CardBlock,
  Stat: StatBlock,
  RecordCard: RecordCardBlock,
  Field: FieldBlock,
  Table: TableBlock,
  CardRow: CardRowBlock,
  RecordRow: RecordRowBlock,
  RecordCards: RecordCardsBlock,
  Chart: ChartBlock,
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
const ownClasses = new Set(['Page', 'Grid', 'Card', 'Stat', 'RecordCard', 'Field', 'Table', 'CardRow', 'RecordRow', 'RecordCards', 'Chart', 'Progress', 'Image', 'Thread', 'Link', 'Tabs', 'Settings', 'Show', 'Switch', 'Action', 'Box', 'Row', 'Column', 'Text', 'ReferenceField', 'Details', 'Summary', 'TextField', 'NumberField', 'DateField', 'BooleanField', 'UrlField', 'ChipField'])

/** Text and links as they run in one line. */
const renderInline = (run: LayoutChild[]) => run.map((child, position) => (typeof child === 'string' ? <Fragment key={position}>{child}</Fragment> : <RenderNode key={position} node={child} />))

/** Text, links and field components run together as one paragraph, like a sentence with a link in it; other elements stand alone. */
const renderChildren = (children: LayoutChild[]) => {
  const runs: LayoutChild[][] = []
  for (const child of children) {
    const last = runs.at(-1)
    if (isInlineChild(child) && last && isInlineChild(last[0]!)) last.push(child)
    else runs.push([child])
  }
  return runs.map((run, index) => {
    const [first] = run
    if (!isInlineChild(first!)) return <RenderNode key={index} node={first as LayoutNode} />
    return (
      <p key={index} className="leading-6">
        {renderInline(run)}
      </p>
    )
  })
}

const isElements = (value: LayoutValue): value is LayoutNode | LayoutNode[] => isLayoutNode(value) || (Array.isArray(value) && value.length > 0 && value.every(isLayoutNode))

/** Element props (`actions={...}`) rendered like children; the block decides where they go and in which record. */
const renderSlots = (node: LayoutNode) =>
  Object.fromEntries(Object.entries(node.props).flatMap(([name, value]) => (isElements(value) ? [[name, <>{renderChildren(Array.isArray(value) ? value : [value])}</>]] : [])))

/**
 * One element of a composed page: a built-in block, or the project's component registered under its name. A block's
 * `{{path}}`s are filled from the records around it before it draws.
 */
export const RenderNode = ({ node: written }: { node: LayoutNode }) => {
  const { components } = useProjectUi()
  const stack = useScopeStack()
  const node = useMemo(() => fillProps(written, valueScopeOf(stack)), [written, stack])
  if (node.custom) {
    const Custom = components?.[node.type]
    // Field references reach the component as the names they reference
    return (
      <CustomOrFallback name={node.type} registered={Boolean(Custom)} fallback={node.fallback && <>{renderChildren(node.fallback)}</>}>
        {Custom && <Custom {...unmarkFieldRefs(node.props)}>{node.children.length > 0 ? renderChildren(node.children) : undefined}</Custom>}
      </CustomOrFallback>
    )
  }
  const Block = blocks[node.type]
  if (!Block) return <Problem>{text.rich('unknownBlock', { type: node.type })}</Problem>
  const className = typeof node.props.className === 'string' ? node.props.className : undefined
  // A Text and a Summary are one line, and a Link a piece of one: what they hold runs inline, in no paragraph of its own
  const block = (
    <Block node={node} slots={renderSlots(node)} className={className}>
      {node.type === 'Text' || node.type === 'Link' || node.type === 'Summary' ? renderInline(node.children) : renderChildren(node.type === 'Switch' ? node.children.filter((child) => typeof child !== 'string') : node.children)}
    </Block>
  )
  return className === undefined || ownClasses.has(node.type) ? block : <div className={className}>{block}</div>

}
