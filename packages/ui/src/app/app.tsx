import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { AssistantClient, AuthSession, Client, RuntimeClient } from '@protobase/client'
import { accountMenuItems, accountSecurityPath, signInPolicyPath } from '../account/account-pages'
import { AccountSecurityPage } from '../account/account-security-page'
import { connectRoute, type SignInPromptModel } from '@protobase/schema'
import { SignInPrompt } from '../auth/sign-in-prompt'
import { ConnectPage } from '../connect/connect-page'
import { SignInPolicyPage } from '../account/sign-in-policy-page'
import { AppShell, type SidebarMode } from '../app-shell'
import { ApiProvider } from '../data/api-provider'
import { AuthGate, AuthProvider, isAdmin, userToShell, useAuth } from '../auth'
import { AuthLocale } from '../auth/auth-locale'
import { useSignInAddress } from '../auth/use-sign-in-address'
import { useLiveUpdates } from '../data/use-live-updates'
import { useOpenedRecord } from '../data/use-record'
import { PublicFormPage } from '../forms/public-form-page'
import { useFormAddress } from '../forms/use-form-address'
import { recordTitle } from '../live/model-helpers'
import { humanize } from '../live/naming'
import { ThemeProvider, useTheme } from '../theme/theme-provider'
import { setFallbackLocale } from '../locale/active-locale'
import type { Locale } from '@protobase/schema/internal'
import { ToastProvider } from '../toasts'
import { AssistantButton, AssistantPanel } from './assistant-shell'
import { bottomBarFromMeta } from './bottom-bar-from-meta'
import { breadcrumbFor } from './breadcrumb-for'
import { documentTitle, titleParts, useDocumentTitle } from './document-title'
import { CreateRoute } from './create/create-route'
import { ListPage } from './list-page'
import { startErrorReporting } from './error-reporting'
import { MetaGate, Notice, useAdminMeta } from './meta-gate'
import { InvitationsPage } from '../organizations/invitations-page'
import { MembersPage } from '../organizations/members-page'
import { OrganizationPage } from '../organizations/organization-page'
import { invitationsPath, managesOrganization, membersPath, organizationMenuItems, organizationPageTitle, organizationPath, organizationsPath } from '../organizations/organization-paths'
import { OrganizationsPage } from '../organizations/organizations-page'
import { reopenIn, useOrganizations } from '../organizations/use-organizations'
import { actingUser } from '../roles/acting-user'
import { useActiveRole } from '../roles/use-active-role'
import { viewOfList } from '@protobase/schema/internal'
import { navFromMeta, navItemId } from './nav-from-meta'
import { ComposedPage } from './pages/composed-page'
import { CustomBoundary } from './pages/custom-boundary'
import { ProjectLogo } from './project-logo'
import { ProjectUiContext, useProjectUi, type ProjectUi } from './pages/project-ui'
import type { PluginLoader } from '../plugins/load-plugin'
import { PluginGate, usePluginsOff } from '../plugins/plugin-gate'
import { PluginSourceProvider } from '../plugins/plugin-source'
import { PluginNotice } from '../plugins/plugin-notice'
import { RecordPage } from './record-page'
import { SourceNotice } from './source-notice'
import { sourceStatusOf } from '../data/with-sources'
import { useGlobalSearch } from './search/use-global-search'
import { Router, useRouter } from './router'
import { RuntimeUpdateButton } from './runtime/runtime-update'
import { StaffBanner } from './staff-banner'
import { useNavRecent } from './use-nav-recent'
import { useAppAddress, type CurrentAddress } from './use-app-address'
import { userMenuFromMeta } from './user-menu-from-meta'
import { slotted } from '../locale/slotted'
import { text as appText } from './messages'
import type { NativeBridge } from './native-auth-fetch'

export type AppProps = {
  /** Where `/api/v1` lives. Defaults to the current origin. */
  baseUrl?: string
  /** A ready-made client, for tests. */
  client?: Client
  /** Ready-made clients of the sources `/meta` names, by their URL, for stories and tests. */
  sources?: Record<string, Client>
  /** Sign-in state for the app; made from `baseUrl`'s origin when omitted. */
  auth?: AuthSession
  /** Path prefix the app is mounted under, for example `/admin`. */
  basePath?: string
  /** Keeps the location in memory instead of the address bar, for Storybook. */
  initialUrl?: string
  workspace?: string
  sidebarMode?: SidebarMode
  /** The project's React code for composed pages: custom components and action handlers (`protobase.ui.tsx`). */
  ui?: ProjectUi
  /** A ready-made client of the assistant backend, for stories and tests; used only when `/meta` names an assistant. */
  assistant?: AssistantClient
  /** A ready-made client of the runtime endpoint, for stories and tests; used only when `/meta` names one. */
  runtime?: RuntimeClient
  /** How the plugins are loaded, for stories and tests; the page's `fetch` and `import()` by default. */
  pluginLoader?: PluginLoader
  /** The language the screens are in when the app's `/meta` sets none, such as the browser's (`browserLocale()`); English by default. */
  locale?: Locale
  /** The native bridge of the iOS or Android app (`nativeBridgeOf`): sign-in goes through native HTTP. */
  nativeBridge?: NativeBridge
}

