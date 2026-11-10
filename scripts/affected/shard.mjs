// One CI leg's part of the selected test files, as `vitest run --shard <index>/<count>` takes it (scripts/affected-tests.mjs).

// The options a leg adds to createVitest: its shard, and a pass when that shard gets no test file, as when nothing is selected.
export const shardOptions = (shard) => (shard ? { shard, passWithNoTests: true } : {})

// The files Vitest's own sharding gives this leg out of those selected, the same split the leg's run makes.
export const legFiles = async (sequencer, selected) => (selected.length > 0 ? sequencer.shard([...selected]) : [])
