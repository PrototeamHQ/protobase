# Changelog

Every release of Protobase, cut by the release workflow from the commits since the last one (see the [versioning page](https://docs.protobase.net/reference/versioning/)).

## [0.12.20](https://github.com/PrototeamHQ/protobase/compare/v0.12.19...v0.12.20) (2026-10-13)

### Bug Fixes

* **cli:** serve keeps the native Response, so s3Files uploads stop storing [object Response] ([3e72699](https://github.com/PrototeamHQ/protobase/commit/3e7269965201df55364447c3c854b6d81fdfafce))

## [0.12.19](https://github.com/PrototeamHQ/protobase/compare/v0.12.18...v0.12.19) (2026-10-13)

### Features

* a record layout shows the record's position on a map with l.map, from PROTOBASE_MAP_STYLE_URL ([aa7f7b7](https://github.com/PrototeamHQ/protobase/commit/aa7f7b7169d3960b0cf9e2956456a5af7e6b3e50))
* the property portal shows a listing on a map, with development tiles from bun run map:tiles ([00c962c](https://github.com/PrototeamHQ/protobase/commit/00c962c053b7f8be6ff5c34dbcfa34464f432867))

## [0.12.18](https://github.com/PrototeamHQ/protobase/compare/v0.12.17...v0.12.18) (2026-10-13)

### Features

* **server:** s3-compatible file providers, and byte and file limits per provider ([b8b7242](https://github.com/PrototeamHQ/protobase/commit/b8b72428cb86a33cbd81c09cb3be19ece2d48fbf))

## [0.12.17](https://github.com/PrototeamHQ/protobase/compare/v0.12.16...v0.12.17) (2026-10-12)

### Bug Fixes

* **release:** wait for npm to serve every [@protobase](https://github.com/protobase) package as bun install asks for it ([2e6b995](https://github.com/PrototeamHQ/protobase/commit/2e6b99521344d7981759c8bd75c77bebbb4ae49a))

## [0.12.16](https://github.com/PrototeamHQ/protobase/compare/v0.12.15...v0.12.16) (2026-10-12)

### Features

* **property-portal:** a mobile bottom bar for members and admins, and one for visitors ([9db8220](https://github.com/PrototeamHQ/protobase/commit/9db8220f2c8e10f334e987f18a596bb5106b8807))

## [0.12.15](https://github.com/PrototeamHQ/protobase/compare/v0.12.14...v0.12.15) (2026-10-12)

### Features

* **ui:** a cards display steps through a record's photos with arrows, loaded on the first press ([9a7be30](https://github.com/PrototeamHQ/protobase/commit/9a7be300d712a218cd7a9120822fa33e966f245b))

## [0.12.14](https://github.com/PrototeamHQ/protobase/compare/v0.12.13...v0.12.14) (2026-10-12)

### Features

* a flags filter shows the records where any chosen boolean field is true ([312acf1](https://github.com/PrototeamHQ/protobase/commit/312acf1cbcf12f163c558cd174b88b9ac5cbd4bb))
* **property-portal:** a listing has a purchase price, a rent or both, and shows under each offer ([a59474d](https://github.com/PrototeamHQ/protobase/commit/a59474dc1349b0f1ac57cb13a5d1f477cab79ee7))
* **ui:** a card leaves out the meta fields that have no value ([a7014b5](https://github.com/PrototeamHQ/protobase/commit/a7014b57495cd7e5a6ac47aff65966d9197aabe0))

### Bug Fixes

* **ui:** a money column shows the view's decimals and has room for its suffix ([3bda15a](https://github.com/PrototeamHQ/protobase/commit/3bda15a5d6df09e4dbfca206bdbfa8a80325f5f9))

## [0.12.13](https://github.com/PrototeamHQ/protobase/compare/v0.12.12...v0.12.13) (2026-10-12)

### Features

* **ui:** on a phone the display switch is a menu beside the title, the sort is in the filters sheet ([62a8038](https://github.com/PrototeamHQ/protobase/commit/62a803840f669f472176c986aa2fefd65ac7513c))

## [0.12.12](https://github.com/PrototeamHQ/protobase/compare/v0.12.11...v0.12.12) (2026-10-12)

### Features

* **ui:** number filters are sliders and reference filters a searchable multi-select ([f0af344](https://github.com/PrototeamHQ/protobase/commit/f0af344382e87afc872932138cbea709f0c6707c))

## [0.12.11](https://github.com/PrototeamHQ/protobase/compare/v0.12.10...v0.12.11) (2026-10-12)

### Features

* property portal cards show the living area in m² with a ruler, EU energy labels and features ([38fb48a](https://github.com/PrototeamHQ/protobase/commit/38fb48a52418aad76e9191c3726a71aaef2212bf))
* **ui:** field suffixes and card icons, coloured arrow badges per value, card flags for booleans ([7747e69](https://github.com/PrototeamHQ/protobase/commit/7747e69c0b4642c45a5d4f27b1db1a92deb46839))

## [0.12.10](https://github.com/PrototeamHQ/protobase/compare/v0.12.9...v0.12.10) (2026-10-12)

### Features

* a property portal example with public listings, search alerts, favorites and private notes ([228a228](https://github.com/PrototeamHQ/protobase/commit/228a228fab60b6f1bb3e14ae61f556a0ea630252))
* **server:** jobs send mail through the app's SMTP server with context.mail ([4d20b08](https://github.com/PrototeamHQ/protobase/commit/4d20b0811d5b32318d768690cb965492d34ad0b4))
* **ui:** a cards display shows a file field as each card's image ([f49fee8](https://github.com/PrototeamHQ/protobase/commit/f49fee8c69b95a9ceade35e94a6f7b704f5ab3ba))
* **ui:** a create address fills in fields of the new record, from a link on a record too ([52049cd](https://github.com/PrototeamHQ/protobase/commit/52049cdd62833c1347c18c9332b71ae89bcc7744))
* **ui:** visitors browse what the anonymous role reads without signing in ([bf51f75](https://github.com/PrototeamHQ/protobase/commit/bf51f7550b3cefeb24f58db5378905ff8237adab))

## [0.12.9](https://github.com/PrototeamHQ/protobase/compare/v0.12.8...v0.12.9) (2026-10-12)

### Features

* **ui:** a frameless ActionCard keeps its content, buttons and confirm dialog without the card ([5df8803](https://github.com/PrototeamHQ/protobase/commit/5df8803ac26f9856ee0e2fec46ab910857e88090))

## [0.12.8](https://github.com/PrototeamHQ/protobase/compare/v0.12.7...v0.12.8) (2026-10-12)

### Features

* **schema:** a capability lists the fields and rows a role gets, and the anonymous role only reads ([d3acfda](https://github.com/PrototeamHQ/protobase/commit/d3acfda735c214778ce745d196d6093477e716fd))
* **server:** requests without a token act as the anonymous role on the resources API ([07ac3bd](https://github.com/PrototeamHQ/protobase/commit/07ac3bd85830a70ed684277cd1e75b569808a899))
* **server:** startup refuses role limits on fields, filters or resources that do not exist ([f41d636](https://github.com/PrototeamHQ/protobase/commit/f41d63645b040e3abec46b318c5ea73f12d6e224))

### Bug Fixes

* **ui:** the list's sort, filters and search share one row, and the view switch matches the buttons ([4b4f524](https://github.com/PrototeamHQ/protobase/commit/4b4f524a56134522a4f69334c5aa0217052c5550))

## [0.12.7](https://github.com/PrototeamHQ/protobase/compare/v0.12.6...v0.12.7) (2026-10-12)

### Bug Fixes

* **ui:** the record's breadcrumb shows a skeleton while the record loads, not its raw key ([ae561e0](https://github.com/PrototeamHQ/protobase/commit/ae561e0c853aebb85952851a88a8256c4a747163))

## [0.12.6](https://github.com/PrototeamHQ/protobase/compare/v0.12.5...v0.12.6) (2026-10-12)

### Bug Fixes

* **cli:** a plugin's plain utilities sit under the app's, so they never undo its responsive layout ([4f017f5](https://github.com/PrototeamHQ/protobase/commit/4f017f5aa621671ce80bdcb4cb48e5829cddc628))

## [0.12.5](https://github.com/PrototeamHQ/protobase/compare/v0.12.4...v0.12.5) (2026-10-12)

### Features

* send the app's errors to a Sentry-compatible tracker set by a DSN ([0509e0f](https://github.com/PrototeamHQ/protobase/commit/0509e0f0cc5b8387e31505b480d23be5d035008f))

## [0.12.4](https://github.com/PrototeamHQ/protobase/compare/v0.12.3...v0.12.4) (2026-10-12)

### Bug Fixes

* **ui:** a record page's phone save controls sit above the bottom bar, never over it ([a9c16d3](https://github.com/PrototeamHQ/protobase/commit/a9c16d3a30f650203010798fca61ea224d72c9a9))

## [0.12.3](https://github.com/PrototeamHQ/protobase/compare/v0.12.2...v0.12.3) (2026-10-12)

### Features

* **client:** a client with an absolute base URL answers each file's URL on that API's origin ([3d2a137](https://github.com/PrototeamHQ/protobase/commit/3d2a137416f14e422d5315076217bbc00026605d))
* **client:** meta takes a signal that gives up waiting ([a8faa32](https://github.com/PrototeamHQ/protobase/commit/a8faa320859c0b90839bfc7352e13b40ac40072a))
* **client:** sourceMeta scopes a source's /meta to an app's resources, routedClient routes calls ([65af56b](https://github.com/PrototeamHQ/protobase/commit/65af56b8ea8a9ce764af6642cf6f635a87576f5d))
* **server:** /meta names the sources of options.sources and PROTOBASE_SOURCES to their roles ([21e98d3](https://github.com/PrototeamHQ/protobase/commit/21e98d380c79d8d0e478954a171c7b413598024f))
* **server:** betterAuthAuthenticator admits the users of trusted apps with the roles it gives them ([24056f8](https://github.com/PrototeamHQ/protobase/commit/24056f8cd88fa66bdc34f778f94807992fcc05e9))
* **ui:** the app draws the resources of its sources as its own, at their own addresses ([1716a03](https://github.com/PrototeamHQ/protobase/commit/1716a0324ff96a7b447f2f38d278dc570714babc))

### Bug Fixes

* **server:** a source's url names its resources API's path, so its /meta is found beside it ([24019ad](https://github.com/PrototeamHQ/protobase/commit/24019ad835b96b73e30cc51e54ad0078d09dcfec))
* **server:** a trusted app's roles map by their own names only, never by an object's built-in keys ([5102e67](https://github.com/PrototeamHQ/protobase/commit/5102e67d7b8d56e5cc359f4380e27d726b7909b5))
* **server:** a trusted app's tokens are admitted when its base URL ends in a slash ([aa83f70](https://github.com/PrototeamHQ/protobase/commit/aa83f70efb2221d6175f69dd927896676203bb35))
* **server:** a trusted app's users get roles here from its global roles only, not an organization's ([45ad79c](https://github.com/PrototeamHQ/protobase/commit/45ad79cbfff7cf19d7c68eef17a5d516fe4d2721))
* **ui:** /meta that gains or loses sources keeps the app drawn, with the sources' layer always there ([eb8a79f](https://github.com/PrototeamHQ/protobase/commit/eb8a79f2c776d575e4cae88f0d4c292a5c89d47f))
* **ui:** useMeta below the app's MetaGate holds the resources of its sources, as the pages do ([bfe9cd0](https://github.com/PrototeamHQ/protobase/commit/bfe9cd05bae0d47e9e06a8b9f618758204ecf838))

## [0.12.2](https://github.com/PrototeamHQ/protobase/compare/v0.12.1...v0.12.2) (2026-10-12)

### Features

* **ui:** a list with a cards display opens in it below the sm breakpoint ([6d70b08](https://github.com/PrototeamHQ/protobase/commit/6d70b088cc2beaa46c5c8e74674e29651e962e5e))

## [0.12.1](https://github.com/PrototeamHQ/protobase/compare/v0.12.0...v0.12.1) (2026-10-12)

### Bug Fixes

* **cli:** a plugin's field types resolve React with Node's resolution, so installed projects build ([dc1225d](https://github.com/PrototeamHQ/protobase/commit/dc1225d00989cc2762a3d115467cde0d90ff397d))

## [0.12.0](https://github.com/PrototeamHQ/protobase/compare/v0.11.1...v0.12.0) (2026-10-12)

### ⚠ BREAKING CHANGES

* **cli:** protobase build copies the prebuilt shell and builds the project's UI as plugins

### Features

* **cli:** protobase build copies the prebuilt shell and builds the project's UI as plugins ([873faa7](https://github.com/PrototeamHQ/protobase/commit/873faa75f4ab40d6fc1cac52063796208c28dda3))
* d.cards takes a card component of the project or a plugin to draw each record ([492340b](https://github.com/PrototeamHQ/protobase/commit/492340b00ea8e9df0fff3573744914c00c14e486))
* plugins register field types that a view picks with .widget(), checked at startup ([209ae1a](https://github.com/PrototeamHQ/protobase/commit/209ae1afada8034625ec515644814ce1f1bca4aa))
* protobase.theme.css themes the app through its tokens, with radius and font as tokens ([47cc534](https://github.com/PrototeamHQ/protobase/commit/47cc5342e7335ddd7337bb6ca65dc31268a772bd))

## [0.11.1](https://github.com/PrototeamHQ/protobase/compare/v0.11.0...v0.11.1) (2026-10-12)

### Features

* **cli:** protobase build-plugin writes a plugin's module, its stylesheet and plugin.json ([3563307](https://github.com/PrototeamHQ/protobase/commit/356330724a4ec543ab183065c8803fdecba277c9))
* **cli:** the admin app shares React and @protobase/ui with plugins through an import map ([ef36c0a](https://github.com/PrototeamHQ/protobase/commit/ef36c0af5be41037c80b8d7dfc650e5d1a2d6543))
* **layout:** component(name, { plugin }) declares a plugin's component, which the build skips ([d1c14ed](https://github.com/PrototeamHQ/protobase/commit/d1c14ed361db8d3293dd1e66254c568e3614bdef))
* **server:** /meta names the plugins of options.plugins and PROTOBASE_PLUGINS to their roles ([f23e8d7](https://github.com/PrototeamHQ/protobase/commit/f23e8d7cfa68cb2c367a34bc21fe8f7c40c95d24))
* **ui:** the app loads the plugins /meta names, with definePlugin, usePlugin and a plugin API ([a25bc9f](https://github.com/PrototeamHQ/protobase/commit/a25bc9f15b037d9f2390c7b79212c61ef577fed4))

## [0.11.0](https://github.com/PrototeamHQ/protobase/compare/v0.10.0...v0.11.0) (2026-10-12)

### ⚠ BREAKING CHANGES

* a link in the app goes to an address in to, and an href in the app is refused at startup

### Features

* a link in the app goes to an address in to, and an href in the app is refused at startup ([a86e641](https://github.com/PrototeamHQ/protobase/commit/a86e641fdb6ee317f0ee8ac7fb6137bd3d486e3e))
* **cli:** the build fails on a declared component that protobase.ui.tsx does not export ([e577867](https://github.com/PrototeamHQ/protobase/commit/e5778677ec46d5d5dc9b9c5446d5f84c8c95a088))
* **schema:** a record layout holds custom components with l.custom ([abeb78f](https://github.com/PrototeamHQ/protobase/commit/abeb78f43fa196d7ef706a8a8d055f3cdff84425))
* **schema:** a view's list has card and custom component displays besides its table ([ae7f394](https://github.com/PrototeamHQ/protobase/commit/ae7f394134d73c21ae71e6b3b5a8d2db249d6cdd))
* **ui:** protobase.ui.tsx exports each custom component by name, from a file of its own ([62bba4e](https://github.com/PrototeamHQ/protobase/commit/62bba4e634f47119d77ddcd81bf639b9eeec72e3))
* **ui:** the list page switches between its table, cards and custom displays in the address ([bfb3c88](https://github.com/PrototeamHQ/protobase/commit/bfb3c8888542e9b55dd2fd1a9ed24ca71290a11c))
* **ui:** the record page draws a layout's custom components with the record around them ([35bd300](https://github.com/PrototeamHQ/protobase/commit/35bd30059543545909c2fa21d4929f428be35125))

### Bug Fixes

* one walker over typed field references keeps hidden fields out of views and custom props ([0cf8540](https://github.com/PrototeamHQ/protobase/commit/0cf8540e9086ec7454ac3c0d29ebf8a3a66d805e))
* **ui:** the list and create pages open a record whose key holds a slash ([ac21047](https://github.com/PrototeamHQ/protobase/commit/ac21047abf5a636f070f86d66ab9f9f599c2ff39))

## [0.10.0](https://github.com/PrototeamHQ/protobase/compare/v0.9.0...v0.10.0) (2026-10-11)

### ⚠ BREAKING CHANGES

* **server:** a passkey domain for new passkeys, each passkey keeping its RP ID for sign-in
* **server:** a session acts with one active role, its token's only one; write an auth migration
* snake_case resource and field names in the examples, docs, starters and built-in resources

### Features

* **client,ui:** sign in with a passkey of each domain people's passkeys were made for ([ba71e38](https://github.com/PrototeamHQ/protobase/commit/ba71e38415b08aaa4d7e745f963338a68a2948f8))
* **client:** session.roles reads the active role and switches it ([3caed04](https://github.com/PrototeamHQ/protobase/commit/3caed042950fdca3a1561fe5825257be417ca964))
* **erp:** a bottom bar for the warehouse role ([5d2fde0](https://github.com/PrototeamHQ/protobase/commit/5d2fde06b12ca0417aa9aee56cf53552a2f914b4))
* **schema:** bottomBar(), tabs on phones for some roles, with pure checks ([353ae42](https://github.com/PrototeamHQ/protobase/commit/353ae4297c160382b0b5a4cfc74020a618e8b0a5))
* **server:** a passkey domain for new passkeys, each passkey keeping its RP ID for sign-in ([a25cb1e](https://github.com/PrototeamHQ/protobase/commit/a25cb1e8861216785d70b457046aa5a8d207fa40))
* **server:** a session acts with one active role, its token's only one; write an auth migration ([1fc2b5f](https://github.com/PrototeamHQ/protobase/commit/1fc2b5f75e839d880b9fafc35358c31d1091d51f))
* **server:** an app on several origins with createAuth({ origins }) and PROTOBASE_ORIGINS ([d27adb2](https://github.com/PrototeamHQ/protobase/commit/d27adb244b96580ab3b184d69eb4dd066558a328))
* **server:** bottom bars in /meta, the one naming the active role, checked at startup ([6a6a86e](https://github.com/PrototeamHQ/protobase/commit/6a6a86ee6e863991254382446a0de4227076bc5c))
* **server:** cross-origin calls to the API from the app's origins and PROTOBASE_CORS_ORIGINS ([0746882](https://github.com/PrototeamHQ/protobase/commit/0746882012ad8279c0b3c45d5692272dc32d6c60))
* **server:** relative OpenAPI servers and Scalar document url, right on any host and prefix ([e2b789a](https://github.com/PrototeamHQ/protobase/commit/e2b789ab6b8163a404ecd09448b46a6794cf6f59))
* snake_case resource and field names in the examples, docs, starters and built-in resources ([2c44acd](https://github.com/PrototeamHQ/protobase/commit/2c44acd00e924f43f3848f6270595ac2ae0190e1))
* **ui:** a role switcher in the profile menu; the shell follows the active role ([1096b4e](https://github.com/PrototeamHQ/protobase/commit/1096b4ef9b29a07ec3a71d6e47766f03d9bfa3f4))
* **ui:** an iOS-style bottom bar on phones, with More opening the navigation drawer ([df647b7](https://github.com/PrototeamHQ/protobase/commit/df647b7db469e41d3c5d168fab6d41432fd96855))

### Bug Fixes

* **ci:** install Playwright Chromium before the checks so the e2e tests can launch it ([347692d](https://github.com/PrototeamHQ/protobase/commit/347692d61c943de5d14a22a9996e7707e885ed0c))
* **erp:** a jobs migration for the ordered enqueue of e389f9c ([f3e1015](https://github.com/PrototeamHQ/protobase/commit/f3e1015bfc42ca87d8a7dd53e985ef9cc75b8408))
* **server:** ordered jobs enqueued in one transaction run in enqueue order ([e389f9c](https://github.com/PrototeamHQ/protobase/commit/e389f9ce6a8669aa6d7861b8866d7b6c774e9208))

## [0.9.0](https://github.com/PrototeamHQ/protobase/compare/v0.8.2...v0.9.0) (2026-10-11)

### ⚠ BREAKING CHANGES

* **server:** deliver resource events to subscriptions, signed, retried and shaped per receiver

### Features

* **cli:** dev, serve and worker deliver events; protobase migration writes jobs for events ([25bb1fc](https://github.com/PrototeamHQ/protobase/commit/25bb1fcb7f1a1483ecdb26986e4d5007f249f30b))
* **cli:** protobase migration writes the webhooks schema; dev and serve check it ([368afea](https://github.com/PrototeamHQ/protobase/commit/368afea4f6485d5fd090635bab0d16c9511607e7))
* **schema:** webhookResources, the pages of webhook subscriptions and their deliveries ([669a655](https://github.com/PrototeamHQ/protobase/commit/669a6551ff309b16ec7d48a7b400478ce07ddaf0))
* **server:** deliver resource events to subscriptions, signed, retried and shaped per receiver ([8ceb61e](https://github.com/PrototeamHQ/protobase/commit/8ceb61e78681776536ac170573ead54f675911f9))
* **server:** wake a job's worker in this process, rather than at its next poll ([ec6a94b](https://github.com/PrototeamHQ/protobase/commit/ec6a94b0637228dc4d0e353cddf6eb44b5d49c8a))
* **server:** webhooks(), subscriptions made in the admin app that deliver as their owner ([bea11f2](https://github.com/PrototeamHQ/protobase/commit/bea11f2e3beff2799e09a6ba9a9ed74c621b41f1))

## [0.8.2](https://github.com/PrototeamHQ/protobase/compare/v0.8.1...v0.8.2) (2026-10-11)

### Features

* **cli:** dev and serve run the app's jobs; PROTOBASE_JOBS=off leaves them to another process ([33de967](https://github.com/PrototeamHQ/protobase/commit/33de96731b5d23b276841f23b2daef9caf19aa6a))
* **cli:** protobase migration writes the jobs schema for a config with jobs ([77d4c37](https://github.com/PrototeamHQ/protobase/commit/77d4c37a0ae7cac59d4177be831b189431ebb693))
* **cli:** protobase worker, and POST /api/jobs/drain in serve with PROTOBASE_JOBS_DRAIN_TOKEN ([eb9ea49](https://github.com/PrototeamHQ/protobase/commit/eb9ea498a8de42d3d259ec4fd64a4d727106e5ab))
* **presets:** the ERP marks a sent invoice overdue with a job the day after it is due ([967eb2d](https://github.com/PrototeamHQ/protobase/commit/967eb2d35a4dea5a76bcd205959c2c27c040d9a7))
* **presets:** the ERP marks every sent invoice past its due date overdue each night ([625dc81](https://github.com/PrototeamHQ/protobase/commit/625dc81e0d2a3780712ad845e3fe18190d80c255))
* **server:** a failed jobs page for admins, with retry and delete ([ee69e18](https://github.com/PrototeamHQ/protobase/commit/ee69e1885325908c16ba26c1b5a1706df7e27010))
* **server:** jobs on pg-boss: defineJob, enqueue in the caller's transaction, workers, schema check ([5f7cfb6](https://github.com/PrototeamHQ/protobase/commit/5f7cfb62b76dddec6f6e252d3fc8da5d7d3f5fc8))
* **server:** recurring jobs, jobs.next_due() and a drain endpoint for hosts that let apps sleep ([372ff4e](https://github.com/PrototeamHQ/protobase/commit/372ff4e2cca20878a39b2f2efe230af31548cc8e))

## [0.8.1](https://github.com/PrototeamHQ/protobase/compare/v0.8.0...v0.8.1) (2026-10-11)

### Features

* **cli:** protobase migration writes what auth and events need; dev and serve check the capture ([43452c5](https://github.com/PrototeamHQ/protobase/commit/43452c596307b49143280ecd54785ec37a41114b))
* **schema:** resource events with .events(), the e helpers and the event catalogue in the model ([d34c8b7](https://github.com/PrototeamHQ/protobase/commit/d34c8b793eb49445653ef8ad960f138dfc65da39))
* **server:** capture changes by trigger into changes.outbox, as a migration checked at startup ([94f2d5a](https://github.com/PrototeamHQ/protobase/commit/94f2d5adac2dfb63d4b7cecf673a7e0417be35f7))
* **server:** coalesce captured changes per record, tell soft deletes apart and match events ([2687ee7](https://github.com/PrototeamHQ/protobase/commit/2687ee7b9a0f4196e0d8e5eedcace07666ef113c))

## [0.8.0](https://github.com/PrototeamHQ/protobase/compare/v0.7.0...v0.8.0) (2026-10-11)

### ⚠ BREAKING CHANGES

* **presets:** the ERP works in organizations; run its base seed before the first user

### Features

* **cli:** doctor takes a text column for a file field ([3362475](https://github.com/PrototeamHQ/protobase/commit/3362475f5f03d62d63dcf51e31572a04849ac6d6))
* **client:** invoke calls an api function with the user's token ([8269c08](https://github.com/PrototeamHQ/protobase/commit/8269c083757db49b822065e274488ec8c71c96fa))
* **client:** organizations in the auth session: switching, members, roles and invitations ([6320977](https://github.com/PrototeamHQ/protobase/commit/63209772bee6c25db72bf39f80a8030ea0fc4356))
* **client:** upload sends a file for a file field, with progress ([e245385](https://github.com/PrototeamHQ/protobase/commit/e245385b03749c284553dc4cef0fe993894769a4))
* **cli:** file cleanup in serve every hour, and protobase files cleanup ([89dfed9](https://github.com/PrototeamHQ/protobase/commit/89dfed9e664af3ce384e2a2d1fd6d50ca00cd914))
* **cli:** protobase organizations commands, and users create into an organization ([7448dd6](https://github.com/PrototeamHQ/protobase/commit/7448dd6dedad71986847fe7591222179264c438e))
* **cli:** serve one api function per file in functions/ in dev, build and serve ([ef7ce97](https://github.com/PrototeamHQ/protobase/commit/ef7ce9718b8b4e0d6e54cd2e6974044544212a84))
* **presets:** the ERP works in organizations; run its base seed before the first user ([1eb9bb0](https://github.com/PrototeamHQ/protobase/commit/1eb9bb0613c2d316b72bd4d193a24758989bd012))
* **schema:** f.file() with allowed types, max size, provider and derived fields ([27a68a8](https://github.com/PrototeamHQ/protobase/commit/27a68a8e870c93526148aa4fa2cb7e16792d8a54))
* **server:** api functions of the app's own at /api/functions/<name> ([384c946](https://github.com/PrototeamHQ/protobase/commit/384c9467d5d5f776efafd502756d1703f56a6cf5))
* **server:** async organization ids, and the first user owns organizations without members ([6d8698a](https://github.com/PrototeamHQ/protobase/commit/6d8698a2c5a80d9adfdf9a72b99dd34676432f4f))
* **server:** derived fields from uploads: imageSize, aspectRatio, fileSize, fileType, processor() ([d6a6947](https://github.com/PrototeamHQ/protobase/commit/d6a69474ae90567be7abbb04d63696b90b4ff1de))
* **server:** file fields on local disk: uploads, tickets, downloads and scheduled deletes ([17fbf2f](https://github.com/PrototeamHQ/protobase/commit/17fbf2f7b211c233e9dc17fffe9ca687a88abd99))
* **server:** helpers for api functions: readJson, signed webhooks, requireEnv, functionApp ([288d5cd](https://github.com/PrototeamHQ/protobase/commit/288d5cd7ef172ab34f8b60ec4c951e781093b28b))
* **server:** organization invitations, app role grants, ownership transfer and switching ([128a2ff](https://github.com/PrototeamHQ/protobase/commit/128a2ff541811e4cebe5b9c570d3e1549fa5633d))
* **server:** organizations in createAuth, with global and membership app roles in the token ([275c4df](https://github.com/PrototeamHQ/protobase/commit/275c4dff7b9e20e15c0aa8099b227a4877e509bd))
* **ui:** organization switcher, members, invitations and invitation link pages ([fa9b0a0](https://github.com/PrototeamHQ/protobase/commit/fa9b0a0f024a74129cbc5614de270ae007719d4f))
* **ui:** upload, replace and remove files in forms, and show them in lists ([7e37ac0](https://github.com/PrototeamHQ/protobase/commit/7e37ac05f3e48584ccabb02fd83e6af6e04329b9))

### Bug Fixes

* **presets:** remove the organization the ERP organizations test creates ([f4751f2](https://github.com/PrototeamHQ/protobase/commit/f4751f274fc31a828abd2e1200c1df1bae6799c7))

## [0.7.0](https://github.com/PrototeamHQ/protobase/compare/v0.6.0...v0.7.0) (2026-10-10)

### ⚠ BREAKING CHANGES

* **server:** snake_case auth tables and columns; protobase auth migration renames those of 0.6

### Features

* **server:** snake_case auth tables and columns; protobase auth migration renames those of 0.6 ([d48575e](https://github.com/PrototeamHQ/protobase/commit/d48575e0d097789e0c0924bbca6c13a100865423))

## [0.6.0](https://github.com/PrototeamHQ/protobase/compare/v0.5.0...v0.6.0) (2026-10-10)

### ⚠ BREAKING CHANGES

* **server:** a platform sign-in provider from PROTOBASE_SIGN_IN_*; run auth:migrate to upgrade
* **cli,server:** auth schema changes as project migrations for db:migrate, checked at startup

Moving an app back to an earlier release is not supported: below 1.0 a minor version may break. An older release refuses the new `signInPolicy.platformSignIn` column (`text not null`, no default) and sign-in answers 500. To move back anyway, first run `alter table "auth"."signInPolicy" drop column "platformSignIn"`. Before upgrading again, add it back with `alter table "auth"."signInPolicy" add column "platformSignIn" text default 'allowed' not null`.

### Features

* **cli,server:** auth schema changes as project migrations for db:migrate, checked at startup ([5ef236e](https://github.com/PrototeamHQ/protobase/commit/5ef236e1afdd59fbc14024f46b77f77164caf83d))
* **client,ui:** sign in through a ?sign-in=<provider> link, connect providers on the account page ([e6ffccd](https://github.com/PrototeamHQ/protobase/commit/e6ffccd658d89529f3b7e076d2e1a876ed28d5bc))
* **server,cli:** create a user with linked sign-in accounts, and protobase users create --github-id ([5a7933d](https://github.com/PrototeamHQ/protobase/commit/5a7933dbd978acc2a98c6ac122ef9a7f0e062118))
* **server:** a platform sign-in provider from PROTOBASE_SIGN_IN_*; run auth:migrate to upgrade ([f62a86d](https://github.com/PrototeamHQ/protobase/commit/f62a86d74b0313928a72b24c3b91a3bd4ee8f725))

## [0.5.0](https://github.com/PrototeamHQ/protobase/compare/v0.4.1...v0.5.0) (2026-10-10)

### ⚠ BREAKING CHANGES

* **schema,server:** a widget part an app component draws, and the widget() helper

### Features

* **cli:** build and dev with --extend, merging an extension's configs before the project's ([86db663](https://github.com/PrototeamHQ/protobase/commit/86db663b842a7ccb58d52b0fbc665d33e182f4a9))
* **client,ui:** draw widget parts in the dock with the app's components and useBackendData ([ca36f9d](https://github.com/PrototeamHQ/protobase/commit/ca36f9d53c4e6052d1e8d36b93e53a1ed69dfdd1))
* **schema,server:** a widget part an app component draws, and the widget() helper ([d444215](https://github.com/PrototeamHQ/protobase/commit/d444215b1bbf1983694101ec730afc837f053a24))
* **server,ui:** extend a config with others, merging with defineConfig, mergeConfig and mergeUi ([51faaed](https://github.com/PrototeamHQ/protobase/commit/51faaed29d74ff8ec990d5ce9e7c4410cbd79053))
* **server:** app tools in the built-in assistant, with records as the user ([b090ee9](https://github.com/PrototeamHQ/protobase/commit/b090ee94981f2682252143c4f4ff9e15bfbc0c53))

## [0.4.1](https://github.com/PrototeamHQ/protobase/compare/v0.4.0...v0.4.1) (2026-10-10)

### Bug Fixes

* **server:** depend on @simplewebauthn/server so the passkey types in the declarations resolve ([27e238e](https://github.com/PrototeamHQ/protobase/commit/27e238e6befd92497ab62c62d733ad78f4eda1af))

## [0.4.0](https://github.com/PrototeamHQ/protobase/compare/v0.3.5...v0.4.0) (2026-10-10)

### ⚠ BREAKING CHANGES

* **client,ui:** a staff sign-in page, a banner for staff sessions and the log of staff sign-ins
* **server:** emailed codes, passkeys, two-factor and a sign-in policy; run auth:migrate to upgrade
* **client,ui:** emailed codes, passkeys, two-factor steps, account security and a policy page
* **server:** staff sign-in as a person through an operator provider; run auth:migrate to upgrade

### Features

* **client,ui:** a staff sign-in page, a banner for staff sessions and the log of staff sign-ins ([aa2f603](https://github.com/PrototeamHQ/protobase/commit/aa2f603615e6bc43fadd4051e322f773d18e4685))
* **client,ui:** emailed codes, passkeys, two-factor steps, account security and a policy page ([2c1ae90](https://github.com/PrototeamHQ/protobase/commit/2c1ae90264eaf4cba3931b223357bfb17a6251da))
* **server:** emailed codes, passkeys, two-factor and a sign-in policy; run auth:migrate to upgrade ([3e71f4e](https://github.com/PrototeamHQ/protobase/commit/3e71f4e98760dc0f75e7e0d5a3770d370f0da143))
* **server:** staff sign-in as a person through an operator provider; run auth:migrate to upgrade ([fa0313d](https://github.com/PrototeamHQ/protobase/commit/fa0313d57767a2ccb1989bb201e7e348ecd393b1))

## [0.3.5](https://github.com/PrototeamHQ/protobase/compare/v0.3.4...v0.3.5) (2026-10-10)

### Features

* **cli:** build plain ESM bundles for Node and Bun, with Bun's bundler only under --bun ([36e5179](https://github.com/PrototeamHQ/protobase/commit/36e51794c99a3febfc1c6d0767626fdbdfeee04f))
* **client:** a client of the runtime updates endpoint ([a7e68a7](https://github.com/PrototeamHQ/protobase/commit/a7e68a7623b985445ccafcb766b3cbd5ecc0dc3c))
* **cli:** load project files with Vite's module runner so the CLI runs on Node and Bun ([94de5a1](https://github.com/PrototeamHQ/protobase/commit/94de5a1ed2f19dfddc923eb10844647e9e720a03))
* **images:** base protobase-dev on Bun alone, without Node ([eedb7f3](https://github.com/PrototeamHQ/protobase/commit/eedb7f34b1c34fc6429d293b870710f0a2b5289d))
* **server:** name a runtime updates endpoint to admins in /meta ([0d23412](https://github.com/PrototeamHQ/protobase/commit/0d234129c8ce81b135812270587b78d80277d867))
* **ui:** a runtime update button in the top bar ([379ff4f](https://github.com/PrototeamHQ/protobase/commit/379ff4f0437c65493e70b31477bf7e84470e0231))

### Bug Fixes

* **cli:** keep the scratch folder's random name out of bundles that Bun's bundler writes ([4b7faec](https://github.com/PrototeamHQ/protobase/commit/4b7faecd25e28c3dbaa987eb7805138e4957f675))
* **cli:** point to the project's db:up script without assuming pnpm ([9d4352f](https://github.com/PrototeamHQ/protobase/commit/9d4352f294658c2a680147d7e61162c243fbe4ed))
* **ui:** open side panels full screen on phones ([9561119](https://github.com/PrototeamHQ/protobase/commit/95611190be91996304e18e2a0773546df8bc8987))

## [0.3.4](https://github.com/PrototeamHQ/protobase/compare/v0.3.3...v0.3.4) (2026-10-10)

### Bug Fixes

* **ui:** show only the Assistant button's icon on phones ([6a416f7](https://github.com/PrototeamHQ/protobase/commit/6a416f73fedf4e2ec3fb0efe6c8ffd81761c082d))

## [0.3.3](https://github.com/PrototeamHQ/protobase/compare/v0.3.2...v0.3.3) (2026-10-10)

### Bug Fixes

* **server:** greet the SMTP server with the sender's domain instead of [127.0.0.1] ([51e7437](https://github.com/PrototeamHQ/protobase/commit/51e74376b11f0374138fcdadb517f9a2efb504c0))

## [0.3.2](https://github.com/PrototeamHQ/protobase/compare/v0.3.1...v0.3.2) (2026-10-10)

### Bug Fixes

* **cli:** let Bun's bundler write the bundles so Bun reads their non-ASCII text correctly ([38fb2b3](https://github.com/PrototeamHQ/protobase/commit/38fb2b3316d6b7b85bb11a3dee35034cb52a5002))

## [0.3.1](https://github.com/PrototeamHQ/protobase/compare/v0.3.0...v0.3.1) (2026-10-10)

### Bug Fixes

* **ui:** refresh a sidebar group when a record read anew differs from its row ([310cbc9](https://github.com/PrototeamHQ/protobase/commit/310cbc91addbe203a8bca065f05e12d81d09ab62))

## [0.3.0](https://github.com/PrototeamHQ/protobase/compare/v0.2.0...v0.3.0) (2026-10-10)

### ⚠ BREAKING CHANGES

* **server:** keep assistant transcripts in a conversation store and cache their prefix per turn

### Features

* **server:** keep assistant transcripts in a conversation store and cache their prefix per turn ([3882771](https://github.com/PrototeamHQ/protobase/commit/3882771f06cda1f11333021a1fee67c0505d91c9))
* **server:** reasoning effort, cache_control text parts and reasoning details in chat completions ([08e3f67](https://github.com/PrototeamHQ/protobase/commit/08e3f67acab161ce69bb568cee04360926724c88))
* **server:** withCacheBreakpoints marks prompt-cache breakpoints on chat messages ([aeb9661](https://github.com/PrototeamHQ/protobase/commit/aeb9661732c39d3a39bf12b7c03f16c87f87e324))
* **ui:** send the page the user is on with each assistant message ([7b03e48](https://github.com/PrototeamHQ/protobase/commit/7b03e48f755160386bcdc8f985912b350180fb34))

## [0.2.0](https://github.com/PrototeamHQ/protobase/compare/v0.1.6...v0.2.0) (2026-10-10)

### ⚠ BREAKING CHANGES

* **ui:** render assistant backends with generic chat primitives in the shell's dock

### Features

* **client:** a client for assistant backends ([bf5d48c](https://github.com/PrototeamHQ/protobase/commit/bf5d48cf41f8e08c1fcd580595d7233592b1f91c))
* **schema:** the assistant protocol's types, event reducer and event-stream reader ([5da7cd4](https://github.com/PrototeamHQ/protobase/commit/5da7cd4d6d3e5d968e54b2322032d28cddde3f99))
* **server:** name the assistant backend in /api/meta and answer questions with a built-in assistant ([2df1c9a](https://github.com/PrototeamHQ/protobase/commit/2df1c9ae491654cb575f886da71dbaac1de945ca))
* **server:** tool-calling turns, approvals and guarded query tools for the assistant ([aba90a7](https://github.com/PrototeamHQ/protobase/commit/aba90a756ae44c52c9a2e26c552262ad5ae1454c))
* **ui:** render assistant backends with generic chat primitives in the shell's dock ([77b6cac](https://github.com/PrototeamHQ/protobase/commit/77b6cacae2d1a35c339b18af97f83afa274ffe51))

## [0.1.6](https://github.com/PrototeamHQ/protobase/compare/v0.1.5...v0.1.6) (2026-10-09)

### Bug Fixes

* **release:** wait for npm to serve the [@protobase](https://github.com/protobase) packages before writing the image contexts ([e0fa7cc](https://github.com/PrototeamHQ/protobase/commit/e0fa7cc7011a11b67787b8f6db004e352da4f10a))

## [0.1.5](https://github.com/PrototeamHQ/protobase/compare/v0.1.4...v0.1.5) (2026-10-09)

### Features

* **images:** publish ghcr.io/prototeamhq/protobase and protobase-dev at every release ([2d1e1d1](https://github.com/PrototeamHQ/protobase/commit/2d1e1d120cc07062f67a0c288f3885fcf200ef7f))

### Bug Fixes

* **presets:** stop publishing @protobase/presets and write them from a clone with pnpm presets:write ([bbf9b58](https://github.com/PrototeamHQ/protobase/commit/bbf9b58e71d0f9d99cdcebf9b941769c2e1e4d2f))

## [0.1.4](https://github.com/PrototeamHQ/protobase/compare/v0.1.3...v0.1.4) (2026-10-09)

### Features

* **server:** createAuth takes encryptOAuthTokens and an onUserCreated hook ([b84dec5](https://github.com/PrototeamHQ/protobase/commit/b84dec55bc17cef029d90128ca78686720ff020c))

## [0.1.3](https://github.com/PrototeamHQ/protobase/compare/v0.1.2...v0.1.3) (2026-10-09)

### Bug Fixes

* **cli:** doctor checks resources declared on views and materialized views ([6f0df75](https://github.com/PrototeamHQ/protobase/commit/6f0df75aa36692f14b0c94c0bc407efd833cca58))

## [0.1.2](https://github.com/PrototeamHQ/protobase/compare/v0.1.1...v0.1.2) (2026-10-09)

### Features

* **presets:** make the examples standalone presets and publish them as @protobase/presets ([b65e0b6](https://github.com/PrototeamHQ/protobase/commit/b65e0b6d953192ab89c45014bb1177e91e2f608f))

## [0.1.1](https://github.com/PrototeamHQ/protobase/compare/v0.1.0...v0.1.1) (2026-10-09)

### Features

* **server:** social sign-in providers in createAuth, with a Continue with GitHub button ([4bcd207](https://github.com/PrototeamHQ/protobase/commit/4bcd207d329bbf1e971d924c717fa2467ee733b7))
* **ui:** add AssistantDock, and shell actions and rightPanel slots that App passes to AppShell ([67183da](https://github.com/PrototeamHQ/protobase/commit/67183da4a9449eab27bddcbda5bc41bdb18d5ca7))

## 0.1.0 (2026-10-09)

The first public release of the scoped `@protobase/*` packages: `@protobase/cli`, `@protobase/client`, `@protobase/layout`, `@protobase/query`, `@protobase/schema`, `@protobase/server` and `@protobase/ui`.