// The resource or page an address is about, which the sidebar marks; a record's key, which its recent records mark.
const placeOf = (address: CurrentAddress | undefined) => {
  if (address?.kind === 'page') return address.page
  if (address?.kind === 'list') return navItemId(address.resource, address.list)
  return address?.resource
}
const recordOf = (address: CurrentAddress | undefined) => (address?.kind === 'record' ? address : undefined)

// A visitor who opens the connect page signs in first; signing in comes back to it, request and all.
const connectPrompt: SignInPromptModel = { title: 'Sign in to connect an app', description: 'An app asks to act as you here. Sign in, then choose whether to allow it.' }

const Routes = ({ workspace, sidebarMode, assistant, runtime }: Pick<AppProps, 'workspace' | 'sidebarMode' | 'assistant' | 'runtime'>) => {
  const meta = useAdminMeta()
  const { state, session, signOut, stopStaffSession, organizations: organizationSettings } = useAuth()
  const signIn = useSignInAddress()
  if (state.kind !== 'signed-in' && state.kind !== 'visitor') throw new Error('The shell is only rendered for a signed-in user or a visitor')
  // A visitor browses what the anonymous role reads: no account, roles or organizations, and a "Sign in" link.
  const user = state.kind === 'signed-in' ? state.user : undefined
  const staff = state.kind === 'signed-in' ? state.staff : undefined
  const { path, params, basePath } = useRouter()
  const { address, go, open } = useAppAddress()
  const place = placeOf(address)
  const shown = recordOf(address)
  const search = useGlobalSearch()
  const theme = useTheme()
  const recent = useNavRecent(meta, basePath, { resource: shown?.resource, key: shown?.key })
  useLiveUpdates(meta)
  const groups = navFromMeta(meta, basePath, recent)
  const firstPage = Object.keys(meta.pages)[0]
  const firstResource = Object.keys(meta.resources)[0]
  const page = address?.kind === 'page' ? meta.pages[address.page] : undefined

  // The root opens the first page, else the first resource's list
  useEffect(() => {
    if (path !== '/') return
    if (firstPage) go({ kind: 'page', page: firstPage }, { replace: true })
    else if (firstResource) go({ kind: 'list', resource: firstResource }, { replace: true })
  }, [path, firstPage, firstResource, go])

  const resource = address?.kind === 'page' ? undefined : address?.resource
  // A resource drawn from another API waits for that API's `/meta`, and says so when it cannot be read.
  const drawnFrom = resource ? sourceStatusOf(meta, resource) : undefined
  const view = resource ? viewOfList(meta.views[resource], address?.kind === 'list' ? address.list : undefined) : undefined
  const group = groups.find((entry) => entry.items.some((item) => item.id === place))
  const model = resource ? meta.resources[resource] : undefined
  const record = useOpenedRecord(shown?.resource ?? '', shown?.key ?? '', Boolean(model && shown))
  const title = model && shown && record.data ? recordTitle(model, view, record.data.record, shown.key) : undefined
  // Until the record (or the source it is drawn from) has loaded, its crumb is a skeleton; a failed load falls back to the key.
  const titleLoading = Boolean(shown) && (record.isLoading || drawnFrom?.state === 'loading')
  const { shell } = useProjectUi()
  const Actions = shell?.actions
  const RightPanel = shell?.rightPanel
  // The assistant is there when `/meta` names one, which it does only for the admin and ai roles.
  const [assistantOpen, setAssistantOpen] = useState(false)
  const assistantUrl = meta.assistant?.url
  const assistantButton = assistantUrl && <AssistantButton open={assistantOpen} onToggle={() => setAssistantOpen(!assistantOpen)} />
  const assistantPanel = assistantUrl && assistantOpen && <AssistantPanel url={assistantUrl} client={assistant} page={params.size > 0 ? `${path}?${params}` : path} onClose={() => setAssistantOpen(false)} />
  // The app's errors go to the error tracker `/meta` names, when the app reports them.
  const errorReporting = meta.errorReporting
  useEffect(() => {
    if (errorReporting) void startErrorReporting(errorReporting)
  }, [errorReporting])
  // The update button is there when `/meta` names a runtime endpoint, which it does only for the admin role.
  const runtimeUrl = meta.runtime?.url
  const runtimeButton = runtimeUrl && <RuntimeUpdateButton url={runtimeUrl} client={runtime} />
  // The session acts with one role at a time; what the shell shows by role follows it, as the API does.
  const role = useActiveRole(useCallback(() => reopenIn(basePath), [basePath]), Boolean(user))
  const acting = user && actingUser(user, role.current)
  const admin = acting ? isAdmin(acting) : false
  // Admins hear about plugins the app should load but did not, and why
  const pluginsOff = usePluginsOff()
  // With organizations, the app works in one at a time; someone in none chooses or makes one first.
  const organizations = useOrganizations(Boolean(organizationSettings && user))
  const current = organizations.current
  const outsideOrganizations = Boolean(organizationSettings) && current !== undefined && !current.organization
  const organizationPage = organizationSettings && user ? organizationPageTitle(path) : undefined
  // The account pages are the app's own, under `/-/`; everything else is a page or a resource.
  const accountPage = path === connectRoute ? 'Connect an app' : !user ? undefined : path === accountSecurityPath ? appText('signInSecurity') : path === signInPolicyPath ? appText('signInPolicy') : organizationPage
  const resourceLabel = view?.names?.plural ?? (resource && humanize(resource))
  const breadcrumb = accountPage ? [accountPage] : breadcrumbFor({ basePath, address, group: group?.label, page, resourceLabel, recordTitle: title, recordLoading: titleLoading })
  const singular = view?.names?.singular ?? (resource && humanize(resource))
  useDocumentTitle(documentTitle(titleParts({ address, page, accountPage, resourceLabel, singular, recordTitle: title, recordLoading: titleLoading }), meta.appName))
  const content =
    path === connectRoute ? (
      user ? <ConnectPage email={user.email} appName={meta.appName ?? 'this app'} /> : <SignInPrompt as="page" prompt={connectPrompt} />
    ) : user && path === accountSecurityPath ? (
      <AccountSecurityPage email={user.email} />
    ) : user && path === signInPolicyPath ? (
      admin ? <SignInPolicyPage /> : <Notice title={appText('adminsOnly')}>{appText('onlyAdminPolicy')}</Notice>
    ) : organizationPage && path === organizationPath ? (
      <OrganizationPage current={current} basePath={basePath} onChanged={organizations.reload} />
    ) : organizationPage && (path === membersPath || path === invitationsPath) ? (
      !managesOrganization(current) ? <Notice title={appText('ownersOnly')}>{appText('onlyOwners')}</Notice> : path === membersPath ? <MembersPage current={current} /> : <InvitationsPage current={current} />
    ) : (organizationPage && path === organizationsPath) || outsideOrganizations ? (
      <OrganizationsPage state={organizations} basePath={basePath} />
    ) : !address ? (
      path === '/' ? <Notice title={appText('chooseResource')}>{appText('pickFromSidebar')}</Notice> : <Notice title={appText('notFound')}>{appText('nothingHere')}</Notice>
    ) : address.kind === 'page' ? (
      page ? <ComposedPage key={page.name} name={page.name} /> : <Notice title={appText('notFound')}>{slotted(appText('noPage'), address.page)}</Notice>
    ) : drawnFrom && drawnFrom.state !== 'ready' ? (
      <SourceNotice status={drawnFrom} />
    ) : address.kind === 'create' ? (
      <CreateRoute key={address.resource} resource={address.resource} values={address.values} />
    ) : address.kind === 'record' ? (
      <RecordPage key={`${address.resource}/${address.key}`} resource={address.resource} recordKey={address.key} />
    ) : (
      <ListPage key={navItemId(address.resource, address.list)} address={address} />
    )

  const appShell = (
    <AppShell
      pageScroll
      sidebarMode={sidebarMode ?? 'text-small'}
      activeItem={place ?? ''}
      breadcrumb={breadcrumb}
      user={acting && userToShell(acting)}
      onSignOut={user && (() => void signOut())}
      signIn={user ? undefined : signIn.link()}
      workspace={current?.organization?.name ?? workspace}
      appName={meta.appName}
      appIcon={meta.appIcon}
      logo={ProjectLogo}
      navGroups={groups}
      bottomBar={bottomBarFromMeta(meta, basePath, place)}
      userMenu={[...userMenuFromMeta(meta, basePath, place), ...(organizationSettings && user ? organizationMenuItems(basePath, path, current) : []), ...(user ? accountMenuItems(basePath, path, admin) : [])]}
      organizations={
        organizationSettings && {
          ...(current?.organization && { current: { id: current.organization.id, name: current.organization.name } }),
          others: organizations.organizations.filter((organization) => organization.id !== current?.organization?.id),
          onSwitch: (id) => void session.organizations.switchTo(id).then(() => reopenIn(basePath)),
        }
      }
      theme={{ preference: theme.preference, onChange: theme.choose }}
      roles={role.current?.active ? { active: role.current.active, roles: role.current.roles, onSwitch: role.switchTo } : undefined}
      onNavigate={open}
      search={search.available ? { placeholder: search.placeholder, text: search.text, onTextChange: search.setText, query: search.query, loading: search.loading, groups: search.groups, onSelect: open } : undefined}
      actions={(Actions || runtimeButton || assistantButton) && <>{Actions && <CustomBoundary name="shell.actions" fallback={null}><Actions /></CustomBoundary>}{runtimeButton}{assistantButton}</>}
      rightPanel={(RightPanel || assistantPanel) && <>{RightPanel && <CustomBoundary name="shell.rightPanel" fallback={null}><RightPanel /></CustomBoundary>}{assistantPanel}</>}
    >
      {content}
    </AppShell>
  )
  const pluginNotice = admin && pluginsOff.length > 0
  if (!staff && !pluginNotice) return appShell
  // Staff signed in as the user: the banner stays above the whole shell until they stop or the session ends. Below it,
  // the plugins that are off, for an admin.
  return (
    <div className="flex h-full min-h-0 flex-col">
      {staff && <StaffBanner signIn={staff} onStop={stopStaffSession} />}
      {pluginNotice && <PluginNotice off={pluginsOff} />}
      <div className="min-h-0 flex-1">{appShell}</div>
    </div>
  )
}

