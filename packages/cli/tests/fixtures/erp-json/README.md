The ERP's `protobase.config.ts` written as `protobase.config.json`, with its environment values as `$env`. The tests
put it in a project folder beside the ERP's own code and load, build and serve it there
(`tests/build/json-config.integration.test.ts`), and compare it with the ERP's TypeScript config
(`src/config/read-config.test.ts`).
