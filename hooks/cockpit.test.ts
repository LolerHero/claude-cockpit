import { test, expect } from 'claude-code/testing'

import { pathsIn, tailOf, linksIn, foldersIn, fuzzy, fuzzyScore, IMAGE_ROWS, KEEP, PER_PAGE } from './register.tsx'
import { paletteOf, PALETTES } from '../palettes.js'

// The test `$` carries no `$.session.cwd()` on 2.1.288 (measured: "not a function"), so the
// session starts in a fixed directory; nothing in `session.start` reads it.
const CWD = '/work'

// A real 1x1 PNG: the terminal's Image refuses bytes without an IHDR.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const PANE_PROPS = {
  title: 'Files',
  isFocused: true,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
} as const

// ─── the drawer ──────────────────────────────────────────────────────────────────────────────

test('finds a Windows path even though JSON.stringify doubles its backslashes', () => {
  const result = { content: [{ type: 'text', text: 'Saved to C:\\Users\\me\\Temp\\shot-1440.png' }] }
  expect(pathsIn(result)).toEqual(['C:/Users/me/Temp/shot-1440.png'])
})

test('a relative path is resolved against the session directory', () => {
  // A real Playwright MCP answer; an absolute-only pattern found nothing.
  const result = { content: [{ type: 'text', text: '- [Screenshot](./home-1440.png)' }] }
  expect(pathsIn(result, 'E:\\Work')).toEqual(['E:/Work/home-1440.png'])
})

test('documents and generated artefacts are collected, source files are not', () => {
  const docs = { content: [{ type: 'text', text: 'wrote /out/report.pdf and /out/notes.md' }] }
  expect(pathsIn(docs)).toEqual(['/out/report.pdf', '/out/notes.md'])
  const src = { content: [{ type: 'text', text: 'edited src/page.tsx and lib/x.py and a.json' }] }
  expect(pathsIn(src)).toEqual([])
})

test('a result that names no file yields nothing', () => {
  // The guard that keeps the drawer from filling on every unrelated tool call.
  expect(pathsIn({ content: [{ type: 'text', text: 'Screenshot captured - ID: ss_928' }] })).toEqual([])
})

// ─── the palette option ──────────────────────────────────────────────────────────────────────

test('the pane colour follows the palette option and survives a bad value', () => {
  expect(paletteOf('ansi')).toBe(PALETTES.ansi)
  expect(paletteOf('tokyo-night').subtle).toBe('#a9b1d6')
  expect(paletteOf('typo')).toBe(PALETTES['rose-pine'])
})

test('the mod loads with its manifest defaults and registers both commands', async ($, on) => {
  // `options` left out: the manifest's defaults. A load failure fails this test by itself.
  // Measured on 2.1.288: the test `$` has no `command.list` and nothing beneath the plugins
  // answers `session.start` or `command.register`, so the test answers both, as core would.
  const names: string[] = []
  on('session.start', async () => ({ cwd: CWD }))
  on('command.register', async ($, e) => {
    names.push(e.name)
    return { value: { command: e.name } }
  })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  expect(names).toEqual(['files']) // one command: /shots opened the same list under a false name
})

