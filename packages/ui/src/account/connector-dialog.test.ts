import { describe, expect, it } from 'vitest'
import { connectorDialogUrl } from './connector-dialog'

describe('connectorDialogUrl', () => {
  it("fills in the app's name and the endpoint, percent-encoded", () => {
    const dialog = new URL(connectorDialogUrl('https://shop.example/tools/mcp?x=1&y=2', 'Shop & Co'))
    expect(dialog.origin + dialog.pathname).toBe('https://claude.ai/customize/connectors')
    expect(Object.fromEntries(dialog.searchParams)).toEqual({ modal: 'add-custom-connector', connectorName: 'Shop & Co', connectorUrl: 'https://shop.example/tools/mcp?x=1&y=2' })
    expect(dialog.search).not.toContain('&y=2')
  })

  it('leaves the name out for an app without one', () => {
    expect(new URL(connectorDialogUrl('https://shop.example/api/mcp')).searchParams.has('connectorName')).toBe(false)
  })
})
