import { afterEach, describe, expect, it } from 'vitest'
import { setFallbackLocale } from '../locale/active-locale'
import { wordedText } from './organization-word'

afterEach(() => setFallbackLocale('en'))

describe('wordedText', () => {
  it('says organization when the app sets no word', () => {
    const text = wordedText()
    expect(text('createTitle')).toBe('Create your organization')
    expect(text('manageOrganizations')).toBe('Manage organizations')
  })

  it("puts the app's word in, lower case inside a sentence", () => {
    const text = wordedText({ singular: 'Workspace', plural: 'Workspaces' })
    expect(text('createTitle')).toBe('Create your workspace')
    expect(text('organizationName')).toBe('Workspace name')
    expect(text('organizations')).toBe('Workspaces')
    expect(text('join', { name: 'Acme' })).toBe('Join Acme')
  })

  it('writes the Dutch texts around the word', () => {
    setFallbackLocale('nl')
    const text = wordedText({ singular: 'Werkruimte', plural: 'Werkruimtes' })
    expect(text('createTitle')).toBe('Maak je werkruimte aan')
    expect(text('createButton')).toBe('Werkruimte aanmaken')
    expect(wordedText()('organizationName')).toBe('Organisatienaam')
  })
})
