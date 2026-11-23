// The tests against a real relay start the Protobase Realtime binary protobase dev runs: the pinned release's,
// downloaded and checked on first use, or `PROTOBASE_REALTIME_BINARY`. A download that fails fails the test.
export { realtimeBinary } from '../packages/cli/src/dev/realtime-binary'