const Authenticated = ({ baseUrl, client, sources, workspace, sidebarMode, ui, assistant, runtime }: Omit<AppProps, 'auth' | 'basePath' | 'initialUrl' | 'pluginLoader'>) => {
  const { state, session, markSignedOut } = useAuth()
  // A visitor has no token to ask the session for: their requests go without one, as the anonymous role.
  return (
    <ApiProvider baseUrl={baseUrl} client={client} sources={sources} token={state.kind === 'visitor' ? undefined : session.token} onUnauthenticated={markSignedOut}>
      <MetaGate>
        <ToastProvider>
          <PluginGate ui={ui}>
            <Routes workspace={workspace} sidebarMode={sidebarMode} assistant={assistant} runtime={runtime} />
          </PluginGate>
        </ToastProvider>
      </MetaGate>
    </ApiProvider>
  )
}

// A public form needs no session: anyone opens it, signed in or not, and it sends without a token.
const PublicFormGate = ({ baseUrl, client, ui, children }: Pick<AppProps, 'baseUrl' | 'client' | 'ui'> & { children: ReactNode }) => {
  const address = useFormAddress()
  if (!address) return children
  return (
    <ApiProvider baseUrl={baseUrl} client={client}>
      <ProjectUiContext.Provider value={ui ?? {}}>
        <PublicFormPage key={address.name} name={address.name} />
      </ProjectUiContext.Provider>
    </ApiProvider>
  )
}

