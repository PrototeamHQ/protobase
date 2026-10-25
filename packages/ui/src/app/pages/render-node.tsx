import { Fragment, type ComponentType } from 'react'
import { isLayoutNode, type LayoutChild, type LayoutNode, type LayoutValue } from '@protobase/layout'
import { unmarkFieldRefs } from '@protobase/schema/internal'
import { ActionBlock } from './blocks/action'
import type { BlockProps } from './blocks/block-props'
import { CardBlock } from './blocks/card'
import { CardRowBlock } from './blocks/card-row'
import { ChartBlock } from './blocks/chart'
import { FieldBlock } from './blocks/field'
import { GridBlock } from './blocks/grid'
import { LinkBlock } from './blocks/link'
import { ModalFormBlock } from './blocks/modal-form'
import { PageBlock } from './blocks/page-block'
import { ProgressBlock } from './blocks/progress'
import { RecordCardBlock } from './blocks/record-card'
import { RecordCardsBlock } from './blocks/record-cards'
import { RecordRowBlock } from './blocks/record-row'
import { SettingsBlock } from './blocks/settings'
import { ShowBlock } from './blocks/show'
import { StatBlock } from './blocks/stat'
import { TableBlock } from './blocks/table'
import { TabBlock, TabsBlock } from './blocks/tabs'
import { UsersBlock } from '../../users/users-block'
import { ConnectedAccountsBlock } from '../../account/blocks/connected-accounts-block'
import { ConnectedAppsBlock } from '../../account/blocks/connected-apps-block'
import { DevicesBlock } from '../../account/blocks/devices-block'
import { PasskeysBlock } from '../../account/blocks/passkeys-block'
import { PasswordBlock } from '../../account/blocks/password-block'
import { ProfileBlock } from '../../account/blocks/profile-block'
import { TwoFactorBlock } from '../../account/blocks/two-factor-block'
import { CustomBoundary } from './custom-boundary'
import { Problem } from './problem'
import { useProjectUi } from './project-ui'
import { slotted } from '../../locale/slotted'
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
  ModalForm: ModalFormBlock,
  Action: ActionBlock,
  Show: ShowBlock,
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
  Devices: DevicesBlock,
  ConnectedApps: ConnectedAppsBlock,
}

const isInline = (child: LayoutChild) => typeof child === 'string' || (!child.custom && child.type === 'Link')

/** Text and links run together as one paragraph, like a sentence with a link in it; other elements stand alone. */
const renderChildren = (children: LayoutChild[]) => {
  const runs: LayoutChild[][] = []
  for (const child of children) {
    const last = runs.at(-1)
    if (isInline(child) && last && isInline(last[0]!)) last.push(child)
    else runs.push([child])
  }
  return runs.map((run, index) => {
    const [first] = run
    if (!isInline(first!)) return <RenderNode key={index} node={first as LayoutNode} />
    return (
      <p key={index} className="leading-6">
        {run.map((child, position) => (typeof child === 'string' ? <Fragment key={position}>{child}</Fragment> : <RenderNode key={position} node={child} />))}
      </p>
    )
  })
}

const isElements = (value: LayoutValue): value is LayoutNode | LayoutNode[] => isLayoutNode(value) || (Array.isArray(value) && value.length > 0 && value.every(isLayoutNode))

/** Element props (`actions={...}`) rendered like children; the block decides where they go and in which record. */
const renderSlots = (node: LayoutNode) =>
  Object.fromEntries(Object.entries(node.props).flatMap(([name, value]) => (isElements(value) ? [[name, <>{renderChildren(Array.isArray(value) ? value : [value])}</>]] : [])))

/** One element of a composed page: a built-in block, or the project's component registered under its name. */
export const RenderNode = ({ node }: { node: LayoutNode }) => {
  const { components } = useProjectUi()
  if (node.custom) {
    const Custom = components?.[node.type]
    if (!Custom) return <Problem>{slotted(text('noComponent'), node.type)}</Problem>
    // Field references reach the component as the names they reference
    return (
      <CustomBoundary name={node.type}>
        <Custom {...unmarkFieldRefs(node.props)}>{node.children.length > 0 ? renderChildren(node.children) : undefined}</Custom>
      </CustomBoundary>
    )
  }
  const Block = blocks[node.type]
  if (!Block) return <Problem>{slotted(text('unknownBlock'), node.type)}</Problem>
  return (
    <Block node={node} slots={renderSlots(node)}>
      {renderChildren(node.children)}
    </Block>
  )
}
