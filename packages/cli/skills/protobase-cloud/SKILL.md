---
name: protobase-cloud
description: Deploy a Protobase app hosted on protobase-cloud from its GitHub repository, check that a change went live, and find why a push did not deploy or a deploy failed. Use it when working on an app hosted on protobase-cloud; a self-hosted app does not need it.
---

# Protobase cloud

An app hosted on protobase-cloud whose code is on GitHub follows one branch of its repository, the repository's default branch unless the app was linked to another. A push to that branch is what deploys it: nothing else does, and a change on any other branch, a tag or a pull request deploys nothing.

protobase-cloud pushes to that branch too: a runtime update commits a new `bun.lock` within the `@protobase` ranges of `package.json`, as `Protobase <jobs@protobase.invalid>`, and deploys like any push. Pull before pushing. An update that cannot land on the branch goes to a `protobase/update-<version>` branch instead, to merge by hand.

## How a push goes live

1. GitHub sends the push to protobase-cloud through the Protobase GitHub App's webhook.
2. protobase-cloud fetches the branch and starts one build of its newest commit. While a build runs, later pushes wait for it; the next build takes the newest commit then, so quick pushes give one build, and the commits in between get no build of their own.
3. The build installs the packages (`bun install --frozen-lockfile`) and runs `protobase build`. It runs neither the typecheck nor the tests.
4. The deploy stops the app's writes (pages keep reading; writes, sign-in included, answer that the app is read-only while it is being updated), then runs `db:migrate`, the auth schema's migration and `protobase doctor --env DATABASE_URL` in one database transaction that commits only when all of them pass.
5. Writes come back, the new version is started on its own and must answer `/health` with its startup checks, and only then does the app switch to it.

When any step fails, the previous version keeps serving, on a database that is as it was, except that a failed start comes after the migrations committed: they stay applied.

## Is my change live?

Each build reports on GitHub as the check run `Protobase deploy` on the commit it built: in progress while it runs, then success ("Deployed") or failure with the step that failed and the end of its output.

```sh
gh api repos/<owner>/<repo>/commits/<sha>/check-runs --jq '.check_runs[] | select(.name == "Protobase deploy") | {status, conclusion, title: .output.title, text: .output.text}'
```

A change is live once the newest `Protobase deploy` on the followed branch succeeded on its commit or on a later commit that contains it (`git merge-base --is-ancestor <sha> <deployed sha>`). A deploy takes minutes; look again rather than in a tight loop.

## Why it is not live

Work down the list; the first that matches is the cause.

1. **Wrong branch.** The commit is not on the branch the app follows (`git branch -r --contains <sha>`).
2. **Still deploying.** The check run is in progress, or another build was running when you pushed: your commit gets built after it, or a later commit that contains it does.
3. **The build failed.** The check run's conclusion is failure. Its title names the step:

   | Title | Cause and fix |
   |---|---|
   | The app's packages could not be installed | `bun.lock` does not match `package.json`, or a package cannot be fetched. Run `bun install --frozen-lockfile` locally and commit the lockfile |
   | The app did not build | `protobase build` fails: run it locally |
   | The app's migrations failed | A migration failed and everything rolled back. They run in one transaction: `CREATE INDEX CONCURRENTLY` and other statements Postgres refuses in a transaction fail, use the plain form; any failed statement fails them all |
   | The app's config does not pass protobase doctor | Run `protobase doctor --env DATABASE_URL` on a database with the migrations applied. Usually a `.filterable()` or `.sortable()` field without an index: add the index it prints as a migration |
   | The app's first-time setup failed | `db:seed:base` or creating the first admin failed on the first deploy |
   | The new version was not deployed | Its text says why; `start_failed` means the new version did not start or answer `/health`, followed by the end of its output, such as a startup check that failed |
   | The deploy ran out of time | The build or the migrations took too long |
   | The data plane stopped during the deploy, The platform failed during the deploy | The platform's side: push again later, or report it |

   A commit whose build failed is not built again: the fix is a new push, which builds the newest commit.
4. **No check run at all**, nothing in progress, and the push is a few minutes old:
   - The app's page in the Protobase console shows the repository link. A broken link (the GitHub App was uninstalled or suspended, or the repository was removed from it, archived or deleted) means pushes no longer reach the app: relink it there.
   - The webhook did not arrive. protobase-cloud syncs every linked app nightly, which deploys it then; a Protobase admin can redeliver the push from the GitHub App's recent deliveries sooner.
5. **It went live and was replaced.** A rollback from the console serves an earlier version until the next deploy.

## Before calling a change done

The deploy does not run the project's typecheck or tests, and refuses what doctor refuses, so run them before pushing:

1. The project's typecheck and tests.
2. `protobase doctor --env DATABASE_URL` against a database with the project's migrations applied; exit code 1 means the deploy will be refused.
3. `protobase build`.
4. Migrations that work inside one transaction (no `CONCURRENTLY`), since the deploy runs them all in one.

After pushing, the change is done when `Protobase deploy` succeeded on its commit or a later one that contains it. A failure leaves the previous version live: fix it with a new push.
