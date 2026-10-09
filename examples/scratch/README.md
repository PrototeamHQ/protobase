# From scratch

The project a new app starts from when it takes neither the ERP nor the real estate preset: the auth setup, the
migration scripts, an empty `config/` and an empty `db/migrations/`. `@protobase/presets` ships it as `scratch`
(`packages/presets`). It has no resources, so `protobase doctor` refuses it until the first change adds one.