test('the dialog asks for rows enough to show it whole, so the arrows walk rather than scroll', async ($, on) => {
  // reference.md: a dialog opened with `rows` "shows whole and its arrows walk rather than
  // scroll". Opened a third tall with a 20-row Image box, the arrows scrolled instead.
  const opened: { rows?: number }[] = []
  disk(on)
  on('tool.call', async () => ({ result: { content: [] } }))
  on('ui.open', async ($, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  for (const name of ['a.md', 'b.md', 'c.md', 'shot.png']) {
    await $.tool.call({ tool: 'Write', file_path: `/work/${name}`, content: 'x' })
  }
  await $.command.run({ command: 'files', args: '', origin: { kind: 'plugin', name: 'test' }, presentation: { isFullscreen: false, columns: 120 } })
  const tree = await drawPane($)
  const rows = opened[0]?.rows ?? 0
  // 4 buttons + the hint + the image box and its gap: everything drawn fits in what was asked.
  expect(rows).toBeGreaterThanOrEqual(4 + 1 + IMAGE_ROWS + 1)
  expect(tree).toContain('Esc')
})

test("an image's fallback says why there is no picture", async ($, on) => {
  disk(on)
  on('tool.call', async () => ({ result: { content: [] } }))
  await $.tool.call({ tool: 'Write', file_path: '/work/shot.png', content: 'x' })
  expect(await drawPane($)).toContain('kitty or Ghostty')
})

test('the ansi palette reaches the module as its option', { options: { palette: 'ansi' } }, async ($, on) => {
  on('session.start', async () => ({ cwd: CWD })) // the bottom of the chain: core's answer
  // The manifest's picker value arrives in `register(on, options)`; the status line paints from
  // it (the pane keeps the terminal's colours), so the one thing to pin is the lookup.
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  expect(paletteOf('ansi').subtle).toBe('white')
})

// ─── the pane ────────────────────────────────────────────────────────────────────────────────

test('the pane lists a written image and draws it inline from its base64', async ($, on) => {
  // Everything the module asks of the engine is answered here, as core would on a real disk.
  // The fixture is a real 1x1 PNG: the terminal's Image refuses bytes without an IHDR.
  on('session.cwd', async () => ({ value: CWD }))
  on('env.get', async () => ({ value: undefined }))
  on('clock.now', async () => ({ value: 1 }))
  on('fs.exists', async () => ({ value: true }))
  on('fs.write', async () => ({ value: undefined }))
  on('fs.stat', async () => ({ value: { kind: 'file', size: 10, mtimeMs: 0, isLink: false } }))
  on('fs.read', async () => ({ value: { base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' } }))
  on('tool.call', async () => ({ result: { content: [] } }))

  await $.tool.call({ tool: 'Write', file_path: '/work/shot.png', content: 'x' })
  const pane = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', props: PANE_PROPS, requestId: 'files' })
  const tree = JSON.stringify(await pane.drawn())
  expect(tree).toContain('▪ shot.png')
  expect(tree).toContain('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
})

test('a file named three times in one answer is collected once', () => {
  // Playwright's real answer (2.1.288 session, 2026-10-03): the link, the comment and the code
  // each name the file, escaped differently; before the fix the pane listed it twice.
  const text =
    '### Result\n- [Screenshot of viewport](.playwright-mcp\\google-start.png)\n### Ran Playwright code\n' +
    "```js\n// Screenshot viewport and save it as .playwright-mcp\\google-start.png\n" +
    "await page.screenshot({\n  path: '.playwright-mcp\\\\google-start.png',\n  scale: 'css',\n  type: 'png'\n});\n```"
  expect(pathsIn([{ type: 'text', text }], 'E:\\Coding')).toEqual(['E:/Coding/.playwright-mcp/google-start.png'])
})

test('a file name outside ASCII is kept whole', () => {
  expect(pathsIn('wrote /home/u/Rechnung-März.pdf')).toEqual(['/home/u/Rechnung-März.pdf'])
})

/** Answers the engine calls the module makes, on a disk where every file exists. `mtime` maps a
 *  file name to its modification time (default: written just now); `asked` records exists() paths. */
const disk = (
  on: any,
  mtime: Record<string, number> = {},
  asked: string[] = [],
  writes: string[] = [],
  present: (path: string) => boolean = () => true,
  dirs = { root: CWD, cwd: CWD },
  env: Record<string, string> = { CLAUDE_CONFIG_DIR: '/cfg' },
) => {
  const NOW = 1_000_000
  on('session.cwd', async () => ({ value: dirs.cwd }))
  on('session.root', async () => ({ value: dirs.root }))
  on('env.get', async ($: unknown, e: { name: string }) => ({ value: env[e.name] }))
  on('session.id', async () => ({ value: 'sess-a' }))
  on('clock.now', async () => ({ value: NOW }))
  on('fs.exists', async ($: unknown, e: { path: string }) => {
    asked.push(e.path)
    return { value: present(e.path.replace(/\\/g, '/')) }
  })
  on('fs.write', async ($: unknown, e: { text: string }) => {
    writes.push(e.text)
    return { value: undefined }
  })
  on('fs.stat', async ($: unknown, e: { path: string }) => ({
    // The engine hands hooks the native, resolved path (`E:\work\README.md`): match by name.
    // A path with no extension is a directory: `mkdir out` and `git worktree add ../wt` make those.
    value: {
      kind: /\.\w+$/.test(e.path) ? 'file' : 'dir',
      size: 10,
      mtimeMs: mtime[e.path.split(/[\\/]/).pop() ?? ''] ?? NOW,
      isLink: false,
    },
  }))
  on('fs.read', async () => ({ value: { base64: PNG } }))
}

// `openerFor` reads USERPROFILE as the Windows sign; the opener commands are asserted on it.
const WINDOWS = { CLAUDE_CONFIG_DIR: '/cfg', USERPROFILE: 'C:/Users/me' }

// What `$.process.run` answers: the opener ran and exited so.
const exited = (exitCode: number) => ({ exitCode, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

const mountPane = ($: any) =>
  $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', props: PANE_PROPS, requestId: 'files' })

const drawPane = async ($: any) => JSON.stringify(await (await mountPane($)).drawn())

// The stored list, as the module keeps it. The test `$` has no `state.get` on 2.1.289 (measured:
// "undefined is not an object"), so the writes are watched instead: a `state.set` hook beneath
// the module sees every value it stores and passes the write on.
const watchState = (on: any) => {
  let last: any[] = []
  on('state.set', async ($: unknown, e: { value: unknown }, next: (e: unknown) => Promise<unknown>) => {
    last = Array.isArray(e.value) ? e.value : last
    return next(e)
  })
  return () => last
}

test('a Write is collected at its exact path, spaces and all', async ($, on) => {
  const asked: string[] = []
  disk(on, {}, asked)
  on('tool.call', async () => ({ result: { content: [] } }))
  // Rooted on every platform: a `C:\` path is relative on Linux, and the engine resolves it
  // against the session. Native separators and a drive by the time a hook sees it on Windows;
  // the point is the space survived, whole.
  await $.tool.call({ tool: 'Write', file_path: '/Users/John Smith/report.pdf', content: 'x' })
  expect(asked.some(p => p.replace(/\\/g, '/').endsWith('/Users/John Smith/report.pdf'))).toBe(true)
  expect(await drawPane($)).toContain('▪ report.pdf')
})

test('a file a command only mentions is not collected; one it produced is', async ($, on) => {
  // `git status` prints README.md, which exists but was not touched: it is not this session's.
  disk(on, { 'README.md': 0 })
  on('tool.call', async () => ({
    result: { content: [{ type: 'text', text: ' M README.md\nwrote /work/out/report.pdf' }] },
  }))
  await $.tool.call({ tool: 'Bash', command: 'make report && git status --short', description: 'build the report' })
  const tree = await drawPane($)
  expect(tree).toContain('▪ report.pdf')
  expect(tree).not.toContain('README.md')
})

test('a file written again moves to the top, even once the list is full', async ($, on) => {
  const status: string[] = []
  disk(on, {}, [], status)
  on('tool.call', async () => ({ result: { content: [] } }))
  for (let i = 1; i <= KEEP; i++) await $.tool.call({ tool: 'Write', file_path: `/work/f${i}.pdf`, content: 'x' })
  // f1 is the oldest of a full list; before the fix a rewrite kept it there, and the next new
  // file pushed it out, so a regenerated file looked like it was never produced.
  await $.tool.call({ tool: 'Write', file_path: '/work/f1.pdf', content: 'y' })
  await $.tool.call({ tool: 'Write', file_path: `/work/f${KEEP + 1}.pdf`, content: 'x' })
  expect(JSON.parse(status[status.length - 1] ?? '{}').files).toBe(KEEP)
  const pane = await mountPane($)
  const first = JSON.stringify(await pane.drawn())
  expect(first.indexOf(`▪ f${KEEP + 1}.pdf`)).toBeLessThan(first.indexOf('▪ f1.pdf'))
  expect(first.indexOf('▪ f1.pdf')).toBeLessThan(first.indexOf(`▪ f${KEEP}.pdf`))
  for (let p = 1; p < KEEP / PER_PAGE; p++) await pane.press({ key: 'nav:l' })
  const last = JSON.stringify(await pane.drawn())
  expect(last).toContain('▪ f3.pdf')
  expect(last).not.toContain('▪ f2.pdf') // the oldest untouched one is the one dropped
})

// ─── pages and keys ──────────────────────────────────────────────────────────────────────────

const writeMany = async ($: any, on: any, n: number) => {
  disk(on)
  on('tool.call', async () => ({ result: { content: [] } }))
  for (let i = 1; i <= n; i++) await $.tool.call({ tool: 'Write', file_path: `/work/f${i}.pdf`, content: 'x' })
}

const labels = (tree: string) => [...tree.matchAll(/"label":"▪ (f\d+)\.pdf"/g)].map(m => m[1])

test('page 1 shows the 8 newest files and a hint saying 1 of N', async ($, on) => {
  await writeMany($, on, 20)
  const tree = await drawPane($)
  expect(labels(tree)).toEqual(['f20', 'f19', 'f18', 'f17', 'f16', 'f15', 'f14', 'f13'])
  expect(tree).toContain('1/3')
  expect(tree).toContain('Esc')
})

test('one page needs no page indicator, and the hint is still drawn', async ($, on) => {
  await writeMany($, on, 3)
  const tree = await drawPane($)
  expect(tree).not.toContain('1/1')
  expect(tree).toContain('Esc')
  expect(tree).toContain('1–8')
})

test('l turns to page 2 and h back, the hint always in the tree', async ($, on) => {
  await writeMany($, on, 20)
  const pane = await mountPane($)
  await pane.press({ key: 'nav:l' })
  let tree = JSON.stringify(await pane.drawn())
  expect(labels(tree)).toEqual(['f12', 'f11', 'f10', 'f9', 'f8', 'f7', 'f6', 'f5'])
  expect(tree).toContain('2/3')
  expect(tree).toContain('Esc')
  await pane.press({ key: 'nav:l' })
  tree = JSON.stringify(await pane.drawn())
  expect(labels(tree)).toEqual(['f4', 'f3', 'f2', 'f1'])
  expect(tree).toContain('3/3')
  await pane.press({ key: 'nav:l' }) // past the last page: round to page 1
  tree = JSON.stringify(await pane.drawn())
  expect(tree).toContain('1/3')
  await pane.press({ key: 'nav:h' }) // and back round to the last
  tree = JSON.stringify(await pane.drawn())
  expect(tree).toContain('3/3')
})

// The list is host state for the session id. A trip through the agent screen hands the same
// conversation a new id and an empty state (Julian, 2026-10-04: same history, empty pane). The
// transcript survives, so an empty list is rebuilt from it: Writes and screenshots, which name
// the file they produced. Bash is left out on replay: without the call's time, a file a command
// only mentioned cannot be told from one it produced.
test('an empty list is rebuilt from the transcript, Bash left out', async ($, on) => {
  on('session.messages', async () => ({
    value: [
      { role: 'user', text: 'make files', toolUses: [] },
      {
        role: 'assistant',
        text: '',
        toolUses: [
          { tool_use_id: 'a', tool: 'Write', input: { file_path: 'E:/work/a.md' }, text: 'ok' },
          { tool_use_id: 'b', tool: 'Write', input: { file_path: 'E:/work/src/b.ts' }, text: 'ok' },
          { tool_use_id: 'c', tool: 'Write', input: { file_path: 'E:/work/c.pdf' }, isError: true, text: 'denied' },
          { tool_use_id: 'd', tool: 'Bash', input: { command: 'git status' }, text: ' M README.md' },
          { tool_use_id: 'e', tool: 'mcp__playwright__browser_take_screenshot', input: {}, text: 'saved to E:/work/shot.png' },
        ],
      },
    ],
  }))
  disk(on)
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  // Opening rebuilds (a draw may not write state: the host refuses it).
  await $.command.run({ command: 'files', args: '', origin: { kind: 'plugin', name: 'test' }, presentation: { isFullscreen: true, columns: 144 } })
  const tree = await drawPane($)
  expect(tree).toContain('▪ a.md')
  expect(tree).toContain('▪ shot.png')
  expect(tree).not.toContain('b.ts') // source, never listed
  expect(tree).not.toContain('c.pdf') // the Write failed
  expect(tree).not.toContain('README.md') // Bash: not replayed
})

// Two rows read „button.md“ and nothing said whether they were one file or two (Julian,
// 2026-10-04). One file reached by two spellings of its drive is one row; two files with one
// name each say their folder.
test('a drive letter in either case is one file, not two', async ($, on) => {
  disk(on)
  on('tool.call', async () => ({ result: { content: [] } }))
  await $.tool.call({ tool: 'Write', file_path: 'e:/work/design/button.md', content: 'x' })
  await $.tool.call({ tool: 'Write', file_path: 'E:/work/design/button.md', content: 'y' })
  expect((await drawPane($)).match(/▪ button\.md/g)?.length).toBe(1)
})

test('two files with the same name each show their folder', async ($, on) => {
  disk(on)
  on('tool.call', async () => ({ result: { content: [] } }))
  await $.tool.call({ tool: 'Write', file_path: '/work/a/contracts/button.md', content: 'x' })
  await $.tool.call({ tool: 'Write', file_path: '/work/b/design/button.md', content: 'x' })
  await $.tool.call({ tool: 'Write', file_path: '/work/b/notes.md', content: 'x' })
  const tree = await drawPane($)
  expect(tree.match(/▪ button.md"/g)?.length).toBe(2) // the label stays bare, the tail tells them apart
  expect(tree).toContain('"contracts"')
  expect(tree).toContain('"design"')
  expect(tree).toContain('▪ notes.md"') // a unique name stays bare
})

// Below 110 columns the terminal seats the pane inline above the prompt, and it gets only the rows
// the layout spares (a wrapped prompt takes one more). A page taller than that made the engine
// scroll the body: the hint fell off the bottom and the arrows scrolled instead of walking
// (Julian, half-width WezTerm, 2026-10-04). The page shrinks to the rows granted instead.
const mountInline = ($: any, bodyRows: number) =>
  $.ui.mount({
    plugin: 'cockpit',
    surface: 'terminal',
    component: 'Pane',
    props: { ...PANE_PROPS, placement: 'inline', scroll: { offset: 0, bodyRows } },
    requestId: 'files',
  })

test('inline with few rows, a page is as long as the rows granted, the hint still drawn', async ($, on) => {
  await writeMany($, on, 20)
  const tree = JSON.stringify(await (await mountInline($, 5)).drawn())
  expect(labels(tree)).toEqual(['f20', 'f19', 'f18', 'f17'])
  expect(tree).toContain('1/5')
  expect(tree).toContain('Esc')
})

test('inline, the image preview is left out before any row is', async ($, on) => {
  disk(on)
  on('tool.call', async () => ({ result: { content: [] } }))
  for (let i = 1; i <= 3; i++) await $.tool.call({ tool: 'Write', file_path: `/work/f${i}.pdf`, content: 'x' })
  await $.tool.call({ tool: 'Write', file_path: '/work/shot.png', content: 'x' })
  const tree = JSON.stringify(await (await mountInline($, 8)).drawn())
  expect(tree).toContain('▪ shot.png')
  expect(tree).toContain('▪ f1.pdf')
  expect(tree).not.toContain('"type":"Image"')
})

// Opening a file hands the person to another app; coming back to an open pane they then have to
// dismiss is the wrong way round (Julian, 2026-10-04). A failed open keeps the pane to pick again.
const pressOpen = async ($: any, on: any, exitCode: number) => {
  const closed: string[] = []
  const toasts: string[] = []
  on('process.run', async () => ({ value: exited(exitCode) }))
  on('ui.close', async ($: unknown, e: { id: string }) => {
    closed.push(e.id)
    return { value: undefined }
  })
  on('ui.toast', async ($: unknown, e: unknown) => {
    toasts.push(JSON.stringify(e))
    return { value: undefined }
  })
  await writeMany($, on, 2)
  const pane = await mountPane($)
  await pane.press({ key: 'row:0' })
  return { closed, toasts }
}

test('the pane closes itself once a file has opened', async ($, on) => {
  const { closed, toasts } = await pressOpen($, on, 0)
  expect(closed).toEqual(['files'])
  expect(toasts).toEqual([])
})

test('a failed open keeps the pane and says why', async ($, on) => {
  const { closed, toasts } = await pressOpen($, on, 1)
  expect(closed).toEqual([])
  expect(toasts.join()).toContain('could not open f2.pdf')
})

test('digits 1-8 are the hotkeys on every page, never letters', async ($, on) => {
  await writeMany($, on, 20)
  const pane = await mountPane($)
  await pane.press({ key: 'nav:l' })
  const keys = (await pane.findAll({ type: 'Button' })).map((b: any) => b.props?.hotkey).filter(Boolean)
  expect(keys).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', 'j', 'k', 'o', 'h', 'l', 'f'])
})

test('j and k move the focus row by row, and past the edge turn the page', async ($, on) => {
  // The test `$` has no `ui.focus` on 2.1.288 ("no implementation"), so the ring itself cannot
  // be read here; the row count it takes to turn the page is what pins j/k to one row a press.
  await writeMany($, on, 10)
  const pane = await mountPane($)
  const shows = async () => JSON.stringify(await pane.drawn())
  for (let i = 1; i < PER_PAGE; i++) await pane.press({ key: 'nav:j' }) // row 1 → row 8
  expect(await shows()).toContain('1/2')
  await pane.press({ key: 'nav:k' }) // row 7
  await pane.press({ key: 'nav:j' }) // row 8
  expect(await shows()).toContain('1/2')
  await pane.press({ key: 'nav:j' }) // past the last row: page 2, first row
  expect(await shows()).toContain('2/2')
  await pane.press({ key: 'nav:j' }) // row 2 of page 2, the last
  await pane.press({ key: 'nav:j' }) // the end of the list: round to page 1, row 1
  expect(await shows()).toContain('1/2')
  await pane.press({ key: 'nav:k' }) // before the first row: round to the last page's last
  expect(await shows()).toContain('2/2')
  await pane.press({ key: 'nav:k' }) // row 1 of page 2
  expect(await shows()).toContain('2/2')
  await pane.press({ key: 'nav:k' }) // before it: page 1's last row
  expect(await shows()).toContain('1/2')
})

test('a stored list longer than KEEP is trimmed when read, not on the next write', async ($, on) => {
  disk(on)
  // Legacy rows (`path`, the shape before v0.2.0): a session that stored them is read as files.
  const over = Array.from({ length: KEEP + 8 }, (_, i) => ({ path: `/work/f${i + 1}.pdf`, label: `f${i + 1}.pdf`, at: i }))
  on('state.get', async () => ({ value: { value: over, version: 1 } }))
  const opened: { rows?: number }[] = []
  on('ui.open', async ($: unknown, e: { rows?: number }) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  await $.command.run({ command: 'files', args: '', origin: { kind: 'plugin', name: 'test' }, presentation: { isFullscreen: false, columns: 120 } })
  const tree = await drawPane($)
  expect(tree).toContain(`1/${KEEP / PER_PAGE}`)
  expect(opened[0]?.rows).toBe(PER_PAGE + 1)
})

test('with a PNG preview the dialog asks at most 22 rows, whatever the list length', async ($, on) => {
  const opened: { rows?: number }[] = []
  on('ui.open', async ($: unknown, e: { rows?: number }) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  await writeMany($, on, 40)
  await $.tool.call({ tool: 'Write', file_path: '/work/shot.png', content: 'x' })
  await $.command.run({ command: 'files', args: '', origin: { kind: 'plugin', name: 'test' }, presentation: { isFullscreen: false, columns: 120 } })
  const rows = opened[0]?.rows ?? 99
  expect(rows).toBe(PER_PAGE + 1 + IMAGE_ROWS + 1)
  expect(rows).toBeLessThanOrEqual(22)
  expect(await drawPane($)).toContain('"Image"')
})

test('a newest image that is not a PNG gets its button but no inline drawing', async ($, on) => {
  disk(on)
  on('tool.call', async () => ({ result: { content: [] } }))
  await $.tool.call({ tool: 'Write', file_path: '/work/shot.jpg', content: 'x' })
  const tree = await drawPane($)
  expect(tree).toContain('▪ shot.jpg')
  expect(tree).not.toContain('"Image"')
})

test('the status file is written per session, under the config dir', async ($, on) => {
  const written: string[] = []
  on('session.start', async () => ({ cwd: CWD }))
  on('command.register', async ($, e) => ({ value: { command: e.name } }))
  on('session.id', async () => ({ value: 'sess-a' }))
  on('env.get', async ($, e) => ({ value: e.name === 'CLAUDE_CONFIG_DIR' ? '/cfg' : undefined }))
  on('fs.write', async ($, e) => {
    written.push(e.path.replace(/\\/g, '/'))
    return { value: undefined }
  })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  expect(written.some(p => p.endsWith('/cfg/cockpit/sess-a.json'))).toBe(true)
})

test('"write 2 files and take a screenshot" counts 3', async ($, on) => {
  // Julian's session bfab1da0, replayed: two Writes, then Playwright's real answer, which names
  // the screenshot three times. The status file must say 3, the pane must list 3.
  const status: string[] = []
  disk(on, {}, [], status)
  const shot =
    '### Result\n- [Screenshot of viewport](.playwright-mcp\\google.png)\n### Ran Playwright code\n' +
    "```js\n// Screenshot viewport and save it as .playwright-mcp\\google.png\n" +
    "await page.screenshot({\n  path: '.playwright-mcp\\\\google.png',\n  scale: 'css',\n  type: 'png'\n});\n```"
  on('tool.call', async ($, e) => ({
    result: { content: e.tool === 'Write' ? [] : [{ type: 'text', text: shot }] },
  }))
  await $.tool.call({ tool: 'Write', file_path: 'E:\\Coding\\test-1.md', content: 'x' })
  await $.tool.call({ tool: 'Write', file_path: 'E:\\Coding\\test-2.md', content: 'x' })
  await $.tool.call({ tool: 'mcp__playwright__browser_take_screenshot', scale: 'css', filename: '.playwright-mcp/google.png' })
  expect(JSON.parse(status[status.length - 1] ?? '{}').files).toBe(3)
  const tree = await drawPane($)
  expect(tree.match(/"label":"▪ /g)?.length).toBe(3)
})

test('a relative screenshot that exists only under the project root is collected from a subfolder', async ($, on) => {
  // Playwright MCP saves relative to ITS root (the project), while the shell had cd'd below it.
  disk(on, {}, [], [], p => p.endsWith('/proj/shot.png'), { root: '/proj', cwd: '/proj/sub' })
  on('tool.call', async () => ({ result: { content: [{ type: 'text', text: '- [Screenshot of viewport](./shot.png)' }] } }))
  await $.tool.call({ tool: 'mcp__playwright__browser_take_screenshot', type: 'png' })
  expect(await drawPane($)).toContain('▪ shot.png')
})

test('a deleted file leaves the count on the next tool call, even one that collected nothing', async ($, on) => {
  const status: string[] = []
  const gone = new Set<string>()
  disk(on, {}, [], status, p => !gone.has(p.split('/').pop() ?? ''))
  on('tool.call', async () => ({ result: { content: [{ type: 'text', text: 'ok' }] } }))
  for (const n of ['a.pdf', 'b.pdf', 'c.pdf']) await $.tool.call({ tool: 'Write', file_path: `/work/${n}`, content: 'x' })
  expect(JSON.parse(status[status.length - 1] ?? '{}').files).toBe(3)
  gone.add('b.pdf')
  await $.tool.call({ tool: 'Bash', command: 'rm b.pdf', description: 'delete' })
  expect(JSON.parse(status[status.length - 1] ?? '{}').files).toBe(2)
})

test("the engine's own copy of an inline screenshot is not collected", () => {
  // The engine spills a result's image block to <session>/tool-results/mcp-playwright-blob-*.png
  // and names it in the result; the real file is the one Playwright saved.
  const text = '[Image: source: C:\\Users\\me\\.claude\\projects\\E--Coding\\s1\\tool-results\\mcp-playwright-blob-1791102611312-g5ctsr.png]'
  expect(pathsIn([{ type: 'text', text }])).toEqual([])
})

// ─── the session hub: files, links and folders in one list ───────────────────────────────────

test('KEEP is 48', () => {
  expect(KEEP).toBe(48)
})

test('tailOf: a file shows its folder, a link its host and port, a folder its parent path', () => {
  expect(tailOf('file', 'E:/Work/out/report.pdf')).toBe('out')
  expect(tailOf('link', 'https://claude.ai/artifact/abc123')).toBe('claude.ai')
  expect(tailOf('link', 'http://localhost:3030/admin')).toBe('localhost:3030')
  expect(tailOf('folder', 'E:/Work/.worktrees/feat-x')).toBe('E:/Work/.worktrees')
})

test('a stored legacy {path,label,at} is read as a file entry', async ($, on) => {
  disk(on)
  on('state.get', async () => ({ value: { value: [{ path: '/work/old.pdf', label: 'old.pdf', at: 1 }], version: 1 } }))
  const drawn = await drawPane($)
  expect(drawn).toContain('old.pdf')
})

test('a target produced again moves to the newest slot, mixed kinds', async ($, on) => {
  disk(on)
  const list = watchState(on)
  on('tool.call', async ($, e) => ({
    result: { content: [{ type: 'text', text: e.tool === 'Artifact' ? 'Published: https://claude.ai/artifact/a1' : '' }] },
  }))
  await $.tool.call({ tool: 'Write', file_path: '/work/a.md', content: 'x' })
  await $.tool.call({ tool: 'Artifact', file_path: '/x.html' })
  await $.tool.call({ tool: 'Write', file_path: '/work/b.md', content: 'x' })
  await $.tool.call({ tool: 'Artifact', file_path: '/x.html' }) // same URL again
  expect(list().map(e => `${e.kind}:${e.label}`)).toEqual(['file:a.md', 'file:b.md', 'link:claude.ai/artifact/a1'])
})

test('the status file counts files only, never links or folders', async ($, on) => {
  const writes: string[] = []
  disk(on, {}, [], writes)
  on('tool.call', async () => ({ result: { content: [{ type: 'text', text: 'Published: https://claude.ai/artifact/a1' }] } }))
  await $.tool.call({ tool: 'Write', file_path: '/work/a.md', content: 'x' })
  await $.tool.call({ tool: 'Artifact', file_path: '/x.html' })
  expect(JSON.parse(writes[writes.length - 1] ?? '{}').files).toBe(1)
})

// ─── linksIn ─────────────────────────────────────────────────────────────────────────────────

test('linksIn tool: the Artifact publish result and gh pr create output', () => {
  const artifact = 'Published https://claude.ai/artifact/01HXYZ (private). This session now watches it.'
  expect(linksIn(artifact, 'tool')).toEqual(['https://claude.ai/artifact/01HXYZ'])
  const gh = 'Creating pull request for feat/x into main in LolerHero/claude-cockpit\n\nhttps://github.com/LolerHero/claude-cockpit/pull/12\n'
  expect(linksIn(gh, 'tool')).toEqual(['https://github.com/LolerHero/claude-cockpit/pull/12'])
})

test('linksIn servers: the next dev banner yields its two addresses, registry URLs are left out', () => {
  const banner = '   ▲ Next.js 15.3.0\n   - Local:        http://localhost:3030\n   - Network:      http://192.168.178.42:3030\n\nnpm notice see https://registry.npmjs.org/-/notice\n ✓ Ready in 1.2s'
  expect(linksIn(banner, 'servers')).toEqual(['http://localhost:3030', 'http://192.168.178.42:3030'])
})

test('linksIn servers: a bare host:port is a link, and 0.0.0.0 becomes localhost', () => {
  expect(linksIn('Serving on 0.0.0.0:8000 (press CTRL+C)', 'servers')).toEqual(['http://localhost:8000'])
  expect(linksIn('listening at 127.0.0.1:5173/', 'servers')).toEqual(['http://127.0.0.1:5173/'])
})

test('linksIn reply: a bare link, a bullet and a markdown link count; a link in prose only with an open word', () => {
  const words = ['open', 'öffne', 'view']
  expect(linksIn('Done.\nhttps://claude.ai/artifact/a1\n', 'reply', words)).toEqual(['https://claude.ai/artifact/a1'])
  expect(linksIn('- [the report](https://claude.ai/artifact/a2)', 'reply', words)).toEqual(['https://claude.ai/artifact/a2'])
  expect(linksIn('Per the docs at https://nextjs.org/docs/app the route is static.', 'reply', words)).toEqual([])
  expect(linksIn('Öffne https://claude.ai/artifact/a3 zum Gegenlesen.', 'reply', words)).toEqual(['https://claude.ai/artifact/a3'])
})

test('linksIn strips trailing punctuation and de-duplicates', () => {
  expect(linksIn('see https://x.dev/a). Again: https://x.dev/a.', 'tool')).toEqual(['https://x.dev/a'])
})

// ─── foldersIn ───────────────────────────────────────────────────────────────────────────────

test('foldersIn command: mkdir with -p, quotes and several paths; git worktree add with and without -b', () => {
  expect(foldersIn('mkdir -p out/reports "E:/Work/my dir" && ls', 'command')).toEqual(['out/reports', 'E:/Work/my dir'])
  expect(foldersIn("git worktree add '../wt/feat-x' feat/x", 'command')).toEqual(['../wt/feat-x'])
  expect(foldersIn('git worktree add -b feat/y E:\\Work\\.worktrees\\feat-y main', 'command')).toEqual(['E:/Work/.worktrees/feat-y'])
  expect(foldersIn('git status; npm test', 'command')).toEqual([])
})

test('foldersIn reply: an absolute path alone on its line, with or without backticks; a path in prose or a relative one is not', () => {
  const reply = 'The worktree is here:\n`E:/Coding/.worktrees/hub/`\nand the report sits in E:/Coding/out which you can open.\nout/reports\n'
  expect(foldersIn(reply, 'reply')).toEqual(['E:/Coding/.worktrees/hub'])
})

// ─── the hooks: links and folders from Bash, deploy tools, the rebuild ──────────────────────

test('a dev server and a file from one Bash call are two entries of two kinds', async ($, on) => {
  disk(on, { 'report.pdf': 1_000_000 })
  const list = watchState(on)
  on('tool.call', async () => ({
    result: { stdout: 'wrote /work/report.pdf\n- Local: http://localhost:3030\n', stderr: '', interrupted: false },
  }))
  await $.tool.call({ tool: 'Bash', command: 'npm run build && npm run dev' })
  expect(list().map(e => `${e.kind}:${e.label}:${e.tail}`)).toEqual(['file:report.pdf:work', 'link:localhost:3030:localhost:3030'])
})

test('gh pr create output yields its URL; a plain Bash with a docs URL yields nothing', async ($, on) => {
  disk(on)
  const list = watchState(on)
  on('tool.call', async ($, e) => ({
    result: { stdout: String((e as { command?: unknown }).command).startsWith('gh') ? 'https://github.com/o/r/pull/7\n' : 'see https://docs.npmjs.com/x\n', stderr: '' },
  }))
  await $.tool.call({ tool: 'Bash', command: 'npm install' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
  expect(list().map(e => e.target)).toEqual(['https://github.com/o/r/pull/7'])
})

test('mkdir collects the folder once it exists; a failed mkdir collects nothing', async ($, on) => {
  disk(on, {}, [], [], p => p !== '/work/never')
  const list = watchState(on)
  on('tool.call', async ($, e) =>
    String((e as { command?: unknown }).command).includes('never') ? { result: { stdout: '', stderr: 'denied' }, isError: true } : { result: { stdout: '' } },
  )
  await $.tool.call({ tool: 'Bash', command: 'mkdir -p /work/out/reports' })
  await $.tool.call({ tool: 'Bash', command: 'mkdir /work/never' })
  expect(list().map(e => `${e.kind}:${e.target}`)).toEqual(['folder:/work/out/reports'])
})

test('a deploy tool whose result names a URL yields a link', async ($, on) => {
  disk(on)
  const list = watchState(on)
  on('tool.call', async () => ({ result: { content: [{ type: 'text', text: 'deployed: https://kims-catering-norderstedt.de' }] } }))
  await $.tool.call({ tool: 'mcp__kaizen-vps__deploy_catering' })
  expect(list().map(e => e.target)).toEqual(['https://kims-catering-norderstedt.de'])
})

test('an empty list is rebuilt with artifact links and reply links too', async ($, on) => {
  disk(on)
  const list = watchState(on)
  on('session.messages', async () => ({
    value: [
      {
        role: 'assistant',
        text: 'Here it is:\nhttps://claude.ai/artifact/r1',
        toolUses: [
          { tool_use_id: 't1', tool: 'Artifact', input: {}, result: { content: [{ type: 'text', text: 'Published https://claude.ai/artifact/p1' }] }, text: 'Published https://claude.ai/artifact/p1' },
          { tool_use_id: 't2', tool: 'Write', input: { file_path: '/work/a.md' }, result: {}, text: 'ok' },
        ],
      },
    ],
  }))
  on('session.start', async () => ({ cwd: CWD }))
  on('command.register', async ($, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  expect(list().map(e => e.target).sort()).toEqual(['/work/a.md', 'https://claude.ai/artifact/p1', 'https://claude.ai/artifact/r1'])
})

// ─── the reply as it streams ─────────────────────────────────────────────────────────────────

test('a reply link on its own line is collected as it streams; prose links need an open word', async ($, on) => {
  disk(on)
  const list = watchState(on)
  on('classic.MessageDisplay', async () => ({})) // the bottom of the chain: no settings hook beneath
  const flush = (index: number, delta: string, final = false) =>
    $.classic.MessageDisplay({ turn_id: 't', message_id: 'm1', index, final, delta })
  await flush(0, 'The page is published.\n')
  await flush(1, 'https://claude.ai/artifact/s1\nDocs: https://nextjs.org/docs explain it.\n')
  await flush(2, 'View https://claude.ai/artifact/s2 when you can.', true)
  expect(list().map(e => e.target)).toEqual(['https://claude.ai/artifact/s1', 'https://claude.ai/artifact/s2'])
})

test('a URL on the final, mid-line flush is collected whole', async ($, on) => {
  disk(on)
  const list = watchState(on)
  on('classic.MessageDisplay', async () => ({})) // the bottom of the chain: no settings hook beneath
  await $.classic.MessageDisplay({ turn_id: 't', message_id: 'm2', index: 0, final: false, delta: 'Open it:\n' })
  await $.classic.MessageDisplay({ turn_id: 't', message_id: 'm2', index: 1, final: true, delta: 'https://claude.ai/artifact/end' })
  expect(list().map(e => e.target)).toEqual(['https://claude.ai/artifact/end'])
})

test('a reply listing files on their own lines adds file rows; a folder stays a folder, a file in prose is skipped', async ($, on) => {
  disk(on)
  const list = watchState(on)
  on('classic.MessageDisplay', async () => ({})) // the bottom of the chain: no settings hook beneath
  await $.classic.MessageDisplay({ turn_id: 't', message_id: 'm4', index: 0, final: true,
    delta: 'Here they are:\nE:\\Coding\\tmp\\note-01.md\n`E:/Coding/tmp/shot.png`\nE:/Coding/tmp\nSee E:/Coding/tmp/note-02.md for more.\nE:/Coding/tmp/script.ts\n' })
  expect(list().map(e => [e.kind, e.target]).sort()).toEqual([
    ['file', 'E:/Coding/tmp/note-01.md'],
    ['file', 'E:/Coding/tmp/shot.png'],
    ['folder', 'E:/Coding/tmp'],
  ])
})

test('openWords from the option: a custom word counts, the default ones no longer do', { options: { openWords: 'schau' } }, async ($, on) => {
  disk(on)
  const list = watchState(on)
  on('classic.MessageDisplay', async () => ({})) // the bottom of the chain: no settings hook beneath
  await $.classic.MessageDisplay({ turn_id: 't', message_id: 'm3', index: 0, final: true, delta: 'Schau https://a.dev/1 an.\nOpen https://a.dev/2 too.\n' })
  expect(list().map(e => e.target)).toEqual(['https://a.dev/1'])
})

test('a folder path alone on a reply line is collected when it is a directory', async ($, on) => {
  disk(on)
  const list = watchState(on)
  on('classic.MessageDisplay', async () => ({})) // the bottom of the chain: no settings hook beneath
  await $.classic.MessageDisplay({ turn_id: 't', message_id: 'm4', index: 0, final: true, delta: 'Worktree:\n/work/wt/feat\n' })
  expect(list().map(e => `${e.kind}:${e.target}`)).toEqual(['folder:/work/wt/feat'])
})

// ─── the rows: a marker, a tail, and `o` for the folder ──────────────────────────────────────

test('rows carry a kind marker and a muted tail', async ($, on) => {
  disk(on)
  on('tool.call', async () => ({ result: { content: [{ type: 'text', text: 'Published https://claude.ai/artifact/a1' }] } }))
  await $.tool.call({ tool: 'Write', file_path: '/work/out/report.pdf', content: 'x' })
  await $.tool.call({ tool: 'Artifact', file_path: '/x.html' })
  const drawn = await drawPane($)
  expect(drawn).toContain('↗ claude.ai/artifact/a1')
  expect(drawn).toContain('▪ report.pdf')
  expect(drawn).toContain('"out"')
})

test('the empty state names the hub, not files', async ($, on) => {
  disk(on)
  expect(await drawPane($)).toContain('Nothing to open yet this session.')
})

test('o on a file opens its folder; on a folder, itself; on a link, a toast', async ($, on) => {
  const ran: string[][] = []
  const toasts: string[] = []
  disk(on, {}, [], [], () => true, { root: CWD, cwd: CWD }, WINDOWS)
  on('process.run', async ($: unknown, e: { argv: readonly string[] }) => {
    ran.push([...e.argv])
    return { value: exited(0) }
  })
  on('ui.toast', async ($: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.close', async () => ({ value: undefined }))
  on('tool.call', async ($, e) =>
    e.tool === 'Artifact' ? { result: { content: [{ type: 'text', text: 'https://claude.ai/artifact/a1' }] } } : { result: { stdout: '' } },
  )
  await $.tool.call({ tool: 'Artifact', file_path: '/x.html' })
  await $.tool.call({ tool: 'Bash', command: 'mkdir E:/Work/out' })
  await $.tool.call({ tool: 'Write', file_path: 'E:/Work/out/report.pdf', content: 'x' })
  const pane = await mountPane($)
  await pane.press({ key: 'nav:o' }) // row 0 = report.pdf
  expect(ran[0]).toEqual(['cmd', '/c', 'start', '', 'E:\\Work\\out'])
  await pane.press({ key: 'nav:j' })
  await pane.press({ key: 'nav:o' }) // row 1 = the folder
  expect(ran[1]).toEqual(['cmd', '/c', 'start', '', 'E:\\Work\\out'])
  await pane.press({ key: 'nav:j' })
  await pane.press({ key: 'nav:o' }) // row 2 = the link
  expect(toasts).toEqual(['Links have no folder'])
  expect(ran.length).toBe(2)
})

test('a link opens through the URL handler on Windows, not cmd start', async ($, on) => {
  const ran: string[][] = []
  disk(on, {}, [], [], () => true, { root: CWD, cwd: CWD }, WINDOWS)
  on('process.run', async ($: unknown, e: { argv: readonly string[] }) => {
    ran.push([...e.argv])
    return { value: exited(0) }
  })
  on('ui.close', async () => ({ value: undefined }))
  on('tool.call', async () => ({ result: { content: [{ type: 'text', text: 'https://claude.ai/artifact/a1?x=1&y=2' }] } }))
  await $.tool.call({ tool: 'Artifact', file_path: '/x.html' })
  await (await mountPane($)).press({ key: 'row:0' })
  expect(ran[0]).toEqual(['rundll32', 'url.dll,FileProtocolHandler', 'https://claude.ai/artifact/a1?x=1&y=2'])
})

// ─── wrap-around (Julian, 2026-10-04) ────────────────────────────────────────────────────────
// The harness cannot read the focus ring, and the test's own import of register.tsx is a second
// module instance, not the one the harness runs (measured: its counters never move). The drawn
// tree carries the position instead: `autoFocus` sits on the row the pane holds, `n/N` names the page.
const cursorOf = async (pane: any) => {
  const buttons = await pane.findAll({ type: 'Button' })
  const row = buttons.find((b: any) => b.props?.autoFocus)?.props?.key ?? 'row:0'
  const pages = /"(\d+)\/\d+"/.exec(JSON.stringify(await pane.drawn()))
  return { page: pages ? Number(pages[1]) - 1 : 0, focused: Number(row.split(':')[1]) }
}

test('on one page, k from the first row wraps to the last row and j from the last to the first', async ($, on) => {
  await writeMany($, on, 3)
  const pane = await mountPane($)
  expect(await cursorOf(pane)).toEqual({ page: 0, focused: 0 })
  await pane.press({ key: 'nav:k' })
  expect(await cursorOf(pane)).toEqual({ page: 0, focused: 2 })
  await pane.press({ key: 'nav:j' })
  expect(await cursorOf(pane)).toEqual({ page: 0, focused: 0 })
})

test('across pages, k from the first row lands on the last entry of the last page and j from there on page 1 row 1', async ($, on) => {
  await writeMany($, on, 10) // two pages: 8 + 2
  const pane = await mountPane($)
  await pane.press({ key: 'nav:k' })
  expect(await cursorOf(pane)).toEqual({ page: 1, focused: 1 })
  expect(JSON.stringify(await pane.drawn())).toContain('2/2')
  await pane.press({ key: 'nav:j' })
  expect(await cursorOf(pane)).toEqual({ page: 0, focused: 0 })
})

test('h on page 1 turns to the last page, l on the last page to page 1', async ($, on) => {
  await writeMany($, on, 10)
  const pane = await mountPane($)
  await pane.press({ key: 'nav:h' })
  expect(await cursorOf(pane)).toEqual({ page: 1, focused: 0 })
  await pane.press({ key: 'nav:l' })
  expect(await cursorOf(pane)).toEqual({ page: 0, focused: 0 })
})

// ─── fuzzy ───────────────────────────────────────────────────────────────────────────────────

test('fuzzy: subsequence match, consecutive runs and word starts score higher, ties go to the newer entry', () => {
  const e = (label: string, tail: string, at: number) => ({ label, tail, at })
  const entries = [e('home-1440.png', 'shots', 1), e('report-2026.pdf', 'out', 2), e('Rechnung-März.pdf', 'invoices', 3)]
  expect(fuzzy('rep', entries).map(x => x.label)).toEqual(['report-2026.pdf', 'Rechnung-März.pdf'])
  expect(fuzzy('pdf', entries).map(x => x.label)).toEqual(['Rechnung-März.pdf', 'report-2026.pdf']) // same score, newer first
  expect(fuzzy('xyz', entries)).toEqual([])
  expect(fuzzy('', entries).map(x => x.at)).toEqual([3, 2, 1])
  expect(fuzzy('inv', entries).map(x => x.label)).toEqual(['Rechnung-März.pdf']) // the tail counts
  expect(fuzzyScore('3030', 'localhost:3030 localhost:3030')).toBeGreaterThan(fuzzyScore('3030', 'home-3-0-3-0.png')!)
})

// ─── filter mode: f, the Input, Enter, Esc ───────────────────────────────────────────────────
// Measured in a terminal (Julian, 2026-10-04): while the Input has focus the Button hotkeys do not
// fire, so `f` can draw a field in the pane. The harness drives the Input by key, not by keystroke.

test('f draws the search Input; typing filters the rows; Enter opens the top match and closes the pane', async ($, on) => {
  const ran: string[][] = []
  const closed: string[] = []
  disk(on, {}, [], [], () => true, { root: CWD, cwd: CWD }, WINDOWS)
  on('process.run', async ($: unknown, e: { argv: readonly string[] }) => {
    ran.push([...e.argv])
    return { value: exited(0) }
  })
  on('ui.close', async ($: unknown, e: { id: string }) => {
    closed.push(e.id)
    return { value: undefined }
  })
  on('tool.call', async () => ({ result: { content: [] } }))
  for (const name of ['home-1440.png', 'report-2026.pdf', 'notes.md']) {
    await $.tool.call({ tool: 'Write', file_path: `/work/${name}`, content: 'x' })
  }
  const pane = await mountPane($)
  expect(await pane.find({ type: 'Input' })).toBeUndefined()
  await pane.press({ key: 'nav:f' })
  expect((await pane.find({ type: 'Input' }))?.props?.key).toBe('q')
  await pane.input({ key: 'q', text: 'rep', kind: 'change' })
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('report-2026.pdf')
  expect(drawn).not.toContain('notes.md')
  await pane.input({ key: 'q', text: 'rep' }) // Enter
  expect(ran[0]?.[4]).toBe('\\work\\report-2026.pdf')
  expect(closed).toEqual(['files'])
})

test('no match says so; Enter on no match opens nothing', async ($, on) => {
  const ran: string[][] = []
  disk(on)
  on('process.run', async ($: unknown, e: { argv: readonly string[] }) => {
    ran.push([...e.argv])
    return { value: exited(0) }
  })
  on('tool.call', async () => ({ result: { content: [] } }))
  await $.tool.call({ tool: 'Write', file_path: '/work/a.md', content: 'x' })
  const pane = await mountPane($)
  await pane.press({ key: 'nav:f' })
  await pane.input({ key: 'q', text: 'zzz', kind: 'change' })
  expect(JSON.stringify(await pane.drawn())).toContain('No match for ‹zzz›.')
  await pane.input({ key: 'q', text: 'zzz' })
  expect(ran).toEqual([])
})

test('while filtering, the hint says Esc goes back to the list and the f key is gone', async ($, on) => {
  // The engine raises `ui.close` for the person's Esc (closeOnEscape); the module's hook answers
  // for it while filtering, without `next`, and the pane stays. The test `$.ui` on 2.1.289 has
  // no `close` (measured: render, scroll, focus, press, input, select, mount), so that path is
  // the manual check's; what is drawn around it is pinned here.
  disk(on)
  on('tool.call', async () => ({ result: { content: [] } }))
  await $.tool.call({ tool: 'Write', file_path: '/work/a.md', content: 'x' })
  const pane = await mountPane($)
  await pane.press({ key: 'nav:f' })
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('Esc back')
  expect(drawn).not.toContain('"hotkey":"f"')
  expect(drawn).toContain('▪ a.md') // an empty query is the whole list
})

test('the PNG preview hides while a filter is active', async ($, on) => {
  disk(on)
  on('tool.call', async () => ({ result: { content: [] } }))
  await $.tool.call({ tool: 'Write', file_path: '/work/shot.png', content: 'x' })
  const pane = await mountPane($)
  expect(await pane.find({ type: 'Image' })).toBeDefined()
  await pane.press({ key: 'nav:f' })
  expect(await pane.find({ type: 'Image' })).toBeUndefined()
})
