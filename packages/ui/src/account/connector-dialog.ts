/**
 * The address of Claude's dialog that adds a custom connector, filled in with the MCP endpoint's `url` and, when the
 * app has one, its name; the person sees both there and confirms.
 */
export const connectorDialogUrl = (url: string, appName?: string) => {
  const dialog = new URL('https://claude.ai/customize/connectors')
  dialog.searchParams.set('modal', 'add-custom-connector')
  if (appName) dialog.searchParams.set('connectorName', appName)
  dialog.searchParams.set('connectorUrl', url)
  return dialog.href
}
