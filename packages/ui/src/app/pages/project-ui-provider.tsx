import { useMemo, type ReactNode } from 'react'
import { mergeUi } from './merge-ui'
import { ProjectUiContext, type ProjectUi } from './project-ui'

/** Provides `ui` merged with the UI configs it extends. */
export const ProjectUiProvider = ({ ui, children }: { ui: ProjectUi | undefined; children: ReactNode }) => {
  const merged = useMemo(() => (ui ? mergeUi(ui) : {}), [ui])
  return <ProjectUiContext.Provider value={merged}>{children}</ProjectUiContext.Provider>
}
