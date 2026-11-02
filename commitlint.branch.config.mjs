// A branch's commits are linted one by one (ci and the commit-msg hook), but land on main inside a squash message that
// the pr-title workflow lints with commitlint.config.mjs: a single commit's subject gains " (#<number>)", 8 characters
// for a four-digit number, and with several commits each subject becomes a "* " line of the body. So a branch commit's
// header stops at 92 characters, leaving room for either within the shared limit of 100.
export default {
  extends: ['./commitlint.config.mjs'],
  rules: { 'header-max-length': [2, 'always', 92] },
}
