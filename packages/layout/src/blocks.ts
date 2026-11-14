import type { AppAddress, FieldFormat, PageWidth, RowButtonModel, ToolCallFields } from '@protobase/schema'
import { defineBlock } from './create-node'
import type { TableColumn } from './table-columns'
import type { LayoutChildren, LayoutNode, LayoutValue } from './node'

/** One element or several, for slots such as a card's header `actions`. */
export type Elements = LayoutNode | LayoutNode[]

/** How many grid columns an element spans when it sits in a `Grid`. */
export type GridSpan = 1 | 2 | 3 | 4

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

/**
 * Tailwind classes for the element's outer element, such as `rounded-xl bg-primary/10 p-6`, which the web draws as
 * Tailwind does the classes in the app's components. Every built-in element takes them; a client that cannot use them
 * draws the element without them.
 */
export type Styled = { className?: string }

const builtIn = <P>(name: string) => defineBlock<P & Styled>(name, false)

/** Records of `resource` matching `filter` (AIP-160, like the API's `filter`) in `sort` order (AIP-132, like `order_by`). */
export type DataProps = { resource: string; filter?: string; sort?: string }

type Heading = { title?: string; description?: string; actions?: Elements }

export type PageProps = {
  title: string
  description?: string
  actions?: Elements
  /** `full` fills the content pane beside the sidebar instead of the centred column, the default. */
  width?: PageWidth
  children?: LayoutChildren
}
export type GridProps = { columns?: 1 | 2 | 3 | 4; span?: GridSpan; children?: LayoutChildren }
export type CardProps = Heading & { span?: GridSpan; children?: LayoutChildren }
export type StatProps = {
  label: string
  /** A fixed value. */
  value?: string | number
  /** Counts the records of `resource` that match `filter`, and links to that list. */
  resource?: string
  filter?: string
  /** A field of the record around it, such as `plan.name`. */
  field?: string
  format?: FieldFormat
  description?: string
  span?: GridSpan
}
export type RecordCardProps = DataProps & Heading & { recordKey?: string; empty?: string; span?: GridSpan; children?: LayoutChildren }
export type FieldProps = { name: string; label?: string | false; format?: FieldFormat }
export type TableProps = DataProps &
  Heading & {
    /**
     * Field names, or `{ name, priority }` with 1 the most important. At mobile width the table shows at most three
     * columns: those with a priority when it gives any, else the title, then badge columns such as enums, then the rest.
     */
    columns?: TableColumn[]
    /**
     * A last column with a button on each row to an address its fields name, such as
     * `{ label: '{{verb}}', to: { kind: 'record', resource: 'tasks', key: '{{task_id}}', tab: '{{tab}}' } }`, or to the outside
     * page a field holds, `{ label: 'Report', href: '{{report_url}}' }`; a row with no value for a field it names shows none.
     */
    button?: RowButtonModel
    /** Rows can be selected, and the view's `bulk` actions run on the selected rows, as on the list page. */
    bulk?: boolean
    /** How many records it shows, the first in `sort` order; default 10. "View all" opens the rest in the list. */
    limit?: number
    /** The display of the resource's list it opens in, such as `cards`; the list's default when omitted. */
    display?: string
    empty?: string
    span?: GridSpan
  }
export type CardRowProps = DataProps & Heading & { limit?: number; empty?: string; span?: GridSpan; children?: LayoutChildren }
/**
 * What a filter finds, as the resource's list draws it: the filter's chips, how many records match, and the records as
 * the cards of `display` in one row that scrolls sideways, loading more as it scrolls, with "View all".
 */
export type RecordRowProps = DataProps &
  Heading & {
    /** How many records it shows at most; every one that matches when omitted. */
    limit?: number
    /** The cards display of the resource's view whose cards it draws; its first when omitted. */
    display?: string
    empty?: string
    span?: GridSpan
  }
/** How a `RecordCards` lays out its cards: stacked full width, or in one row that scrolls sideways, snapping each card to its left edge. */
export type CardsLayout = 'stack' | 'carousel'
/** How wide each card of a carousel is, as a share of the block's width. */
export type CardWidth = '1/4' | '1/3' | '1/2' | '2/3'
/**
 * What a filter finds as the cards a record page's related section draws with `presentation: 'cards'`, stacked full
 * width under a heading that is not a card: each card its record's title linking to its page, its `fields` under their
 * labels with a long value cut short behind Show more, and its `cardActions`' buttons; "View all" opens the rest.
 */
export type RecordCardsProps = DataProps &
  Heading & {
    /** Default `stack`; `carousel` puts the cards in one row that scrolls sideways. */
    layout?: CardsLayout
    /** How wide each card of a carousel is, as a share of the block's width, so the next one peeks in; default `2/3`. */
    cardWidth?: CardWidth
    /** The fields each card shows, through relations too (`task_id.title`); the list's columns when omitted. */
    fields?: string[]
    /** Named actions of the resource's view, as buttons on each card. */
    cardActions?: string[]
    /** How many records it shows, the first in `sort` order (the list's when omitted); default 10. */
    limit?: number
    /** The display of the resource's list "View all" opens, such as `cards`; the list's default when omitted. */
    display?: string
    empty?: string
    span?: GridSpan
  }
