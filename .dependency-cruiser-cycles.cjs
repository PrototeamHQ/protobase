// Cycles of static imports, in a cruise of its own whose graph leaves lazy imports out: a lazy import loads after all it
// imports back, so it closes no cycle at load, while in the main cruise a short lazy cycle could hide a static one.
const base = require('./.dependency-cruiser.cjs')

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: { ...base.options, exclude: { ...base.options.exclude, dynamic: true } },
}
