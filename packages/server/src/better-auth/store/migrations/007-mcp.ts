import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/** The OAuth provider MCP clients sign in through: its clients, resources, tokens and consents. */
export const mcp: StoreMigration = {
  version: 7,
  name: 'mcp',
  title: 'The clients, resources, tokens and consents of the OAuth provider for MCP',
  tables: ['oauth_client', 'oauth_resource', 'oauth_client_resource', 'oauth_refresh_token', 'oauth_access_token', 'oauth_consent', 'oauth_client_assertion'],
  statements: ({ table, user, id, idRef }) => {
    const client = table('oauth_client')
    const c = client.columns
    const resource = table('oauth_resource')
    const r = resource.columns
    const clientResource = table('oauth_client_resource')
    const cr = clientResource.columns
    const refresh = table('oauth_refresh_token')
    const rt = refresh.columns
    const access = table('oauth_access_token')
    const at = access.columns
    const consent = table('oauth_consent')
    const co = consent.columns
    const assertion = table('oauth_client_assertion')
    const session = table('session')
    return [
      ddl`create table ${client} (
  id ${id} primary key,
  ${c.client_id} text not null unique,
  ${c.client_secret} text,
  ${c.client_discovery_id} text,
  ${c.disabled} boolean,
  ${c.skip_consent} boolean,
  ${c.enable_end_session} boolean,
  ${c.subject_type} text,
  ${c.scopes} jsonb,
  ${c.client_credentials_scopes} jsonb,
  ${c.user_id} ${idRef} references ${user} (id) on delete cascade,
  ${c.created_at} timestamptz,
  ${c.updated_at} timestamptz,
  ${c.name} text,
  ${c.uri} text,
  ${c.icon} text,
  ${c.contacts} jsonb,
  ${c.tos} text,
  ${c.policy} text,
  ${c.software_id} text,
  ${c.software_version} text,
  ${c.software_statement} text,
  ${c.redirect_uris} jsonb not null,
  ${c.post_logout_redirect_uris} jsonb,
  ${c.backchannel_logout_uri} text,
  ${c.backchannel_logout_session_required} boolean,
  ${c.token_endpoint_auth_method} text,
  ${c.application_type} text,
  ${c.jwks} text,
  ${c.jwks_uri} text,
  ${c.grant_types} jsonb,
  ${c.response_types} jsonb,
  ${c.require_pkce} boolean,
  ${c.dpop_bound_access_tokens} boolean,
  ${c.reference_id} text,
  ${c.metadata} jsonb
)`,
      ddl`create index ${client.index('oauth_client_user_id_idx')} on ${client} (${c.user_id})`,
      ddl`create table ${resource} (
  id ${id} primary key,
  ${r.identifier} text not null unique,
  ${r.name} text not null,
  ${r.access_token_ttl} integer,
  ${r.refresh_token_ttl} integer,
  ${r.signing_algorithm} text,
  ${r.signing_key_id} text,
  ${r.allowed_scopes} jsonb,
  ${r.custom_claims} jsonb,
  ${r.dpop_bound_access_tokens_required} boolean,
  ${r.disabled} boolean,
  ${r.created_at} timestamptz,
  ${r.updated_at} timestamptz,
  ${r.policy_version} integer,
  ${r.metadata} jsonb
)`,
      ddl`create table ${clientResource} (
  id ${id} primary key,
  ${cr.client_id} text not null references ${client} (${c.client_id}) on delete cascade,
  ${cr.resource_id} text not null references ${resource} (${r.identifier}) on delete cascade,
  ${cr.metadata} jsonb,
  ${cr.created_at} timestamptz
)`,
      ddl`create index ${clientResource.index('oauth_client_resource_client_id_idx')} on ${clientResource} (${cr.client_id})`,
      ddl`create index ${clientResource.index('oauth_client_resource_resource_id_idx')} on ${clientResource} (${cr.resource_id})`,
      ddl`create unique index ${clientResource.index('oauth_client_resource_client_id_resource_id_uidx')} on ${clientResource} (${cr.client_id}, ${cr.resource_id})`,
      ddl`create table ${refresh} (
  id ${id} primary key,
  ${rt.token} text not null unique,
  ${rt.client_id} text not null references ${client} (${c.client_id}) on delete cascade,
  ${rt.session_id} ${idRef} references ${session} (id) on delete set null,
  ${rt.user_id} ${idRef} not null references ${user} (id) on delete cascade,
  ${rt.reference_id} text,
  ${rt.authorization_code_id} text,
  ${rt.resources} jsonb,
  ${rt.requested_user_info_claims} jsonb,
  ${rt.expires_at} timestamptz not null,
  ${rt.created_at} timestamptz not null,
  ${rt.revoked} timestamptz,
  ${rt.rotated_at} timestamptz,
  ${rt.rotation_replay_response} text,
  ${rt.rotation_replay_expires_at} timestamptz,
  ${rt.auth_time} timestamptz,
  ${rt.confirmation} jsonb,
  ${rt.scopes} jsonb not null
)`,
      ddl`create index ${refresh.index('oauth_refresh_token_client_id_idx')} on ${refresh} (${rt.client_id})`,
      ddl`create index ${refresh.index('oauth_refresh_token_session_id_idx')} on ${refresh} (${rt.session_id})`,
      ddl`create index ${refresh.index('oauth_refresh_token_user_id_idx')} on ${refresh} (${rt.user_id})`,
      ddl`create index ${refresh.index('oauth_refresh_token_authorization_code_id_idx')} on ${refresh} (${rt.authorization_code_id})`,
      ddl`create table ${access} (
  id ${id} primary key,
  ${at.token} text not null unique,
  ${at.client_id} text not null references ${client} (${c.client_id}) on delete cascade,
  ${at.session_id} ${idRef} references ${session} (id) on delete set null,
  ${at.user_id} ${idRef} references ${user} (id) on delete cascade,
  ${at.reference_id} text,
  ${at.authorization_code_id} text,
  ${at.resources} jsonb,
  ${at.requested_user_info_claims} jsonb,
  ${at.refresh_id} ${idRef} references ${refresh} (id) on delete cascade,
  ${at.expires_at} timestamptz not null,
  ${at.created_at} timestamptz not null,
  ${at.revoked} timestamptz,
  ${at.confirmation} jsonb,
  ${at.scopes} jsonb not null
)`,
      ddl`create index ${access.index('oauth_access_token_client_id_idx')} on ${access} (${at.client_id})`,
      ddl`create index ${access.index('oauth_access_token_session_id_idx')} on ${access} (${at.session_id})`,
      ddl`create index ${access.index('oauth_access_token_user_id_idx')} on ${access} (${at.user_id})`,
      ddl`create index ${access.index('oauth_access_token_authorization_code_id_idx')} on ${access} (${at.authorization_code_id})`,
      ddl`create index ${access.index('oauth_access_token_refresh_id_idx')} on ${access} (${at.refresh_id})`,
      ddl`create table ${consent} (
  id ${id} primary key,
  ${co.client_id} text not null references ${client} (${c.client_id}) on delete cascade,
  ${co.user_id} ${idRef} references ${user} (id) on delete cascade,
  ${co.reference_id} text,
  ${co.resources} jsonb,
  ${co.requested_user_info_claims} jsonb,
  ${co.scopes} jsonb not null,
  ${co.created_at} timestamptz not null,
  ${co.updated_at} timestamptz not null
)`,
      ddl`create index ${consent.index('oauth_consent_client_id_idx')} on ${consent} (${co.client_id})`,
      ddl`create index ${consent.index('oauth_consent_user_id_idx')} on ${consent} (${co.user_id})`,
      ddl`create table ${assertion} (
  id ${id} primary key,
  ${assertion.columns.expires_at} timestamptz not null
)`,
    ]
  },
}
