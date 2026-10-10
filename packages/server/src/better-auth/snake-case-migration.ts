const schemaName = /^[a-z_][a-z0-9_]*$/

/**
 * The migration that renames the auth store of Protobase 0.6 in place, from Better Auth's camelCase names to the
 * snake_case ones of `snake-case-names.ts`: tables, columns, and the indexes and constraints named after them. Data,
 * defaults, keys and indexes stay as they are. On a store that has the snake_case names already it does nothing, so a
 * project's migrations can carry it after an auth migration written with them. `schema` is the store's schema, the
 * connection's current one when left out.
 */
export const snakeCaseMigration = (schema?: string) => {
  if (schema !== undefined && !schemaName.test(schema)) throw new Error(`Invalid auth schema name "${schema}"`)
  const s = schema === undefined ? '' : `"${schema}".`
  const current = schema === undefined ? 'current_schema()' : `'${schema}'`
  return `-- Renames the auth store of Protobase 0.6 to snake_case. A store set up with the snake_case names has no "emailVerified"
-- and is left as it is.
do $$
declare
  constraint_row record;
begin
  if not exists (select from information_schema.columns where table_schema = ${current} and table_name = 'user' and column_name = 'emailVerified') then
    return;
  end if;

  alter table ${s}"twoFactor" rename to two_factor;
  alter table ${s}"signInPolicy" rename to sign_in_policy;
  alter table ${s}"staffSignIn" rename to staff_sign_in;

  alter table ${s}"user" rename column "emailVerified" to email_verified;
  alter table ${s}"user" rename column "createdAt" to created_at;
  alter table ${s}"user" rename column "updatedAt" to updated_at;
  alter table ${s}"user" rename column "banReason" to ban_reason;
  alter table ${s}"user" rename column "banExpires" to ban_expires;
  alter table ${s}"user" rename column "twoFactorEnabled" to two_factor_enabled;

  alter table ${s}session rename column "expiresAt" to expires_at;
  alter table ${s}session rename column "createdAt" to created_at;
  alter table ${s}session rename column "updatedAt" to updated_at;
  alter table ${s}session rename column "ipAddress" to ip_address;
  alter table ${s}session rename column "userAgent" to user_agent;
  alter table ${s}session rename column "userId" to user_id;
  alter table ${s}session rename column "impersonatedBy" to impersonated_by;

  alter table ${s}account rename column "accountId" to account_id;
  alter table ${s}account rename column "providerId" to provider_id;
  alter table ${s}account rename column "userId" to user_id;
  alter table ${s}account rename column "accessToken" to access_token;
  alter table ${s}account rename column "refreshToken" to refresh_token;
  alter table ${s}account rename column "idToken" to id_token;
  alter table ${s}account rename column "accessTokenExpiresAt" to access_token_expires_at;
  alter table ${s}account rename column "refreshTokenExpiresAt" to refresh_token_expires_at;
  alter table ${s}account rename column "createdAt" to created_at;
  alter table ${s}account rename column "updatedAt" to updated_at;

  alter table ${s}verification rename column "expiresAt" to expires_at;
  alter table ${s}verification rename column "createdAt" to created_at;
  alter table ${s}verification rename column "updatedAt" to updated_at;

  alter table ${s}jwks rename column "publicKey" to public_key;
  alter table ${s}jwks rename column "privateKey" to private_key;
  alter table ${s}jwks rename column "createdAt" to created_at;
  alter table ${s}jwks rename column "expiresAt" to expires_at;

  alter table ${s}two_factor rename column "backupCodes" to backup_codes;
  alter table ${s}two_factor rename column "userId" to user_id;
  alter table ${s}two_factor rename column "failedVerificationCount" to failed_verification_count;
  alter table ${s}two_factor rename column "lockedUntil" to locked_until;

  alter table ${s}passkey rename column "publicKey" to public_key;
  alter table ${s}passkey rename column "userId" to user_id;
  alter table ${s}passkey rename column "credentialID" to credential_id;
  alter table ${s}passkey rename column "deviceType" to device_type;
  alter table ${s}passkey rename column "backedUp" to backed_up;
  alter table ${s}passkey rename column "createdAt" to created_at;

  alter table ${s}sign_in_policy rename column "emailCode" to email_code;
  alter table ${s}sign_in_policy rename column "twoFactor" to two_factor;
  alter table ${s}sign_in_policy rename column "staffAccess" to staff_access;
  alter table ${s}sign_in_policy rename column "platformSignIn" to platform_sign_in;
  alter table ${s}sign_in_policy rename column "createdAt" to created_at;
  alter table ${s}sign_in_policy rename column "createdBy" to created_by;

  alter table ${s}staff_sign_in rename column "userId" to user_id;
  alter table ${s}staff_sign_in rename column "userEmail" to user_email;
  alter table ${s}staff_sign_in rename column "staffName" to staff_name;
  alter table ${s}staff_sign_in rename column "staffSubject" to staff_subject;
  alter table ${s}staff_sign_in rename column "sessionId" to session_id;
  alter table ${s}staff_sign_in rename column "startedAt" to started_at;
  alter table ${s}staff_sign_in rename column "expiresAt" to expires_at;
  alter table ${s}staff_sign_in rename column "endedAt" to ended_at;

  -- A primary key's index takes the new name with it.
  alter table ${s}two_factor rename constraint "twoFactor_pkey" to two_factor_pkey;
  alter table ${s}sign_in_policy rename constraint "signInPolicy_pkey" to sign_in_policy_pkey;
  alter table ${s}staff_sign_in rename constraint "staffSignIn_pkey" to staff_sign_in_pkey;
  alter table ${s}session rename constraint "session_userId_fkey" to session_user_id_fkey;
  alter table ${s}account rename constraint "account_userId_fkey" to account_user_id_fkey;
  alter table ${s}two_factor rename constraint "twoFactor_userId_fkey" to two_factor_user_id_fkey;
  alter table ${s}passkey rename constraint "passkey_userId_fkey" to passkey_user_id_fkey;

  alter index ${s}"session_userId_idx" rename to session_user_id_idx;
  alter index ${s}"account_userId_idx" rename to account_user_id_idx;
  alter index ${s}"twoFactor_secret_idx" rename to two_factor_secret_idx;
  alter index ${s}"twoFactor_userId_idx" rename to two_factor_user_id_idx;
  alter index ${s}"passkey_userId_idx" rename to passkey_user_id_idx;
  alter index ${s}"passkey_credentialID_idx" rename to passkey_credential_id_idx;

  -- Postgres 18 names each not-null constraint after its table and column, as "user_emailVerified_not_null"; earlier
  -- versions keep no such constraints, so there is nothing to rename there.
  for constraint_row in
    select c.conrelid::regclass as table_name, c.conname as old_name, t.relname || '_' || a.attname || '_not_null' as new_name
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'n' and t.relnamespace = (select oid from pg_namespace where nspname = ${current}) and c.conname ~ '[A-Z]'
  loop
    execute format('alter table %s rename constraint %I to %I', constraint_row.table_name, constraint_row.old_name, constraint_row.new_name);
  end loop;
end
$$;`
}
