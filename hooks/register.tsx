// cockpit — a pane of what this session made, and the figures the status line needs.
//
//   Opus 5.5 │ Coding │ main* │ ▪▪▪▪▪                          3  ·  1h 20m   ← status line
//
//   1 Open 2026-10-03-report.pdf        ← the pane: /files, /shots, or ctrl+x f
//   2 Open home-1440.png
//
// THE PANE: files a tool wrote or produced this session, newest first, one key each. Only things
// a person opens (documents, images, archives) — never source, which belongs in the editor.
// THE STATUS FILE: the status line is a separate Node process and cannot measure the terminal or
// count files; this module publishes both to <config dir>/cockpit/<session id>.json on every change.
//
// The hint line under the prompt is left to the engine. Tried and dropped on 2.1.288: the hint
// prop carries only the coaching text, the mode words are a pill no hook sees, and a rewritten
// hint is drawn as its own element even when empty, between two separators.

import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface } from 'claude-code'

import type { Doc } from '../types'
import { paletteOf } from '../palettes.js'

const PANE = 'files'
const KEEP = 10 // with the 10-row image preview the dialog stays ~22 rows, inside a normal window
const INLINE_MAX_BYTES = 400_000 // a tree carries bounded text; a big PNG gets the button alone
export const IMAGE_ROWS = 10 // the inline preview's height in cells; `openPane` asks room for it

// The key reaches the pane through `/files`, not a Button `action`: ~/.claude/keybindings.json
// binds `ctrl+x f` to `command:files` in the Chat context (setup.mjs writes that binding).

const files = atom({ plugin: 'cockpit', key: 'files' } as const, [])

// Module-level: a reload starts at 0 until the next draw measures again; the status line then
// falls back to its own width sources.
let columns = 0

// `$.env`, never `process.env`: the module runs in an environment of its own, with no Node.
const configDir = async ($: EngineInterface) => {
  const set = await $.env.get('CLAUDE_CONFIG_DIR').catch(() => null)
  if (set) return set
  const home = (await $.env.get('USERPROFILE').catch(() => null)) ?? (await $.env.get('HOME').catch(() => null))
  return home ? `${home}/.claude` : null
}

// One file per session (`cockpit/<session id>.json`, the id the status line's payload carries as
// `session_id`), so two open sessions never draw each other's count or width. Never rejects: it
// runs un-awaited from a render, where a rejection has no one to land on.
// ponytail: one ~40-byte file per session, never pruned; prune by age if the folder ever matters.
const publish = async ($: EngineInterface) => {
  try {
    const dir = await configDir($)
    const id = await $.session.id()
    if (!dir || !/^[\w-]+$/.test(id)) return
    const docs = await read($, files)
    await $.fs.write(`${dir}/cockpit/${id}.json`, JSON.stringify({ files: docs.length, columns }))
  } catch {
    // the status line falls back to its own width sources and omits the count
  }
}

// ─── what this session made ──────────────────────────────────────────────────────────────────

// Things a person opens, not things a person greps. Deliberately NOT .ts/.py/.json — source
// belongs in the editor, and listing it buries the one file they wanted among forty imports.
const OPENABLE = 'png|jpe?g|webp|gif|svg|pdf|docx?|xlsx?|pptx?|csv|md|html?|zip'

// Absolute OR relative: Playwright answers `./shot.png`, and an absolute-only pattern silently
// found nothing. The separator classes take a RUN, because JSON.stringify escapes a Windows path
// and a single-separator branch eats the drive letter (`C:/Users/…` → `/Users/…`). Names take any
// letter (`Rechnung-März.pdf`), not just ASCII. ponytail: a space ends a path in free text, so
// `my report.pdf` in a command's output reads as `report.pdf`; the mtime check in `collect`
// drops it unless the call produced that file. A Write never goes through this pattern.
const FILE_PATH = new RegExp(
  String.raw`(?:[A-Za-z]:[\\/]+|\.{0,2}[\\/]+)?[\p{L}\p{N}_.\-][\p{L}\p{N}_.\-\\/]*\.(?:${OPENABLE})`,
  'giu',
)
const IS_OPENABLE = new RegExp(String.raw`\.(?:${OPENABLE})$`, 'i')

