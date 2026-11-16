import type { AccountBlockProps, GridProps, ImageProps, LinkProps, Styled, SwitchProps, TabsProps, UsersProps } from './block-props'
import { defineBlock } from './create-node'
import type { LayoutNode } from './node'
import type { ActionInput, CardInput, ProgressInput, CardRowInput, ChartInput, ComposerInput, FieldInput, MatchInput, ModalFormInput, PageInput, RecordCardInput, RecordCardsInput, RecordRowInput, SettingsInput, ShowInput, StatInput, TabInput, TableInput, ThreadInput, TimelineInput } from './typed/inputs'
import type { ResourceName } from './typed/types'

export type * from './block-props'

const builtIn = <P>(name: string) => defineBlock<P & Styled>(name, false)

const typed = <B>(name: string) => builtIn<any>(name) as unknown as B & { readonly blockName: string; readonly custom: boolean }

export const Page = builtIn<PageInput>('Page')
export const Grid = builtIn<GridProps>('Grid')
export const Card = builtIn<CardInput>('Card')
export const Stat = typed<<R extends ResourceName>(props: StatInput<R>) => LayoutNode>('Stat')
export const RecordCard = typed<<R extends ResourceName>(props: RecordCardInput<R>) => LayoutNode>('RecordCard')
export const Field = builtIn<FieldInput>('Field')
export const Table = typed<<R extends ResourceName>(props: TableInput<R>) => LayoutNode>('Table')
export const CardRow = typed<<R extends ResourceName>(props: CardRowInput<R>) => LayoutNode>('CardRow')
export const RecordRow = typed<<R extends ResourceName>(props: RecordRowInput<R>) => LayoutNode>('RecordRow')
export const RecordCards = typed<<R extends ResourceName>(props: RecordCardsInput<R>) => LayoutNode>('RecordCards')
export const Chart = typed<<R extends ResourceName>(props: ChartInput<R>) => LayoutNode>('Chart')
export const Timeline = typed<<R extends ResourceName>(props: TimelineInput<R>) => LayoutNode>('Timeline')
export const Progress = builtIn<ProgressInput>('Progress')
export const ModalForm = typed<<R extends ResourceName>(props: ModalFormInput<R>) => LayoutNode>('ModalForm')
export const Thread = typed<<R extends ResourceName>(props: ThreadInput<R>) => LayoutNode>('Thread')
export const Composer = typed<<R extends ResourceName>(props: ComposerInput<R>) => LayoutNode>('Composer')
export const Image = builtIn<ImageProps>('Image')
export const Action = typed<<R extends ResourceName>(props: ActionInput<R>) => LayoutNode>('Action')
export const Show = builtIn<ShowInput>('Show')
export const Switch = builtIn<SwitchProps>('Switch')
export const Match = builtIn<MatchInput>('Match')
export const Link = builtIn<LinkProps>('Link')
export const Tabs = builtIn<TabsProps>('Tabs')
export const Tab = builtIn<TabInput>('Tab')
export const Settings = typed<<R extends ResourceName>(props: SettingsInput<R>) => LayoutNode>('Settings')
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