/** How a chart draws its groups: bars, a line through a date field's buckets, or a donut of a field's values. */
export type ChartType = 'bar' | 'line' | 'donut'
/** How long each bucket of a chart over a date or timestamp field is. */
export type ChartBucket = 'hour' | 'day' | 'week' | 'month' | 'year'
/**
 * Records of `resource` matching `filter`, grouped and added up as a chart: how many have each value of `groupBy`, or
 * fall in each bucket of it when it is a date or timestamp field, or with `sum` or `average` that of a numeric field.
 */
export type ChartProps = Heading & {
  resource: string
  filter?: string
  /** A filterable field, such as an enum, a boolean or a relation; an index must serve it. */
  groupBy: string
  /** Default `bar`; `line` is for a date `groupBy`, `donut` for one of values. */
  type?: ChartType
  /** With a date `groupBy`: a filterable field of values that splits each bucket, as stacked bars or a line per value, its 8 largest values and the rest as Other; an index must serve it. */
  splitBy?: string
  /** A numeric field each group adds up, instead of counting its records. */
  sum?: string
  /** A numeric field each group averages, instead of counting its records. */
  average?: string
  /** A date `groupBy`'s bucket; default `day`. */
  granularity?: ChartBucket
  /** How far back a date `groupBy` reaches; default `30d`. */
  range?: '7d' | '30d' | '90d' | '1y' | 'all'
  /** How many values a chart of values shows, the largest; default 10. */
  limit?: number
  empty?: string
  span?: GridSpan
}
export type ProgressProps = {
  /** A number, or a field of the record around it. */
  value: number | string
  /** A number or a field; default 100. */
  max?: number | string
  label?: string
  span?: GridSpan
}
export type ModalFormProps = {
  mode: 'create' | 'edit'
  /** The button that opens the form. */
  label: string
  fields: string[]
  /** Default: the resource of the record around it. */
  resource?: string
  recordKey?: string
  /** The dialog's title; default: the label. */
  title?: string
  /** Values sent with every create, such as the parent record's key. */
  values?: Record<string, LayoutValue>
  variant?: ButtonVariant
}
/**
 * A conversation: the latest `limit` records of a message resource, oldest first, each `text` under its `sender` and
 * `time`, scrolling to the newest as they arrive. `time` is the field that orders them.
 */
export type ThreadProps = Heading & {
  resource: string
  filter?: string
  /** Who wrote each message: a relation, named as the record it points at, or a text field. */
  sender: string
  /** When each message was sent: a date or timestamp field the API can sort by. */
  time: string
  /** The message itself. */
  text: string
  /** A short line under each message, such as whether it was delivered: a text or enum field, its enum labels shown. */
  status?: string
  /** A condition on the record around it, as `<Show when>` takes, such as `state = 'working'`: while it holds, the thread ends in a working indicator. */
  working?: string
  /** Tool calls drawn between the messages in time order, each with its status mark and its input, result and error on request. */
  calls?: ToolCallFields & { resource: string; filter?: string }
  /** How many of the latest messages it shows at first, and of the latest tool calls; default 50. Earlier ones load on request. */
  limit?: number
  empty?: string
  span?: GridSpan
}
/** A box that sends a message: each send creates a record of `resource` with the text in `field`, as the signed-in user. */
export type ComposerProps = {
  resource: string
  /** The text field the message goes in. */
  field: string
  /** Values sent with every message, such as the conversation's key. */
  values?: Record<string, LayoutValue>
  placeholder?: string
  span?: GridSpan
}
/**
 * A picture: a fixed one at `src`, or the PNG an API function draws, called with the reader's token as `GET /api/functions/<function>?width=&height=&theme=`:
 * the size in CSS pixels the client draws it at and its `light` or `dark` theme, for pictures such as a map that some
 * clients cannot draw themselves. A client that draws no images, such as one that shows text only, shows `alt`, or
 * nothing without it.
 */
export type ImageProps = (
  | {
      /** The API function, as in `functions/<function>.ts`; a reader who may not call it sees no image. */
      function: string
      src?: never
    }
  | {
      /** A fixed picture instead of a function's: an `https:` URL, or a path on the app's own origin such as `/logo.svg`. */
      src: string
      function?: never
    }
) & {
  /** What the picture shows, for screen readers and for clients that draw no images. */
  alt?: string
  /** How wide it is drawn; the width of the space it is in when omitted. */
  width?: number
  /** How tall it is drawn; when omitted, the function's picture decides, and the request names no height. */
  height?: number
  /** Every how many seconds the client asks for it again; once when omitted. Regaining window focus never asks again. */
  refresh?: number
}
export type ActionProps = { name: string; resource?: string; label?: string; variant?: ButtonVariant }
/**
 * Its children while `when` holds, else `fallback`, as SolidJS's `<Show when fallback>`; `when` is an AIP-160 condition
 * on the records around it, such as `status = 'done'`.
 */
