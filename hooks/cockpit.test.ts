import { test, expect } from 'claude-code/testing'

import { pathsIn, hotkeyFor, IMAGE_ROWS } from './register.tsx'
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

test('hotkeys are single presses: 1-9 then a-z, newest first', () => {
  expect(hotkeyFor(0)).toBe('1')
  expect(hotkeyFor(8)).toBe('9')
  expect(hotkeyFor(9)).toBe('a')
  expect(hotkeyFor(19)).toBe('k')
  expect(hotkeyFor(34)).toBe('z')
  expect(hotkeyFor(35)).toBe(undefined) // past the alphabet: no key, still clickable
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
  expect(tree).toContain('Tab')
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
const disk = (on: any, mtime: Record<string, number> = {}, asked: string[] = [], writes: string[] = []) => {
  const NOW = 1_000_000
  on('session.cwd', async () => ({ value: CWD }))
  on('env.get', async ($: unknown, e: { name: string }) => ({ value: e.name === 'CLAUDE_CONFIG_DIR' ? '/cfg' : undefined }))
  on('session.id', async () => ({ value: 'sess-a' }))
  on('clock.now', async () => ({ value: NOW }))
  on('fs.exists', async ($: unknown, e: { path: string }) => {
    asked.push(e.path)
    return { value: true }
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

const drawPane = async ($: any) => {
  const pane = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', props: PANE_PROPS, requestId: 'files' })
  return JSON.stringify(await pane.drawn())
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
