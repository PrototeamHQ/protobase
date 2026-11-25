import { everyOrganization } from '@protobase/query'
import { describe, expect, it } from 'vitest'
import { checkPinnedUser, pinLine, resolveOptionalPin, resolvePin, scopeOf } from './pin'
import { pinSourceFixture } from './pin-source-fixture'

const wide = () => everyOrganization('the test reaches every organization')

describe('resolvePin', () => {
  it("pins the config's default organization", async () => {
    const pin = await resolvePin(pinSourceFixture(), {}, 'users list', wide)
    expect(pin).toEqual({ organization: { id: '1', slug: 'acme', name: 'Acme' } })
    expect([scopeOf(pin), pinLine(pin)]).toEqual(['1', 'Organization: acme (Acme)\n'])
  })

  it('pins the organization --organization names, by slug or id', async () => {
    expect(await resolvePin(pinSourceFixture(), { organization: 'globex' }, 'users list', wide)).toEqual({ organization: { id: '2', slug: 'globex', name: 'Globex' } })
    expect(await resolvePin(pinSourceFixture(), { organization: '2' }, 'users list', wide)).toEqual({ organization: { id: '2', slug: 'globex', name: 'Globex' } })
  })

  it('reaches every organization with --all-organizations, through the reviewed way out', async () => {
    const pin = await resolvePin(pinSourceFixture(), { allOrganizations: true }, 'users list', wide)
    expect([scopeOf(pin), pinLine(pin)]).toEqual([{ unscoped: 'the test reaches every organization' }, 'Every organization\n'])
  })

  it('refuses an organization that does not exist, naming it', async () => {
    await expect(resolvePin(pinSourceFixture(), { organization: 'initech' }, 'users list', wide)).rejects.toThrow('No organization "initech"')
    const gone = pinSourceFixture({ defaultOrganization: { id: '9', slug: 'gone', name: 'Gone' } })
    await expect(resolvePin(gone, {}, 'users list', wide)).rejects.toThrow(`The config's auth.organizations.default names organization "gone" (9), which the database does not have`)
  })

  it('refuses without a pin, both flags at once, and --all-organizations on a command without a way out', async () => {
    await expect(resolvePin(pinSourceFixture({ defaultOrganization: undefined }), {}, 'users list', wide)).rejects.toThrow('No organization is pinned')
    await expect(resolvePin(pinSourceFixture(), { organization: 'acme', allOrganizations: true }, 'users list', wide)).rejects.toThrow('not both')
    await expect(resolvePin(pinSourceFixture(), { allOrganizations: true }, 'organizations add-member')).rejects.toThrow('acts on one organization')
  })

  it('pins nothing while organizations are off, refusing the flags', async () => {
    const off = pinSourceFixture({ organizationsOn: false })
    expect(await resolveOptionalPin(off, {}, 'users list', wide)).toBeUndefined()
    await expect(resolveOptionalPin(off, { allOrganizations: true }, 'users list', wide)).rejects.toThrow('need organizations')
    await expect(resolvePin(off, {}, 'organizations list', wide)).rejects.toThrow('protobase organizations list needs organizations')
  })
})

describe('checkPinnedUser', () => {
  it('reaches a member of the pinned organization, anyone across every one, and refuses someone else', async () => {
    const source = pinSourceFixture()
    await checkPinnedUser(source, { organization: { id: '1', slug: 'acme', name: 'Acme' } }, 'bo@example.com')
    await checkPinnedUser(source, { every: wide() }, 'kim@example.com')
    await expect(checkPinnedUser(source, { organization: { id: '1', slug: 'acme', name: 'Acme' } }, 'kim@example.com')).rejects.toThrow('kim@example.com is not a member of acme')
  })
})
