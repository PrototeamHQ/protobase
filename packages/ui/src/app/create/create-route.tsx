import { humanize } from '../../live/naming'
import { Notice, useAdminMeta } from '../meta-gate'
import { ComposedPage } from '../pages/composed-page'
import { CreatePage } from './create-page'
import { text } from './messages'

type CreateRouteProps = { resource: string; values?: Readonly<Record<string, string>> }

/**
 * `/:resource/new`: the view's create page when it names one, which reads the address's `values` itself and may change
 * them in place, else the create form, started again when the address's `values` change.
 */
export const CreateRoute = ({ resource, values }: CreateRouteProps) => {
  const meta = useAdminMeta()
  const view = meta.views[resource]
  if (!view?.create) return <CreatePage key={new URLSearchParams(values).toString()} resource={resource} values={values} />
  if (!meta.pages[view.create.page]) return <Notice title={text('notAllowed')}>{text('cannotCreate', { plural: view.names?.plural.toLowerCase() ?? humanize(resource) })}</Notice>
  return <ComposedPage name={view.create.page} />
}