const isAbsolute = (p: string) => /^(?:[A-Za-z]:\/|\/)/.test(p)

export const pathsIn = (value: unknown, cwd?: string): string[] => {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  const found = (text.match(FILE_PATH) ?? []).map(p => p.replace(/[\\/]+/g, '/').replace(/^\.\//, ''))
  const base = cwd?.replace(/\\/g, '/').replace(/\/+$/, '')
  // De-duplicated AFTER normalising: one file named in several escapings (Playwright's link,
  // comment and code) is one path, not three.
  return [...new Set(found.map(p => (isAbsolute(p) || !base ? p : `${base}/${p}`)))]
}

const label = (path: string) => path.split('/').pop()?.slice(0, 40) ?? 'file'
// PNG only: the terminal's Image takes PNG data, and anything else refuses the WHOLE pane.
const isPng = (path: string) => /\.png$/i.test(path)

// A hotkey is ONE digit or ONE lowercase letter, so there is no two-press scheme to build:
// 1–9 then a–z is 35 single-press slots, more than KEEP will ever hold.
export const hotkeyFor = (i: number): string | undefined => {
  if (i < 9) return String(i + 1)
  const letter = i - 9
  return letter < 26 ? String.fromCharCode(97 + letter) : undefined
}

// Top level, not nested in `register`: the validator only traces `$` into a function declared at
// the top of the file, and refuses a module that hands it to a closure it cannot follow.
// `since`: keep only files modified after it, so a path a command merely printed (`git status`
// listing README.md) is not taken for one it produced. 2 s of slack for coarse file-system clocks.
const collect = async ($: EngineInterface, paths: string[], since?: number) => {
  const onDisk: string[] = []
  for (const path of paths) {
    if (!(await $.fs.exists(path).catch(() => false))) continue
    if (since !== undefined) {
      const stat = await $.fs.stat(path).catch(() => null)
      if (!stat || stat.mtimeMs < since - 2000) continue
    }
    onDisk.push(path)
  }
  if (!onDisk.length) return
  const at = await $.clock.now()
  await update($, files, list => {
    // A path produced again moves to the newest slot: a regenerated file is this session's latest
    // output, and left in its old place a full list drops it on the next new file.
    const kept = list.filter(d => !onDisk.includes(d.path))
    return [...kept, ...onDisk.map(path => ({ path, label: label(path), at }))].slice(-KEEP)
  })
  await publish($)
}

// Open as a dialog: it takes the keyboard at once (so a hotkey works without `ctrl+x tab`), Esc
// closes it, and toasts wait behind it rather than landing on the list being picked from.
// `rows` is what makes the arrows walk the list: a dialog tall enough to show whole has nothing
// to scroll, and while it has, the engine spends the arrows on scrolling (measured 2026-10-03:
// opened a third tall, a 20-row image box made the list scroll and the arrows dead).
const openPane = async ($: EngineInterface) => {
  const list = await read($, files)
  const newest = list[list.length - 1]
  const rows = Math.max(1, list.length) + 1 + (newest && isPng(newest.path) ? IMAGE_ROWS + 1 : 0)
  await $.ui.open({ id: PANE, title: 'Files', focus: true, closeOnEscape: true, holdToasts: true, rows })
}

// The host's own opener, no shell. Windows: `cmd /c start "" <path>` — the empty string is
// `start`'s title argument, without it a quoted path becomes the title. macOS: `open`. Linux:
// `xdg-open`. A failure says so: a silent dead press is the worst outcome for a button.
const openerFor = async ($: EngineInterface, path: string): Promise<string[]> => {
  const os = ((await $.env.get('OS').catch(() => null)) ?? '').toLowerCase()
  if (os.includes('windows') || (await $.env.get('USERPROFILE').catch(() => null))) {
    return ['cmd', '/c', 'start', '', path.replace(/\//g, '\\')]
  }
  const uname = await $.process.run(['uname'], { timeoutMs: 2000 }).catch(() => null)
  return [(uname?.stdout ?? '').trim() === 'Darwin' ? 'open' : 'xdg-open', path]
}

export const register: Register = (on, options) => {
  const palette = paletteOf(options.palette)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'files', description: 'Open a file this session produced' })
    await publish($)
    return started
  })

  on('command.run', { command: 'files' }, async $ => {
    await openPane($)
    return {} // silent: the pane itself is the answer
  })

  // A Write always names the file it wrote, absolute: taken as is, spaces and all.
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    const path = e.file_path?.replace(/\\/g, '/')
    if (ran.deny === undefined && ran.isError !== true && path && IS_OPENABLE.test(path)) {
      await collect($, [path])
    }
    return ran
  })

  // Everything else: read the answer, keep what is openable AND on disk. Bash is here because
  // the scripts that produce the real artefacts — invoices, reports — are run, not written.
  for (const tool of [
    'Bash',
    'mcp__playwright__browser_take_screenshot',
    'mcp__claude-in-chrome__computer',
    'mcp__plugin_figma_figma__get_screenshot',
  ]) {
    on('tool.call', { tool }, async ($, e, next) => {
      const since = await $.clock.now()
      const ran = await next(e)
      if (ran.deny !== undefined || ran.isError === true) return ran
      await collect($, pathsIn(ran, await $.session.cwd()), since)
      return ran
    })
  }

  // No band of its own: the hook only measures the width for the status line, then lets the
  // engine draw whatever belongs there.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const width = e.viewport?.columns ?? 0
    if (width && width !== columns) {
      columns = width
      void publish($)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const all = await read($, files)

    // Only what is still on disk: a file can be deleted or moved after it was collected, and a
    // button that opens nothing reads as the mod being broken rather than as a missing file.
    const checked = await Promise.all(
      all.map(async doc => ((await $.fs.exists(doc.path).catch(() => false)) ? doc : null)),
    )
    const list = checked.filter((doc): doc is Doc => doc !== null)

    if (!list.length) {
      return (
        <Box flexDirection="column">
          <Text color={palette.subtle}>Nothing written yet this session.</Text>
        </Box>
      )
    }

    const newest = list[list.length - 1]

    const open = (path: string) => () => {
      void openerFor($, path)
        .then(cmd => $.process.run(cmd))
        .then(r => {
          if (r.exitCode !== 0) $.ui.toast(`could not open ${label(path)} (exit ${r.exitCode})`)
        })
        .catch(() => $.ui.toast(`could not open ${label(path)}`))
    }

    let inline = null
    if (e.surface === 'terminal' && isPng(newest.path)) {
      // Resolved here, not above: `Image` exists only in the terminal's element table, and
      // narrowing on e.surface is what hands it over. A module has no element globals.
      const { Image } = $.ui.resolve(e)
      const stat = await $.fs.stat(newest.path).catch(() => null)
      if (stat && stat.size <= INLINE_MAX_BYTES) {
        const file = await $.fs.read(newest.path, { as: 'bytes' }).catch(() => null)
        if (file) {
          // A fixed, small box: it is what `openPane` asks rows for, and a terminal cell is about
          // twice as tall as wide, so 3 columns a row keeps a screenshot roughly in proportion.
          const cols = Math.min(IMAGE_ROWS * 3, Math.max(10, (e.props?.bodyColumns ?? 60) - 2))
          inline = (
            <Image
              source={{ png: file.base64 }} // FsBytes is `{ base64 }`, already encoded
              columns={cols}
              rows={IMAGE_ROWS}
              // The engine draws pixels in kitty and Ghostty only; everywhere else, this.
              alt="(image preview needs kitty or Ghostty)"
            />
          )
        }
      }
    }

    return (
      <Box flexDirection="column">
        {list
          .slice()
          .reverse()
          .map((doc, i) => (
            // `autoFocus?: true` is a literal-true type, so `false` is not "off", it is an
            // invalid prop — and one invalid prop refuses the WHOLE tree, not just that element.
            <Button
              key={doc.path}
              plain
              hotkey={hotkeyFor(i)}
              autoFocus={i === 0 ? true : undefined}
              onPress={open(doc.path)}
            >
              {`Open ${doc.label}`}
            </Button>
          ))}
        <Text color={palette.muted}>↑↓ or Tab move · Enter or its key opens · Esc closes</Text>
        {inline}
      </Box>
    )
  })
}
