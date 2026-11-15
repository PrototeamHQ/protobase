import { describe, expect, it } from 'vitest'
import { parsePatch } from './patch'

const twoFiles = `diff --git a/src/total.ts b/src/total.ts
index 3b18e51..a1f2c3d 100644
--- a/src/total.ts
+++ b/src/total.ts
@@ -10,3 +10,4 @@ export const total = (lines: Line[]) =>
   lines
-    .map((line) => line.price)
+    .map((line) => line.price * line.quantity)
+    .filter(Boolean)
     .reduce(sum, 0)
diff --git a/README.md b/README.md
new file mode 100644
--- /dev/null
+++ b/README.md
@@ -0,0 +1 @@
+# Invoices
`

describe('parsePatch', () => {
  it('reads each file with its name and numbered lines', () => {
    const files = parsePatch(twoFiles)!
    expect(files.map((file) => file.path)).toEqual(['src/total.ts', 'README.md'])
    expect(files[0]!.lines.map((line) => [line.kind, line.oldNo, line.newNo])).toEqual([
      ['hunk', undefined, undefined],
      ['ctx', 10, 10],
      ['del', 11, undefined],
      ['add', undefined, 11],
      ['add', undefined, 12],
      ['ctx', 12, 13],
    ])
    expect(files[1]!.lines.at(-1)).toEqual({ kind: 'add', text: '# Invoices', newNo: 1 })
  })

  it('reads a removed line that looks like a file name by the counts of its hunk', () => {
    const files = parsePatch('--- a/notes\n+++ b/notes\n@@ -1,2 +1 @@\n--- a/old\n keep\n')!
    expect(files[0]!.lines.map((line) => line.kind)).toEqual(['hunk', 'del', 'ctx'])
  })

  it('skips text before the first file and the end of a mailed patch', () => {
    const mailed = `From 1a2b Mon Sep 17 00:00:00 2001\nSubject: Fix totals\n\n---\n${twoFiles}-- \n2.47.0\n`
    expect(parsePatch(mailed)?.map((file) => file.path)).toEqual(['src/total.ts', 'README.md'])
  })

  it('takes a hunk without its end of line and a file that is only renamed', () => {
    const files = parsePatch('diff --git a/a.txt b/b.txt\nsimilarity index 100%\nrename from a.txt\nrename to b.txt\ndiff --git a/c b/c\n--- a/c\n+++ b/c\n@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n')!
    expect(files.map((file) => file.path)).toEqual(['b.txt', 'c'])
    expect(files[1]!.lines.map((line) => line.text)).toEqual(['@@ -1 +1 @@', 'a', 'b'])
  })

  it('is undefined for text that is not a patch', () => {
    expect(parsePatch('Release notes\n\n- faster lists')).toBeUndefined()
    expect(parsePatch('@@ -1 +1 @@\n-a\n+b')).toBeUndefined()
    expect(parsePatch('--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n-a\n+b\n')).toBeUndefined()
    expect(parsePatch('--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\nmore\n')).toBeUndefined()
  })
})
