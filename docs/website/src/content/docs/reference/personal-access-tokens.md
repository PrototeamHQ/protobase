---
title: Personal access tokens
description: Long-lived tokens people make on their account page, so a script calls the app's API as them.
---

A personal access token lets a script or another app call the app's API as the person who made it, without a password and without signing in again on every run, such as a weekly job that drafts invoices. The person makes it on their [account page](/reference/auth/#account-page), copies it into the script once, sees when it was last used, and revokes it at any time.

## Turning them on

They are off by default. `auth.personalAccessTokens` turns them on, with the prefix every token of the app starts with:

```ts
// protobase.config.ts
export default defineConfig({
  auth: { personalAccessTokens: { prefix: 'invoices_' } },
})
```

The prefix is lowercase letters, digits and underscores, ending in `_`, and has no default: name it after the app, so a token found in a log or a commit says where it works. With the setting and no prefix, or a prefix of other characters, the server refuses to start and names the problem.

The tokens live in the auth store's `personal_access_token` table, which every store has from [migration](/reference/auth/#migrations) 8 on, whether the app turns the tokens on or not: `protobase auth migration` writes it for an app upgrading from an earlier Protobase.

## Making one

The account page's Access tokens tab, at `/-/account/tokens`, lists the person's tokens with their name, when each was made, when it expires and when it was last used, and the role and organization it acts with, and revokes any of them after asking. New token asks for a name and an expiry: in 30 days, in 90 days, in a year, or never. The new token is shown once, to copy: the app keeps only its SHA-256 hash, so nobody can show it again. The tab is not offered in an app without the setting.

A token acts with the role, and with [organizations](/reference/auth/#organizations) the organization, the session that made it works in, as its own tokens would. Someone with several roles who wants a token for another one [switches role](/reference/auth/#active-role) first. Someone with no role there cannot make one (`403 NO_ROLE`).

- A session that signed in more than a day ago [confirms it's them](/reference/auth/#confirming-an-account-change) first, in place, since a token acts as them long after that session ends.
- A [staff session](/reference/auth/#staff-sign-in) cannot make or revoke a token (`STAFF_CANNOT_CHANGE_SIGN_IN`); it may see the list.
- An account in `PROTOBASE_LOCKED_ACCOUNTS`, such as a demo's shared account, cannot make or revoke one (`403 ACCOUNT_LOCKED`).

## Using one

Send it as `Authorization: Bearer <token>`, wherever the app's own tokens work: the [resources API](/reference/api/), [API functions](/guides/api-functions/), [live updates](/reference/live/) and the [MCP endpoint](/reference/mcp/).

```sh
curl -G -H "Authorization: Bearer $INVOICES_TOKEN" --data-urlencode 'filter=status = "draft"' https://erp.example.com/api/v1/invoices
```

A request with it runs as the token's user, with its role, its organization and the app's [access rules](/reference/access/), as that person's own session would. It stands for no sign-in, so what only the person's own sign-in may do is refused, as with [`protobase token`](/reference/auth/#tokens-for-scripts-and-curl): registering a device for push notifications, or a value that needs a [recent strong sign-in](/reference/auth/#recent-strong-sign-in). At the MCP endpoint the token is the client, with the endpoint's scope.

A token is the prefix, 40 random characters and a 6-character checksum of both, all after the prefix in base62 (`0-9`, `A-Z`, `a-z`), so a double-click selects it whole. A token whose checksum does not match is refused before the store is read, so a typo or a made-up token costs no lookup. Each request with a valid one reads the store as a session's token does: the token by its hash, the user, and with organizations the membership. Its last use is noted at most once a minute.

## When it stops

These take effect on the next request, as for the app's own tokens (see [When a token stops working](/reference/auth/#when-a-token-stops-working)); a refused token is a `401` problem with `WWW-Authenticate: Bearer`:

| Change | The token |
| --- | --- |
| Revoked on the account page | is refused, and gone from the list. |
| Its expiry passed | is refused. It stays in the list, marked with when it expired, until revoked. |
| A ban (`/admin/ban-user`, `protobase users disable`) | is refused until the ban runs out or is lifted. |
| The user deleted | is refused, and deleted with them. |
| The role it carries taken away | is refused, even when the person still holds another role. |
| Removal from its organization | is refused, unless the role it carries is a global one, which still enters it. The organization's deletion deletes it. |

Signing out, a password change and signing out everywhere leave the person's tokens working, since a script holds them and not a browser: revoke them on the account page.

## The API

The account page calls these, under `/api/auth`, with the session cookie; each acts on the signed-in person's own tokens only. The client has them in `session.account`:

| Client | Endpoint |
| --- | --- |
| `personalAccessTokens()` | `GET /account/personal-access-tokens`: `{ tokens: [{ id, name, role, organization?, createdAt, expiresAt?, lastUsedAt? }] }`, newest first, with the role's label and the organization's name |
| `createPersonalAccessToken({ name, expiresInDays? })` | `POST /account/personal-access-tokens/create`: `{ token, personalAccessToken }`. `name` is 1 to 100 characters, `expiresInDays` 1 to 3650; without it the token never expires |
| `revokePersonalAccessToken(id)` | `POST /account/personal-access-tokens/revoke` with `{ id }`: deletes it; one that is gone already is no error |

`GET /api/auth/status` answers `"personalAccessTokens": true` when the app turns them on. The `PersonalAccessTokens` [block](/reference/blocks/#account-blocks) draws the list, for an account page of the app's own.

They are tokens of a person: a token limited to some resources or operations, a token of an organization or of the app itself, and an admin managing other people's tokens are not offered. <gap>A token cannot be limited to some resources or operations because scoped tokens are not implemented.</gap>
