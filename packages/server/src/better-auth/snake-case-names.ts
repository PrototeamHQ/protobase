// The database names of Better Auth's tables and columns: snake_case, like the app's own schemas. The code and the API
// keep Better Auth's camelCase names; only the store's tables and columns are named here. A name missing from these
// maps keeps Better Auth's, which is lowercase already (`user`, `token`, `scope`, ...).

/** Better Auth's own tables, as its `session`, `account` and `verification` options name them; the user table's are in `user-table.ts`. */
export const coreNames = {
  session: {
    fields: { expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at', ipAddress: 'ip_address', userAgent: 'user_agent', userId: 'user_id' },
  },
  account: {
    fields: {
      accountId: 'account_id',
      providerId: 'provider_id',
      userId: 'user_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      idToken: 'id_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  verification: { fields: { expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at' } },
}

/** The `schema` option of each plugin with tables or columns of its own. */
export const pluginNames = {
  admin: { user: { fields: { banReason: 'ban_reason', banExpires: 'ban_expires' } }, session: { fields: { impersonatedBy: 'impersonated_by' } } },
  jwt: { jwks: { fields: { publicKey: 'public_key', privateKey: 'private_key', createdAt: 'created_at', expiresAt: 'expires_at' } } },
  twoFactor: {
    user: { fields: { twoFactorEnabled: 'two_factor_enabled' } },
    twoFactor: {
      modelName: 'two_factor',
      fields: { backupCodes: 'backup_codes', userId: 'user_id', failedVerificationCount: 'failed_verification_count', lockedUntil: 'locked_until' },
    },
  },
  passkey: {
    passkey: { fields: { publicKey: 'public_key', userId: 'user_id', credentialID: 'credential_id', deviceType: 'device_type', backedUp: 'backed_up', createdAt: 'created_at' } },
  },
  // The OAuth provider MCP clients sign in through (`mcpAuthPlugins`); the CIMD plugin adds no tables.
  mcp: {
    oauthClient: {
      modelName: 'oauth_client',
      fields: {
        clientId: 'client_id',
        clientSecret: 'client_secret',
        clientDiscoveryId: 'client_discovery_id',
        skipConsent: 'skip_consent',
        enableEndSession: 'enable_end_session',
        subjectType: 'subject_type',
        clientCredentialsScopes: 'client_credentials_scopes',
        userId: 'user_id',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        softwareId: 'software_id',
        softwareVersion: 'software_version',
        softwareStatement: 'software_statement',
        redirectUris: 'redirect_uris',
        postLogoutRedirectUris: 'post_logout_redirect_uris',
        backchannelLogoutUri: 'backchannel_logout_uri',
        backchannelLogoutSessionRequired: 'backchannel_logout_session_required',
        tokenEndpointAuthMethod: 'token_endpoint_auth_method',
        applicationType: 'application_type',
        jwksUri: 'jwks_uri',
        grantTypes: 'grant_types',
        responseTypes: 'response_types',
        requirePKCE: 'require_pkce',
        dpopBoundAccessTokens: 'dpop_bound_access_tokens',
        referenceId: 'reference_id',
      },
    },
    oauthResource: {
      modelName: 'oauth_resource',
      fields: {
        accessTokenTtl: 'access_token_ttl',
        refreshTokenTtl: 'refresh_token_ttl',
        signingAlgorithm: 'signing_algorithm',
        signingKeyId: 'signing_key_id',
        allowedScopes: 'allowed_scopes',
        customClaims: 'custom_claims',
        dpopBoundAccessTokensRequired: 'dpop_bound_access_tokens_required',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        policyVersion: 'policy_version',
      },
    },
    oauthClientResource: { modelName: 'oauth_client_resource', fields: { clientId: 'client_id', resourceId: 'resource_id', createdAt: 'created_at' } },
    oauthRefreshToken: {
      modelName: 'oauth_refresh_token',
      fields: {
        clientId: 'client_id',
        sessionId: 'session_id',
        userId: 'user_id',
        referenceId: 'reference_id',
        authorizationCodeId: 'authorization_code_id',
        requestedUserInfoClaims: 'requested_user_info_claims',
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        rotatedAt: 'rotated_at',
        rotationReplayResponse: 'rotation_replay_response',
        rotationReplayExpiresAt: 'rotation_replay_expires_at',
        authTime: 'auth_time',
      },
    },
    oauthAccessToken: {
      modelName: 'oauth_access_token',
      fields: {
        clientId: 'client_id',
        sessionId: 'session_id',
        userId: 'user_id',
        referenceId: 'reference_id',
        authorizationCodeId: 'authorization_code_id',
        requestedUserInfoClaims: 'requested_user_info_claims',
        refreshId: 'refresh_id',
        expiresAt: 'expires_at',
        createdAt: 'created_at',
      },
    },
    oauthConsent: {
      modelName: 'oauth_consent',
      fields: { clientId: 'client_id', userId: 'user_id', referenceId: 'reference_id', requestedUserInfoClaims: 'requested_user_info_claims', createdAt: 'created_at', updatedAt: 'updated_at' },
    },
    oauthClientAssertion: { modelName: 'oauth_client_assertion', fields: { expiresAt: 'expires_at' } },
  },
}
