# claude-cockpit

A denser Claude Code status line and a pane of the files your session produced.

## What you get

The status line, one row:

```
Opus 5.5 │ Coding │ main* +12 -3 │ ▪▪▪▪▪                  3  ·  1h 20m
```

- `Opus 5.5` is the model.
- `Coding` is the directory the session runs in.
- `main*` is the branch, with `*` when there is uncommitted work, `↑2 ↓1` when it is ahead of or behind its upstream, and `detached` in red when there is no branch.
- `+12 -3` is the lines added and removed against `HEAD`, shown only when the tree is dirty.
- `▪▪▪▪▪` is the context window, one square per 20 %. It turns from calm to yellow to red as it fills.
- `3` (after a file icon) is how many files the pane holds.
- `1h 20m` (after a clock icon) is how long the session has run.

When the terminal is too narrow, segments drop in this order: model, directory, file count, churn, clock, branch, and the context bar last. The row never wraps.

The pane opens with `/files`, `/shots` or `ctrl+x f`. It lists the files this session wrote or produced, newest first, each on its own key (`1`–`9`, then `a`–`z`). Press a key and the file opens in your system's default app. The newest image is also drawn inline in the terminal. A file counts when a person would open it: documents, images, spreadsheets, slides, archives, Markdown and HTML. Source code never counts, since that belongs in your editor.

## Requirements

- Claude Code 2.1.288 or later. Built and tested against 2.1.288. The plugin hooks API is young and may move.
- Node 18 or later.
- A Nerd Font for the file and clock icons, or set glyphs to `plain`.
- wezterm is optional. With it the status line reads the exact pane width. Without it, it uses the width the mod measured, and 80 columns if that is missing.

## Install

```
git clone https://github.com/LolerHero/claude-cockpit
cd claude-cockpit
node setup.mjs            # add --palette tokyo-night, --glyphs plain, --dry-run, --force
```

Then restart `claude`.

What setup changes, in `~/.claude` (or `CLAUDE_CONFIG_DIR`):

- `settings.json` → `statusLine` runs `statusline/statusline.mjs`. A status line you already have is kept unless you pass `--force`.
- `settings.json` → `env.CLAUDE_CODE_PLUGIN_DIRS` gains this folder, so the plugin loads in every session.
- `keybindings.json` → `ctrl+x f` opens `/files`, unless that chord is already bound to something else.

`settings.json` is backed up next to itself before the first write. `--dry-run` prints the changes and writes nothing.

## Palettes

`rose-pine` (the default), `catppuccin-mocha`, `tokyo-night` and `ansi`. `ansi` uses your terminal's own 16 colors, so it follows whatever theme you run and works without truecolor.

The palette and the glyphs are also options of the `cockpit` plugin in Claude Code's config menu. Change them there and the next redraw picks them up.

## How it works

The mod runs inside Claude Code and writes the file count and the terminal width to `~/.claude/cockpit/<session id>.json`, one small file per session, so two open sessions never mix their numbers. The status line is a separate Node process that reads its session's file, plus `settings.json` for your options. Both draw from the same `palettes.js`.

## Check it

```
claude plugin validate .
claude plugin test .
node --test "test/*.test.mjs"
```

## License

MIT
