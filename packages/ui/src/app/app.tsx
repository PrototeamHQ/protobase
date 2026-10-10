import { useEffect, useState } from 'react'
import type { AssistantClient, AuthSession, Client } from '@protobase/client'
import { AppShell, type SidebarMode } from '../app-shell'
import { ApiProvider } from '../data/api-provider'
import { AuthGate, AuthProvider, userToShell, useAuth } from '../auth'
import { useRecord } from '../data/use-record'
import { recordTitle } from '../live/model-helpers'
import { humanize } from '../live/naming'
import { ToastProvider } from '../toasts'
import { AssistantButton, AssistantPanel } from './assistant-shell'
import { breadcrumbFor } from './breadcrumb-for'
import { CreatePage } from './create/create-page'
import { ListPage } from './list-page'
import { MetaGate, Notice, useAdminMeta } from './meta-gate'
import { navFromMeta } from './nav-from-meta'
import { ComposedPage } from './pages/composed-page'
import { ProjectUiProvider, useProjectUi, type ProjectUi } from './pages/project-ui'
import { RecordPage } from './record-page'
import { useGlobalSearch } from './search/use-global-search'
import { Router, matchRoute, useRouter } from './router'
import { useNavRecent } from './use-nav-recent'
import { userMenuFromMeta } from './user-menu-from-meta'

export type AppProps = {
  /** Where `/api/v1` lives. Defaults to the current origin. */
  baseUrl?: string
  /** A ready-made client, for tests. */
  client?: Client
  /** Sign-in state for the app; made from the page's origin when omitted. */
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
}

const Routes = ({ workspace, sidebarMode, assistant }: Pick<AppProps, 'workspace' | 'sidebarMode' | 'assistant'>) => {
  const meta = useAdminMeta()
  const { state, signOut } = useAuth()
  if (state.kind !== 'signed-in') throw new Error('The shell is only rendered for a signed-in user')
  const { user } = state
  const { path, params, basePath, navigate } = useRouter()
  const route = matchRoute(path)
  const search = useGlobalSearch()
  const recent = useNavRecent(meta, basePath, route)
  const groups = navFromMeta(meta, basePath, recent)
  const first = Object.keys(meta.pages)[0] ?? Object.keys(meta.resources)[0]
  const page = route.resource && !route.key ? meta.pages[route.resource] : undefined

  // Links in the shell carry the base path; the router takes paths below it
  const open = (href: string) => navigate(href.startsWith(basePath) ? href.slice(basePath.length) : href)

  useEffect(() => {
    if (!route.resource && first) navigate(`/${first}`, { replace: true })
  }, [route.resource, first, navigate])

  const view = route.resource ? meta.views[route.resource] : undefined
  const group = groups.find((entry) => entry.items.some((item) => item.id === route.resource))
  const model = route.resource ? meta.resources[route.resource] : undefined
  const record = useRecord(route.resource ?? '', route.key ?? '', Boolean(model && route.key && route.key !== 'new'))
  const title = model && record.data ? recordTitle(model, view, record.data.record, route.key ?? '') : route.key
  const { shell } = useProjectUi()
  const Actions = shell?.actions
  const RightPanel = shell?.rightPanel
  // The assistant is there when `/meta` names one, which it does only for the admin and ai roles.
  const [assistantOpen, setAssistantOpen] = useState(false)
  const assistantUrl = meta.assistant?.url
  const assistantButton = assistantUrl && <AssistantButton open={assistantOpen} onToggle={() => setAssistantOpen(!assistantOpen)} />
  const assistantPanel = assistantUrl && assistantOpen && <AssistantPanel url={assistantUrl} client={assistant} page={params.size > 0 ? `${path}?${params}` : path} onClose={() => setAssistantOpen(false)} />
  const breadcrumb = breadcrumbFor({ basePath, route, group: group?.label, page, resourceLabel: view?.names?.plural ?? (route.resource && humanize(route.resource)), recordTitle: title })

  return (
    <AppShell
      sidebarMode={sidebarMode ?? 'text-small'}
      activeItem={route.resource ?? ''}
      breadcrumb={breadcrumb}
      user={userToShell(user)}
      onSignOut={() => void signOut()}
      workspace={workspace}
      navGroups={groups}
      userMenu={userMenuFromMeta(meta, basePath, route.resource)}
      onNavigate={open}
      search={search.available ? { placeholder: search.placeholder, text: search.text, onTextChange: search.setText, query: search.query, loading: search.loading, groups: search.groups, onSelect: open } : undefined}
      actions={(Actions || assistantButton) && <>{Actions && <Actions />}{assistantButton}</>}
      rightPanel={(RightPanel || assistantPanel) && <>{RightPanel && <RightPanel />}{assistantPanel}</>}
    >
      {!route.resource ? <Notice title="Choose a resource">Pick one from the sidebar.</Notice> : page ? <ComposedPage key={page.name} name={page.name} /> : route.key === 'new' ? <CreatePage key={`${route.resource}/new`} resource={route.resource} /> : route.key ? <RecordPage key={`${route.resource}/${route.key}`} resource={route.resource} recordKey={route.key} /> : <ListPage key={route.resource} resource={route.resource} />}
    </AppShell>
  )
}

const Authenticated = ({ baseUrl, client, basePath, initialUrl, workspace, sidebarMode, ui, assistant }: Omit<AppProps, 'auth'>) => {
  const { session, markSignedOut } = useAuth()
  return (
    <ApiProvider baseUrl={baseUrl} client={client} token={session.token} onUnauthenticated={markSignedOut}>
      <Router basePath={basePath} initialUrl={initialUrl}>
        <MetaGate>
          <ToastProvider>
            <ProjectUiProvider ui={ui}>
              <Routes workspace={workspace} sidebarMode={sidebarMode} assistant={assistant} />
            </ProjectUiProvider>
          </ToastProvider>
        </MetaGate>
      </Router>
    </ApiProvider>
  )
}

/** The admin: sign-in first, then a sidebar from `/meta`, `/:page` composed pages, `/:resource` lists and `/:resource/:key` records. Fills its parent. */
export const App = ({ auth, workspace, ...rest }: AppProps) => (
  <AuthProvider session={auth}>
    <AuthGate workspace={workspace}>
      <Authenticated workspace={workspace} {...rest} />
    </AuthGate>
  </AuthProvider>
)
