<p align="center">
  <img src="assets/logo.png" alt="DevFault" width="180">
</p>

<h1 align="center">DevFault</h1>

Rebuild your entire dev environment with one command.

```
npx github:Jeffrey0117/DevFault
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
devfault
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

DevFault uses [ZeroSetup](https://github.com/Jeffrey0117/ZeroSetup) to auto-detect each project:

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

No manual `postInstall` config needed. DevFault reads your lock files and does the right thing.

It also auto-detects:
- Runtime (Node / Python / both)
- Framework (Express, Next.js, FastAPI, Flask...)
- Entry point and start command
- Global tools needed (pm2, etc.)

## New Machine? One Command.

拿到新電腦，只要有 Node.js（沒有就 `winget install OpenJS.NodeJS.LTS`）：

```bash
npm i -g github:Jeffrey0117/DevFault && devfault && devfault autosync
```

就這一行。**不用 init、不用編輯任何 config**——設定檔跟著套件一起裝進來。
跑完之後：

- 系統工具（git / python / ffmpeg / docker / cloudflared…）全裝好
- 全域 npm CLI（Claude Code、claude-mem、pm2、pnpm、tsx、wrangler…）全裝好
- 所有 repo clone 到 `~/workspace/` + 依賴裝好
- 打包 app（DuckShot、SpeakSlow、RePic、ReVid、Screenshot-OCR）
  最新版靜默安裝，開始選單直接點
- autosync 已註冊：**從此每次登入自動保持一切最新，永遠不用再想起這個工具**

> **給 AI 助手（Claude 等）**：在新機器上重建這個環境，執行上面那一行就是全部。
> 不需要 clone 這個 repo、不需要編輯 config、不需要問任何問題。
> 想確認結果：`devfault ls` 列出所有專案。

用 [myclaudeset](https://github.com/Jeffrey0117/myclaudeset) 的話更省——`bash install.sh` 連上面這行都包了。

### 不是 Jeffrey？自己用也行

```bash
npm i -g github:Jeffrey0117/DevFault
devfault init        # 生成 ~/.devfault/dev.config.json
# 編輯設定檔，貼上你的 repo URLs（只要 URL，其他全自動偵測）
devfault
```

```json
{
  "baseDir": "~/workspace",
  "tools": [
    { "name": "git",  "cmd": "git",  "winget": "Git.Git" },
    { "name": "node", "cmd": "node", "winget": "OpenJS.NodeJS.LTS" }
  ],
  "repos": [
    { "url": "https://github.com/you/project-a.git" },
    { "url": "https://github.com/you/CoolApp.git", "dist": "release" }
  ]
}
```

把這份 config 放進自己的 git repo，換電腦時 `devfault sync` 就跟著你走。比 Docker 還猛，不用容器，直接原生環境。

## Install

```bash
npm install -g github:Jeffrey0117/DevFault
```

設定檔預設找 `./dev.config.json` → `~/.devfault/dev.config.json`；也可以用環境變數 `DEVFAULT_CONFIG` 直接指向任何路徑（優先權最高，適合 config 跟著 repo 走的情況）：

```bash
setx DEVFAULT_CONFIG "C:\path\to\devup\dev.config.json"   # Windows
```

## Usage

```bash
devfault              # Full setup (tools + repos + packaged apps)
devfault up           # Headless sync: pull everything, update apps (for automation)
devfault autosync     # Register hidden 'up --auto' at every logon (Windows Run key)
devfault autosync off # Remove the logon task
devfault init         # Generate sample config at ~/.devfault/
devfault add <url>    # Add a repo to config
devfault scan         # Auto-detect repos in workspace, add missing ones
devfault sync         # Sync config across machines (git pull + push)
devfault ls           # List all projects with detected run commands
devfault run <name>   # Launch a project
```

### Packaged apps (`dist: "release"`)

Repos that ship GitHub Releases (electron-builder `Setup.exe`) can be marked in config:

```json
{ "url": "https://github.com/you/CoolApp.git", "dist": "release" }
```

DevFault then **installs the packaged app instead of cloning source**: it grabs the
latest release, runs the installer silently (`/S`), and records the version in
`~/.devfault/apps.json` so unchanged versions are skipped. If a source clone already
exists (your dev machine), it still gets `git pull` — best of both.

### Set-and-forget mode

```bash
devfault autosync
```

Registers a hidden logon task (`HKCU` Run key, no admin needed) that runs
`devfault up --auto` — throttled to once per 6 hours. It pulls the config repo,
pulls all repos (reinstalling deps only when HEAD moved), and updates packaged
apps to the latest release. Log: `~/.devfault/logs/up.log`.

New machine flow: `bash myclaudeset/install.sh` does everything — installs DevFault,
runs the full setup, points `DEVFAULT_CONFIG` at the git-synced config, and enables
autosync. After that you never think about it again.

### Cross-Machine Sync

```bash
# Computer A: 加了新專案
devfault add https://github.com/someone/new-project.git
devfault sync         # push config 到 GitHub

