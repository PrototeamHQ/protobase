import { Logo, type ShellLogoProps } from '../app-shell'
import { CustomBoundary } from './pages/custom-boundary'
import { useProjectUi } from './pages/project-ui'

/** The project's `shell.logo` at the top of the sidebar, or Protobase's while it has none or when it throws. */
export const ProjectLogo = (props: ShellLogoProps) => {
  const Own = useProjectUi().shell?.logo
  if (!Own) return <Logo {...props} />
  return (
    <CustomBoundary name="shell.logo" fallback={<Logo {...props} />}>
      <Own {...props} />
    </CustomBoundary>
  )
}
