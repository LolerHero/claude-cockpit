import { test, expect } from 'claude-code/testing'

import { pathsIn, hotkeyFor } from './register.tsx'
import { paletteOf, PALETTES } from '../palettes.js'

// The test `$` carries no `$.session.cwd()` on 2.1.288 (measured: "not a function"), so the
// session starts in a fixed directory; nothing in `session.start` reads it.
const CWD = '/work'

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
  expect(names).toContain('files')
  expect(names).toContain('shots')
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