export type ShowProps = { when: string; fallback?: string | Elements; children?: LayoutChildren }
/** The first of its `Match`es whose `when` holds, else `fallback`, as SolidJS's `<Switch fallback>`. */
export type SwitchProps = { fallback?: string | Elements; children?: LayoutChildren }
/** One branch of a `Switch`, drawn when it is the first whose `when` holds. */
export type MatchProps = { when: string; children?: LayoutChildren }
/**
 * A link: `to` an address in the app, `{{field}}` in it filled from the record around it, or an `href` that leaves the
 * app (`https:`, `mailto:`). One of the two.
 */
export type LinkProps = ({ to: AppAddress; href?: never } | { href: string; to?: never }) & {
  /** Draws it as a button of this variant, with the button's hover and focus states; `className` then adds to it. */
  variant?: ButtonVariant
  children?: LayoutChildren
}

/** One route per `Tab` below the page's address: the first tab at the page's own, each other at `/<page>/<tab name>`. */
export type TabsProps = { children?: LayoutChildren }
/** One tab of a `Tabs`: `name` is its address, after the page's, `label` the word it shows. */
export type TabProps = { name: string; label: string; children?: LayoutChildren }

/**
 * The signed-in person's own record of `resource`, a resource whose `.owner(...)` is its key, as settings: each of
 * `fields` as a control that saves on change, its default until the first save creates the record. Every caller, an
 * admin too, reads and writes only their own record of it. `fields` defaults to every field a person can set.
 */
export type SettingsProps = { resource: string; fields?: string[]; title?: string; description?: string; span?: GridSpan }

/** Everyone who can sign in, for admins: inviting by email, adding accounts, changing roles and blocking. Takes no props but `className`. */
export type UsersProps = Styled

/**
 * A part of the signed-in person's own account, for the `account` page only: their profile, password, passkeys,
 * two-factor authentication, connected accounts, connected apps, or the deletion of the account. Each takes no props but `className`,
 * loads its own data, and hides itself where it does not apply, such as Connected apps without MCP, or Delete account
 * with `auth.accountDeletion: false`.
 */
export type AccountBlockProps = Styled

export const Page = builtIn<PageProps>('Page')
export const Grid = builtIn<GridProps>('Grid')
export const Card = builtIn<CardProps>('Card')
export const Stat = builtIn<StatProps>('Stat')
export const RecordCard = builtIn<RecordCardProps>('RecordCard')
export const Field = builtIn<FieldProps>('Field')
export const Table = builtIn<TableProps>('Table')
export const CardRow = builtIn<CardRowProps>('CardRow')
export const RecordRow = builtIn<RecordRowProps>('RecordRow')
export const RecordCards = builtIn<RecordCardsProps>('RecordCards')
export const Chart = builtIn<ChartProps>('Chart')
export const Progress = builtIn<ProgressProps>('Progress')
export const ModalForm = builtIn<ModalFormProps>('ModalForm')
export const Thread = builtIn<ThreadProps>('Thread')
export const Composer = builtIn<ComposerProps>('Composer')
export const Image = builtIn<ImageProps>('Image')
export const Action = builtIn<ActionProps>('Action')
export const Show = builtIn<ShowProps>('Show')
export const Switch = builtIn<SwitchProps>('Switch')
export const Match = builtIn<MatchProps>('Match')
export const Link = builtIn<LinkProps>('Link')
export const Tabs = builtIn<TabsProps>('Tabs')
export const Tab = builtIn<TabProps>('Tab')
export const Settings = builtIn<SettingsProps>('Settings')
export const Users = builtIn<UsersProps>('Users')
export const Profile = builtIn<AccountBlockProps>('Profile')
export const Password = builtIn<AccountBlockProps>('Password')
export const Passkeys = builtIn<AccountBlockProps>('Passkeys')
export const TwoFactor = builtIn<AccountBlockProps>('TwoFactor')
export const ConnectedAccounts = builtIn<AccountBlockProps>('ConnectedAccounts')
/** The mailboxes the signed-in person links for the app to send mail from (`auth.personalMail`); nothing when the app has none. */
export const PersonalMail = builtIn<AccountBlockProps>('PersonalMail')
/** The accounts the signed-in person connects for their workflows' steps to use; nothing when the app's workflow plugins declare no connection. */
export const Connections = builtIn<AccountBlockProps>('Connections')
export const Devices = builtIn<AccountBlockProps>('Devices')
export const ConnectedApps = builtIn<AccountBlockProps>('ConnectedApps')
/** The signed-in person's personal access tokens, for their scripts (`auth.personalAccessTokens`); nothing when the app has none. */
export const PersonalAccessTokens = builtIn<AccountBlockProps>('PersonalAccessTokens')
export const DeleteAccount = builtIn<AccountBlockProps>('DeleteAccount')
