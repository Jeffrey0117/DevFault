# DevUp

Rebuild your entire dev environment with one command.

```
npx devup-cli
```

New machine? Run once, go grab a coffee, come back — everything's ready.

## The Problem

You got a new laptop. Now you need to:

1. Install Git, Node, Python, Docker, FFmpeg...
2. Clone 12 repos scattered across GitHub
3. Figure out which uses npm, which uses pnpm, which uses pip
4. Run the right install command for each one
5. Remember which port each project runs on

That's half a day gone. And you'll forget something.

## The Fix

```bash
devup
```

```
[Phase 1] System tools...

  git OK
  node OK
  Installing docker...
  docker installed!

[Phase 2] Repos...

  CloudPipe: cloning...
  CloudPipe: installing deps (pm2)...
  CloudPipe: done!

  RePic: pulling...
  RePic: installing deps (pnpm)...
  RePic: done!

  Ytify: cloning...
  Ytify: installing deps (pip)...
  Ytify: done!

  All tools & repos ready!
```

One command. Every tool installed. Every repo cloned. Every dependency resolved.

## Smart Detection (powered by ZeroSetup)

DevUp uses [ZeroSetup](https://github.com/Jeffrey0117/ZeroSetup) to auto-detect each project:

| Lock File | Detected PM | Install Command |
|-----------|-------------|-----------------|
| `pnpm-lock.yaml` | pnpm | `pnpm install` |
| `yarn.lock` | yarn | `yarn install` |
| `bun.lockb` | bun | `bun install` |
| `package-lock.json` | npm | `npm install` |
| `uv.lock` | uv | `uv sync` |
| `Pipfile` | pipenv | `pipenv install` |
| `poetry.lock` | poetry | `poetry install` |
| `requirements.txt` | pip | `pip install -r requirements.txt` |

No manual `postInstall` config needed. DevUp reads your lock files and does the right thing.

It also auto-detects:
- Runtime (Node / Python / both)
- Framework (Express, Next.js, FastAPI, Flask...)
- Entry point and start command
- Global tools needed (pm2, etc.)

## Install

```bash
npm install -g devup-cli
```

## Usage

```bash
devup              # Full setup (install tools + clone/pull all repos)
devup init         # Generate sample config at ~/.devup/
devup ls           # List all projects with detected run commands
devup run <name>   # Launch a project
```

## Config

`dev.config.json` — place in current directory or `~/.devup/dev.config.json`:

```json
{
  "baseDir": "~/workspace",
  "tools": [
    { "name": "git",    "cmd": "git",    "winget": "Git.Git" },
    { "name": "node",   "cmd": "node",   "winget": "OpenJS.NodeJS.LTS" },
    { "name": "python", "cmd": "python", "winget": "Python.Python.3.12" }
  ],
  "repos": [
    { "url": "https://github.com/you/project-a.git" },
    { "url": "https://github.com/you/project-b.git" },
    { "url": "https://github.com/you/project-c.git", "logo": "logo.png" }
  ]
}
```

That's it. Just URLs. DevUp figures out the rest.

### Tool fields

| Field | Description |
|-------|-------------|
| `name` | Display name |
| `cmd` | Command to check existence (`where <cmd>`) |
| `winget` | winget package ID for auto-install |

### Repo fields

| Field | Description |
|-------|-------------|
| `url` | Git clone URL (required) |
| `name` | Folder name override (auto-extracted from URL) |
| `branch` | Branch to checkout (optional) |
| `logo` | Logo path for GUI (optional) |
| `postInstall` | Manual override for install command (optional) |
| `run` | Manual override for start command (optional) |

Manual overrides exist but you almost never need them — ZeroSetup handles detection automatically.

## Example: `devup ls`

```
Projects:

  CloudPipe              pm2 start ecosystem.config.js
  RePic                  npm run dev [pnpm]
  ReVid                  npm run dev
  Ytify                  python main.py
  PyClick                python tray_clicker.py
  Screenshot-OCR         npm run dev
```

## ZeroSetup + DevUp

These are sister projects:

| | ZeroSetup | DevUp |
|---|-----------|-------|
| Scope | Single project | Entire dev environment |
| Does | Generate setup.bat for any project | Clone all repos + install all tools |
| For | End users deploying your app | Developers setting up their workspace |

DevUp uses ZeroSetup as its detection engine. When DevUp clones a repo, ZeroSetup scans it and tells DevUp exactly what to install and how to run it.

## GUI

DevUp also includes an Electron desktop app for visual project launching.

```bash
cd gui && npm install && npm start
```

- Tools status at a glance
- One-click Run / Stop for each project
- Sync All button to pull all repos

## License

MIT
