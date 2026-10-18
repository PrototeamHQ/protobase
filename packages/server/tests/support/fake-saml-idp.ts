import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
// The SSO plugin sets samlify's XML schema validator when it is imported, which parsing a message needs.
import '@better-auth/sso'
import * as saml from 'samlify'

// A key and self-signed certificate for this test IdP only, made with
// `openssl req -x509 -newkey rsa:2048 -nodes -days 36500 -subj '/CN=protobase-test-idp'`.
const privateKey = readFileSync(new URL('./saml-idp.key', import.meta.url), 'utf8')
export const idpCertificate = readFileSync(new URL('./saml-idp.crt', import.meta.url), 'utf8')

const redirectBinding = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect'
const emailFormat = 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const attributeStatement = (attributes: Record<string, string>) =>
  `<saml:AttributeStatement>${Object.entries(attributes)
    .map(
      ([name, value]) =>
        `<saml:Attribute Name="${escape(name)}" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic"><saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">${escape(value)}</saml:AttributeValue></saml:Attribute>`,
    )
    .join('')}</saml:AttributeStatement>`

/** The person as the IdP vouches for them: the NameID (default the address) and the attributes it sends. */
export type SamlPerson = { email: string; nameId?: string; attributes?: Record<string, string> }

/**
 * A SAML 2.0 identity provider for tests, made with samlify: its metadata, and `approve`, which stands for the person
 * signing in at the IdP. It reads the AuthnRequest from the redirect the app sent the browser to, and answers with a
 * signed response to it, as the form the browser posts to the app's ACS.
 */
export const fakeSamlIdp = ({ entityId = 'https://idp.acme.test', ssoUrl = 'https://idp.acme.test/sso' } = {}) => {
  const idp = saml.IdentityProvider({ entityID: entityId, privateKey, signingCert: idpCertificate, singleSignOnService: [{ Binding: redirectBinding, Location: ssoUrl }], singleLogoutService: [{ Binding: redirectBinding, Location: `${ssoUrl}/logout` }], nameIDFormat: [emailFormat] })

  const approve = async (spMetadata: string, redirectURL: string, person: SamlPerson) => {
    const sp = saml.ServiceProvider({ metadata: spMetadata })
    const query = Object.fromEntries(new URL(redirectURL).searchParams)
    const { extract } = await idp.parseLoginRequest(sp, 'redirect', { query })
    const requestId = extract.request?.id as string
    const acs = sp.entityMeta.getAssertionConsumerService('post') as string
    const now = new Date()
    const later = new Date(now.getTime() + 5 * 60_000).toISOString()
    const id = `_${randomUUID()}`
    const values = {
      ID: id,
      AssertionID: `_${randomUUID()}`,
      Destination: acs,
      Audience: sp.entityMeta.getEntityID(),
      SubjectRecipient: acs,
      Issuer: entityId,
      IssueInstant: now.toISOString(),
      StatusCode: 'urn:oasis:names:tc:SAML:2.0:status:Success',
      ConditionsNotBefore: now.toISOString(),
      ConditionsNotOnOrAfter: later,
      SubjectConfirmationDataNotOnOrAfter: later,
      NameIDFormat: emailFormat,
      NameID: person.nameId ?? person.email,
      InResponseTo: requestId,
      AuthnStatement: '',
    }
    const response = await idp.createLoginResponse(sp, { extract: { request: { id: requestId } } }, 'post', { email: person.email }, {
      customTagReplacement: (template) => ({ id, context: saml.SamlLib.replaceTagsByValue(template.replace('{AttributeStatement}', attributeStatement({ email: person.email, ...person.attributes })), values) }),
    })
    return { SAMLResponse: response.context, RelayState: query.RelayState ?? '' }
  }

  return { entityId, ssoUrl, certificate: idpCertificate, metadata: idp.getMetadata(), approve }
}
