// A branch's commits are linted one by one (ci and the commit-msg hook), but land on main inside a squash message that
// the pr-title workflow lints with commitlint.config.mjs: a single commit's subject gains " (#<number>)", 8 characters
// for a four-digit number, and with several commits each subject becomes a "* " line of the body. So a branch commit's
// header stops at 92 characters, leaving room for either within the shared limit of 100. A stacked pull request's squash
// merge into its base branch already carries its " (#<number>)", and pr-title linted it as main's own message, so a
// header that ends with one takes main's limit.
const squashMerged = / \(#\d+\)$/
const branchLimit = 92
const mainLimit = 100

export default {
  extends: ['./commitlint.config.mjs'],
  plugins: [
    {
      rules: {
        'branch-header-max-length': ({ header }) => {
          const limit = squashMerged.test(header ?? '') ? mainLimit : branchLimit
          const length = (header ?? '').length
          return [length <= limit, `header must not be longer than ${limit} characters, current length is ${length}`]
        },
      },
    },
  ],
  rules: { 'header-max-length': [2, 'always', mainLimit], 'branch-header-max-length': [2, 'always'] },
}
