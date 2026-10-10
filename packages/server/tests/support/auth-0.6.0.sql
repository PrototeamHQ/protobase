-- The auth schema of Protobase 0.6.0, as the examples' `db/migrations/*_auth.sql` created it: Better Auth's camelCase names.

create schema if not exists "auth";

create table if not exists "auth"."user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null, "role" text, "banned" boolean, "banReason" text, "banExpires" timestamptz, "twoFactorEnabled" boolean);

create table if not exists "auth"."session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "auth"."user" ("id") on delete cascade, "impersonatedBy" text);

create table if not exists "auth"."account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "auth"."user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);

create table if not exists "auth"."verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table if not exists "auth"."jwks" ("id" text not null primary key, "publicKey" text not null, "privateKey" text not null, "createdAt" timestamptz not null, "expiresAt" timestamptz, "alg" text, "crv" text);

create table if not exists "auth"."twoFactor" ("id" text not null primary key, "secret" text not null, "backupCodes" text not null, "userId" text not null references "auth"."user" ("id") on delete cascade, "verified" boolean, "failedVerificationCount" integer, "lockedUntil" timestamptz);

create table if not exists "auth"."passkey" ("id" text not null primary key, "name" text, "publicKey" text not null, "userId" text not null references "auth"."user" ("id") on delete cascade, "credentialID" text not null, "counter" integer not null, "deviceType" text not null, "backedUp" boolean not null, "transports" text, "createdAt" timestamptz, "aaguid" text);

create table if not exists "auth"."signInPolicy" ("id" text not null primary key, "password" text not null, "emailCode" text not null, "passkey" text not null, "twoFactor" text not null, "staffAccess" text not null, "platformSignIn" text not null, "createdAt" timestamptz not null, "createdBy" text);

create table if not exists "auth"."staffSignIn" ("id" text not null primary key, "userId" text not null, "userEmail" text not null, "staff" text not null, "staffName" text, "staffSubject" text not null, "issuer" text not null, "reason" text not null, "sessionId" text not null, "startedAt" timestamptz not null, "expiresAt" timestamptz not null, "endedAt" timestamptz);

create index if not exists "session_userId_idx" on "auth"."session" ("userId");

create index if not exists "account_userId_idx" on "auth"."account" ("userId");

create index if not exists "verification_identifier_idx" on "auth"."verification" ("identifier");

create index if not exists "twoFactor_secret_idx" on "auth"."twoFactor" ("secret");

create index if not exists "twoFactor_userId_idx" on "auth"."twoFactor" ("userId");

create index if not exists "passkey_userId_idx" on "auth"."passkey" ("userId");

create index if not exists "passkey_credentialID_idx" on "auth"."passkey" ("credentialID");
