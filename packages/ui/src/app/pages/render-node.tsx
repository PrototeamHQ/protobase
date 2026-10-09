import { Fragment, type ComponentType, type ReactNode } from 'react'
import { isLayoutNode, type LayoutChild, type LayoutNode, type LayoutValue } from '@protobase/layout'
import { ActionBlock } from './blocks/action'
import type { BlockProps } from './blocks/block-props'
import { CardBlock } from './blocks/card'
import { CardRowBlock } from './blocks/card-row'
import { FieldBlock } from './blocks/field'
import { GridBlock } from './blocks/grid'
import { LinkBlock } from './blocks/link'
import { ModalFormBlock } from './blocks/modal-form'
import { PageBlock } from './blocks/page-block'
import { ProgressBlock } from './blocks/progress'
import { RecordCardBlock } from './blocks/record-card'
import { ShowBlock } from './blocks/show'
import { StatBlock } from './blocks/stat'
import { TableBlock } from './blocks/table'
import { useProjectUi } from './project-ui'

const blocks: Record<string, ComponentType<BlockProps>> = {
  Page: PageBlock,
  Grid: GridBlock,
  Card: CardBlock,
  Stat: StatBlock,
  RecordCard: RecordCardBlock,
  Field: FieldBlock,
  Table: TableBlock,
  CardRow: CardRowBlock,
  Progress: ProgressBlock,
  ModalForm: ModalFormBlock,
  Action: ActionBlock,
  Show: ShowBlock,
  Link: LinkBlock,
}

const Problem = ({ children }: { children: ReactNode }) => (
  <div role="alert" className="rounded-lg border border-dashed border-warning bg-warning-soft p-3 text-[13px] text-warning-text">
    {children}
  </div>
)

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
      <p key={index} className="text-[13px] leading-relaxed">
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
    if (!Custom) return <Problem>No component is registered as {node.type}. Add it to the components in protobase.ui.tsx.</Problem>
    return <Custom {...node.props}>{node.children.length > 0 ? renderChildren(node.children) : undefined}</Custom>
  }
  const Block = blocks[node.type]
  if (!Block) return <Problem>{node.type} is not a block this version of the app knows.</Problem>
  return (
    <Block node={node} slots={renderSlots(node)}>
      {renderChildren(node.children)}
    </Block>
  )
}
