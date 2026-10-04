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
export const KEEP = 32
// One page is what the dialog asks rows for, whatever the list holds: a dialog taller than the
// terminal pushed every redraw (spinner ticks) into scrollback, stacking copies over the chat.
export const PER_PAGE = 8
const INLINE_MAX_BYTES = 400_000 // a tree carries bounded text; a big PNG gets the button alone
export const IMAGE_ROWS = 10 // the inline preview's height in cells; `openPane` asks room for it
// 8 rows + hint + 10-row image and its gap = 20 rows: inside a normal window.

// The key reaches the pane through `/files`, not a Button `action`: ~/.claude/keybindings.json
// binds `ctrl+x f` to `command:files` in the Chat context (setup.mjs writes that binding).

const files = atom({ plugin: 'cockpit', key: 'files' } as const, [])

// Trimmed on read, not only on the next write: a session that stored more under an older, larger
// KEEP showed all of it until a new file came in.
const stored = async ($: EngineInterface) => (await read($, files)).slice(-KEEP)

// Which page the pane shows and which row on it holds the focus ring. Module-level: a reload
// starts on page 1, which is where a reopened pane starts anyway.
let page = 0
let focused = 0

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
    // Counts what is still on disk, and drops the rest from the list, so a deleted file leaves
    // the count and the pane together. At most KEEP exists checks.
    const docs = await stored($)
    const gone = new Set<string>()
    for (const doc of docs) if (!(await $.fs.exists(doc.path).catch(() => false))) gone.add(doc.path)
    if (gone.size) await update($, files, list => list.filter(d => !gone.has(d.path)))
    await $.fs.write(`${dir}/cockpit/${id}.json`, JSON.stringify({ files: docs.length - gone.size, columns }))
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
// The engine spills an MCP result's image block to <session>/tool-results/mcp-<server>-blob-<n>-<id>.png
// and names that copy in the result. It is a duplicate of the file the tool itself saved, kept in
// the transcript's store: never something the person made. (Its 43-char name, cut to 40 by
// `label`, is what showed up as `mcp-playwright-blob-…-g5ctsr` with no extension.)
const ENGINE_BLOB = /(?:^|\/)mcp-[\w-]*-blob-\d+-\w+\.\w+$/

const isAbsolute = (p: string) => /^(?:[A-Za-z]:\/|\/)/.test(p)

