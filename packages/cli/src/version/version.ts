import packageJson from '../../package.json' with { type: 'json' }

// The Protobase version this code is, from @protobase/cli's package.json: read from source by `protobase build` and
// `protobase serve`, and inlined into protobase-serve.js by `protobase build-serve`.
export const protobaseVersion: string = packageJson.version
