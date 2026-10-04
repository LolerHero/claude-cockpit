import { test, expect } from 'claude-code/testing'

import { pathsIn, IMAGE_ROWS, KEEP, PER_PAGE } from './register.tsx'
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
  // The manifest's picker value arrives in `register(on, options)`; the pane paints `subtle`
  // from it, so the one thing to pin is that the value is honoured, not the drawing.
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
  expect(tree).toContain('Open shot.png')
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
) => {
  const NOW = 1_000_000
  on('session.cwd', async () => ({ value: dirs.cwd }))
  on('session.root', async () => ({ value: dirs.root }))
  on('env.get', async ($: unknown, e: { name: string }) => ({ value: e.name === 'CLAUDE_CONFIG_DIR' ? '/cfg' : undefined }))
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
    value: { kind: 'file', size: 10, mtimeMs: mtime[e.path.split(/[\\/]/).pop() ?? ''] ?? NOW, isLink: false },
  }))
  on('fs.read', async () => ({ value: { base64: PNG } }))
}

const mountPane = ($: any) =>
  $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', props: PANE_PROPS, requestId: 'files' })

const drawPane = async ($: any) => JSON.stringify(await (await mountPane($)).drawn())

test('a Write is collected at its exact path, spaces and all', async ($, on) => {
  const asked: string[] = []
  disk(on, {}, asked)
  on('tool.call', async () => ({ result: { content: [] } }))
  // Rooted on every platform: a `C:\` path is relative on Linux, and the engine resolves it
  // against the session. Native separators and a drive by the time a hook sees it on Windows;
  // the point is the space survived, whole.
  await $.tool.call({ tool: 'Write', file_path: '/Users/John Smith/report.pdf', content: 'x' })
  expect(asked.some(p => p.replace(/\\/g, '/').endsWith('/Users/John Smith/report.pdf'))).toBe(true)
  expect(await drawPane($)).toContain('Open report.pdf')
})

test('a file a command only mentions is not collected; one it produced is', async ($, on) => {
  // `git status` prints README.md, which exists but was not touched: it is not this session's.
  disk(on, { 'README.md': 0 })
  on('tool.call', async () => ({
    result: { content: [{ type: 'text', text: ' M README.md\nwrote /work/out/report.pdf' }] },
  }))
  await $.tool.call({ tool: 'Bash', command: 'make report && git status --short', description: 'build the report' })
  const tree = await drawPane($)
  expect(tree).toContain('Open report.pdf')
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
  expect(first.indexOf(`Open f${KEEP + 1}.pdf`)).toBeLessThan(first.indexOf('Open f1.pdf'))
  expect(first.indexOf('Open f1.pdf')).toBeLessThan(first.indexOf(`Open f${KEEP}.pdf`))
  for (let p = 1; p < KEEP / PER_PAGE; p++) await pane.press({ key: 'nav:l' })
  const last = JSON.stringify(await pane.drawn())
  expect(last).toContain('Open f3.pdf')
  expect(last).not.toContain('Open f2.pdf') // the oldest untouched one is the one dropped
})

// ─── pages and keys ──────────────────────────────────────────────────────────────────────────

const writeMany = async ($: any, on: any, n: number) => {
  disk(on)
  on('tool.call', async () => ({ result: { content: [] } }))
  for (let i = 1; i <= n; i++) await $.tool.call({ tool: 'Write', file_path: `/work/f${i}.pdf`, content: 'x' })
}

const labels = (tree: string) => [...tree.matchAll(/"label":"Open (f\d+)\.pdf"/g)].map(m => m[1])

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
  await pane.press({ key: 'nav:l' }) // past the last page: stays
  tree = JSON.stringify(await pane.drawn())
  expect(labels(tree)).toEqual(['f4', 'f3', 'f2', 'f1'])
  expect(tree).toContain('3/3')
  await pane.press({ key: 'nav:h' })
  tree = JSON.stringify(await pane.drawn())
  expect(tree).toContain('2/3')
})

// Two rows read „button.md“ and nothing said whether they were one file or two (Julian,
// 2026-10-04). One file reached by two spellings of its drive is one row; two files with one
// name each say their folder.
test('a drive letter in either case is one file, not two', async ($, on) => {
  disk(on)
  on('tool.call', async () => ({ result: { content: [] } }))
  await $.tool.call({ tool: 'Write', file_path: 'e:/work/design/button.md', content: 'x' })
  await $.tool.call({ tool: 'Write', file_path: 'E:/work/design/button.md', content: 'y' })
  expect((await drawPane($)).match(/Open button\.md/g)?.length).toBe(1)
})

test('two files with the same name each show their folder', async ($, on) => {
  disk(on)
  on('tool.call', async () => ({ result: { content: [] } }))
  await $.tool.call({ tool: 'Write', file_path: '/work/a/contracts/button.md', content: 'x' })
  await $.tool.call({ tool: 'Write', file_path: '/work/b/design/button.md', content: 'x' })
  await $.tool.call({ tool: 'Write', file_path: '/work/b/notes.md', content: 'x' })
  const tree = await drawPane($)
  expect(tree).toContain('Open button.md · contracts')
  expect(tree).toContain('Open button.md · design')
  expect(tree).toContain('Open notes.md"') // a unique name stays bare
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
  expect(tree).toContain('Open shot.png')
  expect(tree).toContain('Open f1.pdf')
  expect(tree).not.toContain('"type":"Image"')
})

// Opening a file hands the person to another app; coming back to an open pane they then have to
// dismiss is the wrong way round (Julian, 2026-10-04). A failed open keeps the pane to pick again.
const pressOpen = async ($: any, on: any, exitCode: number) => {
  const closed: string[] = []
  const toasts: string[] = []
  on('process.run', async () => ({ value: { exitCode, stdout: '', stderr: '' } }))
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
  expect(keys).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', 'j', 'k', 'h', 'l'])
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
  await pane.press({ key: 'nav:j' }) // the end of the list: stays
  expect(await shows()).toContain('2/2')
  await pane.press({ key: 'nav:k' })
  await pane.press({ key: 'nav:k' }) // before the first row: page 1's last
  expect(await shows()).toContain('1/2')
})

test('a stored list longer than KEEP is trimmed when read, not on the next write', async ($, on) => {
  disk(on)
  const forty = Array.from({ length: 40 }, (_, i) => ({ path: `/work/f${i + 1}.pdf`, label: `f${i + 1}.pdf`, at: i }))
  on('state.get', async () => ({ value: { value: forty, version: 1 } }))
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
  expect(tree).toContain('Open shot.jpg')
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
  expect(tree.match(/"label":"Open /g)?.length).toBe(3)
})

test('a relative screenshot that exists only under the project root is collected from a subfolder', async ($, on) => {
  // Playwright MCP saves relative to ITS root (the project), while the shell had cd'd below it.
  disk(on, {}, [], [], p => p.endsWith('/proj/shot.png'), { root: '/proj', cwd: '/proj/sub' })
  on('tool.call', async () => ({ result: { content: [{ type: 'text', text: '- [Screenshot of viewport](./shot.png)' }] } }))
  await $.tool.call({ tool: 'mcp__playwright__browser_take_screenshot', type: 'png' })
  expect(await drawPane($)).toContain('Open shot.png')
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