/**
 * The admin: a public form at `/-/forms/<name>` for anyone, the sign-in route first, `/-/sign-in`, or browsing as a
 * visitor when the project's anonymous role reads, then a sidebar from `/meta`, `/:page` composed pages, `/:resource`
 * lists and `/:resource/:key` records. Fills its parent, in the theme this browser chose, light, dark or the system's.
 */
export const App = ({ auth, workspace, basePath, initialUrl, pluginLoader, locale, nativeBridge, ...rest }: AppProps) => {
  // Before `/meta` names the app's language, and when it names none, the screens are in this one
  setFallbackLocale(locale ?? 'en')
  return (
    <ThemeProvider>
      <AuthProvider session={auth} {...(rest.baseUrl && { origin: new URL(rest.baseUrl, window.location.href).origin })} {...(nativeBridge && { nativeBridge })}>
        <Router basePath={basePath} initialUrl={initialUrl}>
          <PluginSourceProvider {...(pluginLoader && { loader: pluginLoader })}>
            <AuthLocale>
              <PublicFormGate baseUrl={rest.baseUrl} client={rest.client} ui={rest.ui}>
                <AuthGate workspace={workspace}>
                  <Authenticated workspace={workspace} {...rest} />
                </AuthGate>
              </PublicFormGate>
            </AuthLocale>
          </PluginSourceProvider>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  )
}
