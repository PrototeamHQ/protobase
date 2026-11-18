import { field, type ColumnDeclaration, type ModuleDeclaration } from '../declaration'

// Each column holds the field of its own name in camelCase.
const fields = <Column extends string>(...columns: Column[]) =>
  Object.fromEntries(columns.map((column) => [column, field(column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()))])) as Record<Column, ColumnDeclaration>

/** The OAuth provider MCP clients and the OpenID provider's clients sign in through: its clients, resources, tokens and consents. */
export const mcp = {
  id: 'mcp',
  requires: ['auth'],
  tables: {
    oauth_client: {
      model: 'oauthClient',
      scope: 'global',
      columns: {
        ...fields('client_id', 'client_secret', 'client_discovery_id', 'disabled', 'skip_consent', 'enable_end_session', 'subject_type', 'scopes', 'client_credentials_scopes', 'user_id', 'created_at', 'updated_at'),
        ...fields('name', 'uri', 'icon', 'contacts', 'tos', 'policy', 'software_id', 'software_version', 'software_statement', 'redirect_uris', 'post_logout_redirect_uris', 'backchannel_logout_uri'),
        ...fields('backchannel_logout_session_required', 'token_endpoint_auth_method', 'application_type', 'jwks', 'jwks_uri', 'grant_types', 'response_types'),
        require_pkce: field('requirePKCE'),
        ...fields('dpop_bound_access_tokens', 'reference_id', 'metadata'),
      },
      indexes: ['oauth_client_user_id_idx'],
    },
    oauth_resource: {
      model: 'oauthResource',
      scope: 'global',
      columns: fields('identifier', 'name', 'access_token_ttl', 'refresh_token_ttl', 'signing_algorithm', 'signing_key_id', 'allowed_scopes', 'custom_claims', 'dpop_bound_access_tokens_required', 'disabled', 'created_at', 'updated_at', 'policy_version', 'metadata'),
    },
    oauth_client_resource: {
      model: 'oauthClientResource',
      scope: 'global',
      columns: fields('client_id', 'resource_id', 'metadata', 'created_at'),
      indexes: ['oauth_client_resource_client_id_idx', 'oauth_client_resource_resource_id_idx', 'oauth_client_resource_client_id_resource_id_uidx'],
    },
    oauth_refresh_token: {
      model: 'oauthRefreshToken',
      scope: 'global',
      columns: fields(
        'token', 'client_id', 'session_id', 'user_id', 'reference_id', 'authorization_code_id', 'resources', 'requested_user_info_claims', 'expires_at', 'created_at', 'revoked',
        'rotated_at', 'rotation_replay_response', 'rotation_replay_expires_at', 'auth_time', 'confirmation', 'scopes',
      ),
      indexes: ['oauth_refresh_token_client_id_idx', 'oauth_refresh_token_session_id_idx', 'oauth_refresh_token_user_id_idx', 'oauth_refresh_token_authorization_code_id_idx'],
    },
    oauth_access_token: {
      model: 'oauthAccessToken',
      scope: 'global',
      columns: fields('token', 'client_id', 'session_id', 'user_id', 'reference_id', 'authorization_code_id', 'resources', 'requested_user_info_claims', 'refresh_id', 'expires_at', 'created_at', 'revoked', 'confirmation', 'scopes'),
      indexes: ['oauth_access_token_client_id_idx', 'oauth_access_token_session_id_idx', 'oauth_access_token_user_id_idx', 'oauth_access_token_authorization_code_id_idx', 'oauth_access_token_refresh_id_idx'],
    },
    oauth_consent: {
      model: 'oauthConsent',
      scope: 'global',
      columns: fields('client_id', 'user_id', 'reference_id', 'resources', 'requested_user_info_claims', 'scopes', 'created_at', 'updated_at'),
      indexes: ['oauth_consent_client_id_idx', 'oauth_consent_user_id_idx'],
    },
    oauth_client_assertion: { model: 'oauthClientAssertion', scope: 'global', columns: fields('expires_at') },
  },
} as const satisfies ModuleDeclaration
