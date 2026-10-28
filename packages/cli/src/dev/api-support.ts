// What api-process.ts uses of the API besides entry.ts, loaded by path through the same Vite module graph so that
// @protobase/server resolves as the API's does: the server of its sockets, and the stops of the jobs and the realtime
// prune entry.ts started.
export { apiWebSocketServer } from '../project/api-websocket-server'
export { stopDevJobs } from './dev-jobs'
export { stopDevRealtimePrune } from './dev-prune'
