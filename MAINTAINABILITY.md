# Maintainability — claude-cockpit

Scored against the standard 10-category rubric (total /50) so the project stays handoff-ready.
Buyer-ready threshold: 42 / 50 with no category below 3. Re-score after any significant change.

## Rubric

| # | Category | Anchors |
|---|---|---|
| 1 | **Onboarding documentation** | 1=README absent or one line. 3=README + setup + run, but operational context (architecture, why) lives elsewhere. 5=README + arch overview + setup script + first-PR walkthrough; a new dev is productive in a day. |
| 2 | **Inline code documentation** | 1=no comments, naming-only. 3=top-of-file purpose comments on non-trivial modules. 5=non-obvious WHYs documented at every load-bearing decision; comments age with the code. |
| 3 | **Test coverage of critical paths** | 1=no tests / scaffolding only. 3=schemas + a handful of pure functions covered. 5=Server Actions, schemas, interactive components, and a11y all covered with a CI gate. |
| 4 | **Type safety** | 1=`any` widespread / loose unknown. 3=mostly typed but some escape hatches. 5=`tsc --noEmit` clean, no `any`, DB types regenerated on every schema change. |
| 5 | **Architectural consistency** | 1=mixed patterns per concern (some Server Actions, some inline fetches, some route handlers). 3=conventions exist but not enforced. 5=one clear pattern per concern, documented and adhered to. |
| 6 | **Dependency hygiene** | 1=stale majors, abandoned packages, peer-dep warnings ignored. 3=current most majors, occasional `--legacy-peer-deps`, lockfile committed. 5=current majors, no peer-dep warnings, security alerts addressed, lockfile committed, no abandoned packages. |
| 7 | **Database migration discipline** | 1=ad-hoc SQL changes. 3=numbered migrations but applied inconsistently. 5=numbered migrations only, applied via tooling, types regenerated, RLS on every table from day one. |
| 8 | **Configuration & secrets** | 1=hardcoded secrets / no `.env.example`. 3=`.env.example` exists but drifts. 5=`.env.example` complete and current, no secrets committed, prod config + ops steps documented. |
| 9 | **Build & deploy reproducibility** | 1=manual / tribal knowledge. 3=one-command build but deploy is bespoke. 5=one-command build + one-command deploy, scripts committed, runbook documented. |
| 10 | **Error handling & observability** | 1=throws everywhere, silent swallowing. 3=consistent in some layers. 5=typed result unions everywhere, structured logs with context, no silent swallowing. |

---


## Current scoring

*Scored 2026-10-03; re-scored 2026-10-04 after CI (category 3) and the v0.1.0 release (category 9); re-scored 2026-10-04 for v0.2.0 (categories 3 and 4).*