export const pathsIn = (value: unknown, cwd?: string): string[] => {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  const found = (text.match(FILE_PATH) ?? []).map(p => p.replace(/[\\/]+/g, '/').replace(/^\.\//, ''))
  const base = cwd?.replace(/\\/g, '/').replace(/\/+$/, '')
  // De-duplicated AFTER normalising: one file named in several escapings (Playwright's link,
  // comment and code) is one path, not three.
  return [...new Set(found.map(p => (isAbsolute(p) || !base ? p : `${base}/${p}`)))].filter(
    p => !ENGINE_BLOB.test(p),
  )
}

// A relative path is tried under each root in turn, first that exists wins: the project root
// first (Playwright MCP saves relative to it), then the cwd (a shell `cd` moves only that one).
const resolve = async ($: EngineInterface, path: string, roots: string[]) => {
  const tries = isAbsolute(path) || !roots.length
    ? [path]
    : roots.map(root => `${root.replace(/\\/g, '/').replace(/\/+$/, '')}/${path}`)
  for (const full of tries) if (await $.fs.exists(full).catch(() => false)) return full
  return null
}

const label = (path: string) => path.split('/').pop()?.slice(0, 40) ?? 'file'
// One file, one spelling: Windows answers `e:\` from one call and `E:\` from another, and the
// list took them for two files.
const sameDrive = (path: string) => path.replace(/^([a-z]):/, (_, d: string) => `${d.toUpperCase()}:`)
// The folder a file sits in, for telling two files of one name apart.
const folderOf = (path: string) => path.split('/').slice(-2, -1)[0] ?? ''
// PNG only: the terminal's Image takes PNG data, and anything else refuses the WHOLE pane.
const isPng = (path: string) => /\.png$/i.test(path)

// A Button hotkey is ONE digit or ONE lowercase letter (the engine refuses anything else), and
// it is the only key a pane can bind: the arrows and Tab belong to the engine, which walks the
// focus ring with them. So rows take 1–8 and the navigation takes h/j/k/l, as Buttons of its own.
const NAV = { j: 'nav:j', k: 'nav:k', h: 'nav:h', l: 'nav:l' } as const
const isNav = (key: string | undefined) => !!key?.startsWith('nav:')

// Turns to `to` (clamped by the caller), redraws, and puts the ring on row `row` of it.
const go = async ($: EngineInterface, to: number, row: number) => {
  page = to
  focused = row
  $.ui.invalidate('ui.render')
  await $.ui.focus({ requestId: PANE, key: `row:${row}` }).catch(() => null)
}

// Top level, not nested in `register`: the validator only traces `$` into a function declared at
// the top of the file, and refuses a module that hands it to a closure it cannot follow.
// `since`: keep only files modified after it, so a path a command merely printed (`git status`
// listing README.md) is not taken for one it produced. 2 s of slack for coarse file-system clocks.
// Publishes even when nothing is collected: every tool call is where a deletion can have happened.
const collect = async ($: EngineInterface, paths: string[], since?: number, roots: string[] = []) => {
  const onDisk: string[] = []
  for (const found of paths) {
    const resolved = await resolve($, found, roots)
    if (!resolved) continue
    const path = sameDrive(resolved)
    if (since !== undefined) {
      const stat = await $.fs.stat(path).catch(() => null)
      if (!stat || stat.mtimeMs < since - 2000) continue
    }
    onDisk.push(path)
  }
  if (onDisk.length) {
    const at = await $.clock.now()
    await update($, files, list => {
      // A path produced again moves to the newest slot: a regenerated file is this session's latest
      // output, and left in its old place a full list drops it on the next new file.
      const kept = list.filter(d => !onDisk.includes(sameDrive(d.path)))
      return [...kept, ...onDisk.map(path => ({ path, label: label(path), at }))].slice(-KEEP)
    })
  }
  await publish($)
}

// The tools whose answer names a file they produced. Bash is collected live (its call time
// separates produced from merely printed) but never replayed, where that time is gone.
const SCREENSHOT_TOOLS = [
  'mcp__playwright__browser_take_screenshot',
  'mcp__claude-in-chrome__computer',
  'mcp__plugin_figma_figma__get_screenshot',
]

// The list is host state for the session id; a trip through the agent screen hands the same
// conversation a new id and an empty state. The transcript survives it, so an empty list is
// rebuilt from it, oldest first so the newest call ends up on top. Never rejects.
const rebuild = async ($: EngineInterface) => {
  try {
    const messages = await $.session.messages()
    const roots = [await $.session.root().catch(() => ''), await $.session.cwd().catch(() => '')].filter(Boolean)
    const found: string[] = []
    for (const m of messages) {
      for (const use of m.toolUses ?? []) {
        if (use.isError) continue
        if (use.tool === 'Write' && typeof use.input?.file_path === 'string') {
          const path = use.input.file_path.replace(/\\/g, '/')
          if (IS_OPENABLE.test(path)) found.push(path)
        } else if (SCREENSHOT_TOOLS.includes(use.tool)) {
          found.push(...pathsIn(use.result ?? use.text ?? ''))
        }
      }
    }
    if (found.length) await collect($, found, undefined, roots)
  } catch {
    // no transcript to read (a fresh session): the list stays empty
  }
}

// Open as a dialog: it takes the keyboard at once (so a hotkey works without `ctrl+x tab`), Esc
// closes it, and toasts wait behind it rather than landing on the list being picked from.
// `rows` is what makes the arrows walk the list: a dialog tall enough to show whole has nothing
// to scroll, and while it has, the engine spends the arrows on scrolling (measured 2026-10-03:
// opened a third tall, a 20-row image box made the list scroll and the arrows dead).
// One page at most, never the whole list: see PER_PAGE.
const openPane = async ($: EngineInterface) => {
  // An empty list may be a new session id over an old conversation: rebuild it before opening.
  // Here, not in the draw: the host refuses a state write while a render is dispatched.
  if (!(await stored($)).length) await rebuild($)
  const list = await stored($)
  const newest = list[list.length - 1]
  page = 0
  focused = 0
  const rows = Math.min(PER_PAGE, Math.max(1, list.length)) + 1 + (newest && isPng(newest.path) ? IMAGE_ROWS + 1 : 0)
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
    await rebuild($) // a resumed or re-identified conversation: the count is right before /files
    await publish($)
    // A file deleted outside Claude (Explorer, another shell) fires no hook: recount on a clock.
    $.clock.every(30_000, () => void publish($))
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
    const ok = ran.deny === undefined && ran.isError !== true && path && IS_OPENABLE.test(path)
    await collect($, ok ? [path] : [])
    return ran
  })

  // Everything else: read the answer, keep what is openable AND on disk. Bash is here because
  // the scripts that produce the real artefacts — invoices, reports — are run, not written.
  for (const tool of ['Bash', ...SCREENSHOT_TOOLS]) {
    on('tool.call', { tool }, async ($, e, next) => {
      const since = await $.clock.now()
      const ran = await next(e)
      if (ran.deny !== undefined || ran.isError === true) return ran
      const roots = [await $.session.root().catch(() => ''), await $.session.cwd().catch(() => '')]
      await collect($, pathsIn(ran), since, roots.filter(Boolean))
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

  // The arrows and Tab walk every Button, the h/j/k/l ones too; the ring stays on the rows, so
  // an arrow past the page's edge stops there (j/k turn the page instead). Tracks the row too.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    if (isNav(e.element)) return {}
    const row = /^row:(\d+)$/.exec(e.element ?? '')
    if (row) focused = Number(row[1])
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const all = await stored($)

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
    // A page is as long as the body the surface granted, less the hint row. Docked (fullscreen
    // from 110 columns) that is floor to ceiling; inline above the prompt it is what the layout
    // spares, which a wrapped prompt shortens. A page taller than the body made the engine scroll
    // it: the hint fell off and the arrows scrolled instead of walking.
    const body = e.props?.scroll?.bodyRows ?? Infinity
    const perPage = Math.max(1, Math.min(PER_PAGE, body - 1))
    const pages = Math.ceil(list.length / perPage)
    page = Math.min(page, pages - 1) // a file deleted since can shorten the list under us
    const shown = list
      .slice()
      .reverse()
      .slice(page * perPage, (page + 1) * perPage)
    const last = shown.length - 1
    // A name two listed files share gets its folder, so the rows say which is which.
    const counts = new Map<string, number>()
    for (const d of list) counts.set(d.label, (counts.get(d.label) ?? 0) + 1)
    const rowLabel = (d: Doc) => ((counts.get(d.label) ?? 0) > 1 ? `${d.label} · ${folderOf(d.path)}` : d.label)

    // j past the last row turns to the next page's first; k before the first, to the previous
    // page's last. At the list's two ends they stay put.
    const down = () =>
      focused < last ? go($, page, focused + 1) : page < pages - 1 ? go($, page + 1, 0) : undefined
    const up = () =>
      focused > 0
        ? go($, page, focused - 1)
        : page > 0
          ? go($, page - 1, perPage - 1)
          : undefined
    const turn = (to: number) => () => (to >= 0 && to < pages ? go($, to, 0) : undefined)

    // A file that opened takes the person to another app; the pane closes behind it, so they do
    // not come back to a dialog they have to dismiss. A failed open keeps it to pick again.
    const open = (path: string) => () =>
      openerFor($, path)
        .then(cmd => $.process.run(cmd))
        .then(r =>
          r.exitCode === 0
            ? $.ui.close({ id: PANE })
            : $.ui.toast(`could not open ${label(path)} (exit ${r.exitCode})`),
        )
        .catch(() => $.ui.toast(`could not open ${label(path)}`))

    let inline = null
    // The newest file only, on page 1 only: it is what `openPane` asked rows for. Left out when
    // the body cannot hold it under the rows and the hint: a row is worth more than a preview.
    const roomForImage = body >= shown.length + 1 + IMAGE_ROWS + 1
    if (page === 0 && e.surface === 'terminal' && isPng(newest.path) && roomForImage) {
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
        {shown.map((doc, i) => (
          // `autoFocus?: true` is a literal-true type, so `false` is not "off", it is an
          // invalid prop — and one invalid prop refuses the WHOLE tree, not just that element.
          // Keyed by position: `row:N` is what `go` focuses after a page turn.
          <Button
            key={`row:${i}`}
            plain
            hotkey={String(i + 1)}
            autoFocus={i === 0 ? true : undefined}
            onPress={open(doc.path)}
          >
            {`Open ${rowLabel(doc)}`}
          </Button>
        ))}
        {/* The hint, always drawn, one row: its keys are live Buttons (`j: ↓`), so it cannot
            drift from what works. `openPane` counts this row. */}
        <Box flexDirection="row" columnGap={1}>
          <Button key={NAV.j} plain dimColor hotkey="j" onPress={down}>
            ↓
          </Button>
          <Button key={NAV.k} plain dimColor hotkey="k" onPress={up}>
            ↑
          </Button>
          {pages > 1 ? (
            <Button key={NAV.h} plain dimColor hotkey="h" onPress={turn(page - 1)}>
              ‹
            </Button>
          ) : null}
          {pages > 1 ? <Text color={palette.muted}>{`${page + 1}/${pages}`}</Text> : null}
          {pages > 1 ? (
            <Button key={NAV.l} plain dimColor hotkey="l" onPress={turn(page + 1)}>
              ›
            </Button>
          ) : null}
          <Text color={palette.muted} wrap="truncate-end">
            · Enter or 1–8 opens · Esc closes
          </Text>
        </Box>
        {inline}
      </Box>
    )
  })
}
