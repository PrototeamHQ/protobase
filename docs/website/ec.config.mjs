import { defineEcConfig } from '@astrojs/starlight/expressive-code'

// The brand's code window: code is what the reader writes, so it is outlined on the page's paper rather than filled,
// in ink, with strings in signal-ink and comments in ink-3 italic (the Protobase brand guide, section 9).
const codeTheme = (type, colors) => ({
  name: `protobase-${type}`,
  type,
  colors: { 'editor.background': colors.paper, 'editor.foreground': colors.fg },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: colors.comment, fontStyle: 'italic' } },
    { scope: ['string', 'string.quoted', 'string.template', 'string.regexp'], settings: { foreground: colors.string } },
    { scope: ['constant.numeric', 'constant.language', 'constant.character'], settings: { foreground: colors.constant } },
    { scope: ['keyword', 'keyword.control', 'keyword.operator.new', 'storage', 'storage.type', 'storage.modifier', 'variable.language'], settings: { foreground: colors.keyword } },
    { scope: ['punctuation', 'meta.brace', 'keyword.operator'], settings: { foreground: colors.punctuation } },
    { scope: ['entity.name.function', 'support.function', 'meta.function-call entity.name.function'], settings: { foreground: colors.fg } },
  ],
})

export default defineEcConfig({
  themes: [
    codeTheme('dark', { paper: '#111216', fg: '#ebeae4', keyword: '#a3a6ae', punctuation: '#7d818a', comment: '#8c9099', string: '#ff8a5c', constant: '#5cc28c' }),
    codeTheme('light', { paper: '#f4f3ee', fg: '#14161a', keyword: '#4f535c', punctuation: '#686c75', comment: '#686c75', string: '#b8400e', constant: '#1f7a4d' }),
  ],
  useStarlightUiThemeColors: false,
  styleOverrides: {
    borderRadius: '10px',
    borderWidth: '1.5px',
    borderColor: 'var(--pb-line-2)',
    codeBackground: 'transparent',
    codeFontFamily: 'var(--__sl-font-mono)',
    uiFontFamily: 'var(--__sl-font-mono)',
    frames: {
      frameBoxShadowCssValue: 'none',
      editorTabBarBackground: 'transparent',
      editorTabBarBorderBottomColor: 'var(--pb-line-2)',
      editorActiveTabBackground: 'var(--pb-paper-2)',
      editorActiveTabForeground: 'var(--pb-ink)',
      editorActiveTabBorderColor: 'transparent',
      editorActiveTabIndicatorTopColor: 'transparent',
      editorActiveTabIndicatorBottomColor: 'transparent',
      editorBackground: 'transparent',
      terminalTitlebarBackground: 'transparent',
      terminalTitlebarBorderBottomColor: 'var(--pb-line-2)',
      terminalBackground: 'transparent',
    },
  },
})
