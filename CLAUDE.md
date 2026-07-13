# DevFault

Rebuild your entire dev environment with one command — auto-detects tools, repos, and install/run commands.

## Stack
- Node.js (ESM, `"type": "module"`), zero build step
- CLI published as `devfault-cli`, bin name `devfault` (`devfault.js`)
- Detection engine: [`zerosetup`](https://github.com/Jeffrey0117/ZeroSetup) (`lib/detect.js`)
- Dependency installer: [`smart-install`](https://github.com/Jeffrey0117/smart-install)
- GUI: Electron 33 desktop launcher (`gui/`)
- Windows-first: uses `winget` for tool installs, `where`/`taskkill` for process control

## Directory structure
```
devfault.js          ← Entire CLI (single file, all commands)
package.json         ← devfault-cli — deps: zerosetup, smart-install
gui/
  main.js            ← Electron main process + IPC handlers
  index.html         ← Single-file renderer (inline HTML/CSS/JS)
  package.json       ← devfault-gui — electron start
README.md            ← Full usage + ecosystem docs
~/.devfault/dev.config.json   ← User config (or ./dev.config.json)
```

## Key concepts

- **Config** (`dev.config.json`): `{ baseDir, tools[], repos[] }`. Lookup order: `$DEVFAULT_CONFIG` env var, then `./dev.config.json`, then `~/.devfault/dev.config.json`, then the copy bundled in the npm package (fresh-machine fallback). Same lookup logic in CLI and GUI. `baseDir` supports `~` expansion.
- **3-phase full setup** (default `devfault` command):
  1. **Tools** — for each `tool`, check via `where <cmd>` then `winget list`; install missing via `winget install`.
  2. **Repos** — clone (or `git pull` if `.git` exists), optional `branch` checkout.
  3. **Detect + install** — `zerosetup.detect()` reads lock files to pick package manager; `smartInstall()` runs it; auto-installs detected `npmGlobal` tools (e.g. pm2).
- **Auto-detection** (`zerosetup/lib/detect.js`): infers runtime (node/python/both), entry point, port, framework (express/nextjs/nuxt/pm2/fastapi/flask/django), package manager (npm/pnpm/yarn/bun/uv/pipenv/poetry by lock file), start command, and winget deps (ffmpeg, cloudflared) by keyword-scanning source.
- **Manual overrides** (rarely needed): repo fields `name`, `branch`, `logo`, `postInstall`, `run` win over detection.
- **Packaged apps** (`dist: "release"` repo field): install latest GitHub Release `Setup*.exe` silently (`/S`) instead of cloning source; installed versions tracked in `~/.devfault/apps.json`. Existing source clones still get pulled (dev-machine case).
- **`devfault up`** — headless sync for automation: pulls the config's git repo first (self-update), pulls all repos (deps reinstalled only when HEAD moved), updates packaged apps. `--auto` throttles to once per 6h via `~/.devfault/state.json`.
- **`devfault autosync`** — writes `~/.devfault/devfault-up.vbs` + HKCU Run key so `up --auto` runs hidden at every logon (log: `~/.devfault/logs/up.log`). `autosync off` removes it.
- **Bootstrap chain**: `myclaudeset/install.sh` installs DevFault → runs full setup → `setx DEVFAULT_CONFIG` to the git-synced clone → enables autosync.
- **GUI** mirrors CLI config/detection, adds per-project Run/Stop (spawns `cmd /c <runCmd>`, tracks PIDs, `taskkill /T /F` to stop) and a Sync All button that shells out to `devfault.js`. GUI `getRunCmd` adds fallbacks: skips broken `node <file>` / electron projects in favor of `npm run dev` / `npm start`.

## Commands
```bash
devfault              # Full 3-phase setup (tools + repos + deps + packaged apps)
devfault up           # Headless sync (--auto: throttled, for logon task)
devfault autosync     # Register hidden logon task; 'autosync off' removes
devfault init         # Create sample config at ~/.devfault/dev.config.json
devfault add <url>    # Add a repo to config
devfault scan         # Detect git repos under baseDir, add missing to config
devfault sync         # git pull → stage config → commit + push (config must be in a git repo)
devfault ls           # List projects with detected run commands
devfault run <name>   # Launch a project (execSync, inherits stdio)

cd gui && npm install && npm start   # Electron GUI launcher
```
No test or lint setup exists.

## Coding rules
- Immutable config updates: spread into new objects (`{ ...config, repos: [...] }`), never mutate — pattern used throughout `devfault.js`.
- Keep CLI in the single `devfault.js` file; section comments (`==== name ====`) delimit each command.
- Detection/run logic must stay consistent between `devfault.js` and `gui/main.js` (both load config and call `zerosetup.detect()` the same way).
- Errors are caught and reported per-repo/per-tool; setup continues and prints a failure summary rather than aborting.
- `console.log` is used intentionally for CLI UX output (not subject to the no-console rule).