| # | Category | Score | Why |
|---|---|---|---|
| 1 | Onboarding documentation | 4 | README covers install, palettes and how it works; a setup script wires everything. No first-change walkthrough. |
| 2 | Inline code documentation | 4 | Every module opens with its purpose; the non-obvious choices (Windows path escaping, why the engine's env call and not `process.env`, the drop order) carry their reason. |
| 3 | Test coverage of critical paths | 5 | Palettes, the status line (width, palettes, glyphs, bad input, per-session status), setup (pure plan + real runs), the extractors (`pathsIn`, `linksIn`, `foldersIn`, `fuzzy`) and the pane (drawing, collection by kind, counts, the dialog's rows, presses on rows and on `o`, the opener's commands, wrap-around, the filter field's input and Enter) are covered, gated by CI on Linux, macOS and Windows plus the plugin tests on the pinned engine. The one path the harness cannot raise is the person's Esc (`ui.close`); it is on the manual check list. |
| 4 | Type safety | 5 | `tsc --noEmit` clean (2026-10-04) against the engine's laid types; no `any` outside the test helpers' `on` parameter. `palettes.js` carries a `.d.ts`. |
| 5 | Architectural consistency | 4 | One pattern per concern: the mod owns engine state, the status line reads one JSON file, both share one palette table. |
| 6 | Dependency hygiene | 5 | No dependencies. Node's own test runner. |
| 7 | Database migration discipline | 5 | No database. |
| 8 | Configuration & secrets | 5 | Nothing secret. The two options live in the manifest's `userConfig` and Claude Code's config menu; setup writes the same keys. |
| 9 | Build & deploy reproducibility | 5 | Nothing to build; one command installs (`node setup.mjs`), with a dry run and a backup. Releases are tagged with the Claude Code build they were tested against (CHANGELOG.md), so a user can pin one. |
| 10 | Error handling & observability | 3 | The status line swallows on purpose (a throwing status line goes blank) and degrades segment by segment; setup refuses a settings.json it cannot parse; the pane toasts a failed open. No logging. |
| | **Total** | **45 / 50** | Above the buyer-ready threshold, no category below 3. |

## Next-move targets

1. **A first-change walkthrough** in the README (where a new source of entries goes, which test to
   copy). Category 1, from 4 to 5.
2. **A debug line** behind an option for a refused tree or a skipped hook, so a user can report
   one without `--debug`. Category 10, from 3 to 4.

## Known gaps

Small, known, and deliberately left. Each is cheap to fix when it starts to matter.

- `setup.mjs` backs up `settings.json` but rewrites `keybindings.json` without a backup.
- The plugin-folder check compares exact strings, so `E:\x` and `E:/x` would both be added to `CLAUDE_CODE_PLUGIN_DIRS`.
- The test "the ansi palette reaches the module as its option" only checks `paletteOf`. It proves the mod loads with the option set, not that the pane uses it.
- In free text (a command's output), a space ends a path: `my report.pdf` is read as `report.pdf`, then dropped unless that call produced the file. A Write is collected at its exact path and is not affected.
- The arrows walk the list only while the dialog fits on screen. A list longer than the layout allows scrolls instead (Tab still walks).
- The image preview draws only in kitty and Ghostty. Other terminals get a line saying so.
- `/files` and `ctrl+x f` wait while a turn is running: Claude Code runs a slash command once the session is idle.
- `~/.claude/cockpit/` keeps one small status file per session and never prunes them.
- The fuzzy score takes the leftmost positions, not the best alignment; good enough for 48 short rows.
- A `mkdir` behind `cd x &&` is taken relative to the session's cwd, not `x`, and is dropped when it does not exist there.
- The filter field is drawn on the terminal, desktop and VS Code surfaces; the mobile surface has no `Input`, so `f` does nothing there.
- The person's Esc while filtering is answered by a `ui.close` hook; the test harness (2.1.289) cannot raise `ui.close`, so that path is checked by hand per release.

## Releasing

Every release is tested against one Claude Code build, and the CI job pins that build.

**When Claude Code updates:**

1. On a branch, change the pin in `.github/workflows/test.yml` (`@anthropic-ai/claude-code@<version>`) and open a pull request.
2. CI runs the node tests on Linux, macOS and Windows with Node 22 and 24, then `claude plugin validate` and `claude plugin test` on the pinned build.
3. **Green:** bump `version` in `.claude-plugin/plugin.json` and add a section to `CHANGELOG.md` (`## v<x.y.z> — <date>`, then `Tested against Claude Code <version>.`). Merge, then:
   ```
   git tag -a v<x.y.z> -m "v<x.y.z> — tested against Claude Code <version>"
   git push origin v<x.y.z>
   gh release create v<x.y.z> --title v<x.y.z> --notes-file <that CHANGELOG section>
   ```
4. **Red:** the hooks API moved. Fix it before tagging. The plugin tests fake every engine call the mod makes (`disk()` in `hooks/cockpit.test.ts`), so a changed shape shows up there first.

**Checks before any push:**

```
claude plugin validate .
claude plugin test .
node --test "test/*.test.mjs"
```

For the type check, the engine has to lay its types first: load the plugin once (`claude --plugin-dir .`), then run `npx -p typescript tsc -p .`.

**Trying it next to another plugin named `cockpit`:** setting `CLAUDE_CODE_PLUGIN_DIRS` in the shell does not override the `env` block in `settings.json` (measured on 2.1.288). Pass it as a settings layer instead:

```
claude --settings '{"env":{"CLAUDE_CODE_PLUGIN_DIRS":"<this folder>"}}'
```

The config menu stores this plugin's options under `pluginConfigs["cockpit@inline"].options` when it loads from a folder. The status line reads that key first, and setup writes it.