# Computer B: 同步
devfault sync         # pull 最新 config
devfault              # 自動 clone 新專案 + 裝依賴
```

### Auto-Scan

手動 clone 了一堆東西到 workspace？

```bash
devfault scan         # 掃描 workspace，自動把新 repo 加進 config
devfault sync         # 同步到 GitHub
```

## Config

`dev.config.json` 放在當前目錄或 `~/.devfault/dev.config.json` 都行。

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
| `dir` | Path override for this repo — absolute or `~/...` (optional) |
| `branch` | Branch to checkout (optional) |
| `logo` | Logo path for GUI (optional) |
| `postInstall` | Manual override for install command (optional) |
| `run` | Manual override for start command (optional) |

Manual overrides exist but you almost never need them — ZeroSetup handles detection automatically.

### Machine-local paths (`~/.devfault/local.json`)

The synced config says **what** repos exist; `local.json` says **where** they
live on *this* machine. It never syncs — each machine keeps its own. Perfect
for an existing machine where repos already live somewhere else (renamed
folders, nested dirs):

```json
{
  "baseDir": "~/Desktop/code",
  "dirs": {
    "DevFault": "~/Desktop/code/devup",
    "RePic": "~/Desktop/code/workhub/repic"
  }
}
```

- `baseDir` — overrides the synced config's `baseDir` on this machine only
- `dirs` — per-repo path (keyed by repo name, case-insensitive, `~` ok)

Resolution order: `local.json dirs` → repo `dir` field → `baseDir/name`.
No `local.json` → nothing changes. CLI and GUI both honor it.

## Example: `devfault ls`

```
Projects:

  CloudPipe              pm2 start ecosystem.config.js
  RePic                  npm run dev [pnpm]
  ReVid                  npm run dev
  Ytify                  python main.py
  PyClick                python tray_clicker.py
  Screenshot-OCR         npm run dev
```

## Ecosystem

DevFault is part of a developer toolkit that covers your entire workflow:

| Tool | What It Does | Repo |
|------|-------------|------|
| **DevFault** | New machine? One command rebuilds your entire workspace | *you are here* |
| [**ZeroSetup**](https://github.com/Jeffrey0117/ZeroSetup) | Any GitHub project, double-click to run. Zero setup steps | `npx zerosetup` |
| [**ClaudeBot**](https://github.com/Jeffrey0117/ClaudeBot) | Write code from your phone via AI. Voice-to-code, live streaming | Telegram bot |
| [**CloudPipe**](https://github.com/Jeffrey0117/CloudPipe) | Self-hosted Vercel. Auto-deploys, Telegram control, 31+ MCP tools | `npm i -g @jeffrey0117/cloudpipe` |
| [**MemoryGuy**](https://github.com/Jeffrey0117/MemoryGuy) | Memory leak detection, safe optimization, port dashboard | Electron app |

**DevFault uses ZeroSetup** as its detection engine — when DevFault clones a repo, ZeroSetup scans it and tells DevFault exactly what to install and how to run it.

**The full loop:** DevFault sets up your machine → ClaudeBot writes code from your phone → CloudPipe auto-deploys → MemoryGuy keeps it all running stable.

## GUI

DevFault also includes an Electron desktop app for visual project launching.

```bash
cd gui && npm install && npm start
```

- Tools status at a glance
- One-click Run / Stop for each project
- Sync All button to pull all repos

## License

MIT
