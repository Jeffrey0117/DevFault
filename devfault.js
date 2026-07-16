#!/usr/bin/env node

import { execSync } from "child_process"
import { createRequire } from "module"
import { fileURLToPath } from "url"
import fs from "fs"
import path from "path"
import os from "os"
import { smartInstall } from "smart-install"

const require = createRequire(import.meta.url)
const { detect } = require("zerosetup/lib/detect")

const cmd = process.argv[2]
const cmdArg = process.argv[3]

// ==================== init ====================

if (cmd === "init" || cmd === "--init") {
  const initDir = path.join(os.homedir(), ".devfault")
  const initPath = path.join(initDir, "dev.config.json")

  if (fs.existsSync(initPath)) {
    console.log(`Already exists: ${initPath}`)
    process.exit(0)
  }

  const template = {
    baseDir: "~/workspace",
    tools: [
      { name: "git", cmd: "git", winget: "Git.Git" },
      { name: "node", cmd: "node", winget: "OpenJS.NodeJS.LTS" },
    ],
    repos: [
      { url: "https://github.com/you/your-project.git" },
    ],
  }

  fs.mkdirSync(initDir, { recursive: true })
  fs.writeFileSync(initPath, JSON.stringify(template, null, 2) + "\n")
  console.log(`Created: ${initPath}`)
  console.log("Edit the file, add your repos, then run: devfault")
  process.exit(0)
}

// ==================== Load config ====================

const pkgDir = path.dirname(fileURLToPath(import.meta.url))

const candidates = [
  process.env.DEVFAULT_CONFIG,
  path.join(process.cwd(), "dev.config.json"),
  path.join(os.homedir(), ".devfault", "dev.config.json"),
  path.join(pkgDir, "dev.config.json"),
].filter(Boolean)

const configPath = candidates.find((p) => fs.existsSync(p))

if (!configPath) {
  console.error("No dev.config.json found.\n")
  console.error("Create one at:")
  console.error("  1. $DEVFAULT_CONFIG (env var pointing to a config file)")
  console.error("  2. ./dev.config.json")
  console.error("  3. ~/.devfault/dev.config.json\n")
  console.error("Or run: devfault init")
  process.exit(1)
}

const config = JSON.parse(fs.readFileSync(configPath, "utf-8"))

// Machine-local overrides (~/.devfault/local.json) — never git-synced.
// { "baseDir": "~/Desktop/code", "dirs": { "RepoName": "~/some/other/path" } }
// The synced config says WHAT repos exist; local.json says WHERE they live
// on this machine. Missing file → behavior unchanged.
const localOverridesPath = path.join(os.homedir(), ".devfault", "local.json")
const localOverrides = fs.existsSync(localOverridesPath)
  ? JSON.parse(fs.readFileSync(localOverridesPath, "utf-8"))
  : {}

function expandHome(p) {
  return path.resolve(p.replace(/^~(?=$|[/\\])/, os.homedir()))
}

const baseDir = expandHome(localOverrides.baseDir || config.baseDir)

const localDirs = Object.fromEntries(
  Object.entries(localOverrides.dirs || {}).map(([k, v]) => [k.toLowerCase(), v])
)

// Where a repo lives on THIS machine: local.json dirs > repo.dir > base/name
function repoDir(repo, base = baseDir) {
  const override = localDirs[repoName(repo).toLowerCase()] || repo.dir
  return override ? expandHome(override) : path.join(base, repoName(repo))
}

// ==================== Helpers ====================

function repoName(repo) {
  if (repo.name) return repo.name
  const match = repo.url.match(/\/([^/]+?)(\.git)?$/)
  return match ? match[1] : repo.url
}

function normalizeUrl(url) {
  return url.replace(/\.git$/, "").toLowerCase()
}

function saveConfig(cfgPath, cfg) {
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n")
}

function findGitRoot(startPath) {
  let dir = startPath
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir
    dir = path.dirname(dir)
  }
  return null
}

function smartDetect(repoPath) {
  try {
    return detect(repoPath)
  } catch {
    return null
  }
}

function getInstallCmd(detected, repo) {
  // Manual override wins
  if (repo.postInstall) return repo.postInstall

  if (!detected) return null

  const pm = detected.packageManager
  if (pm) return pm.install

  // Fallback
  if (detected.deps.npm) return "npm install"
  if (detected.deps.pip) return "pip install -r requirements.txt"

  return null
}

function getRunCmd(detected, repo) {
  // Manual override wins
  if (repo.run) return repo.run

  if (!detected) return null

  return detected.startCmd || null
}

function isToolInstalled(tool) {
  // 1. Check PATH
  try {
    execSync(`where ${tool.cmd}`, { stdio: "ignore" })
    return true
  } catch {}

  // 2. Check common install locations (e.g. Python installer doesn't add PATH,
  //    loose exe dropped in the home dir) — keep in sync with checkTool() in gui/main.js
  if (fs.existsSync(path.join(os.homedir(), `${tool.cmd}.exe`))) return true

  const commonRoots = [
    path.join(os.homedir(), "AppData", "Local", "Programs", "Python"),
    path.join("C:", "Program Files"),
  ]
  for (const root of commonRoots) {
    try {
      for (const entry of fs.readdirSync(root)) {
        if (fs.existsSync(path.join(root, entry, `${tool.cmd}.exe`))) return true
      }
    } catch {}
  }

  // 3. Check winget registry
  try {
    const out = execSync(`winget list --id ${tool.winget} --accept-source-agreements`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    return out.includes(tool.winget)
  } catch {
    return false
  }
}

// ==================== npm global helpers ====================

// Installs missing global npm CLIs (config top-level `npmGlobal: []`).
// Presence check via the global node_modules dir — install only when absent;
// packages keep themselves updated (or the user does) after that.
function installNpmGlobals(pkgs) {
  if (!pkgs || pkgs.length === 0) return []

  let globalRoot
  try {
    globalRoot = execSync("npm root -g", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    console.error("  npm not found — skipping global CLIs")
    return [...pkgs]
  }

  const failed = []
  for (const pkg of pkgs) {
    if (fs.existsSync(path.join(globalRoot, ...pkg.split("/")))) continue

    console.log(`  installing ${pkg}...`)
    try {
      execSync(`npm install -g ${pkg}`, { stdio: "ignore" })
      console.log(`  ${pkg} installed!`)
    } catch {
      console.error(`  ${pkg} failed`)
      failed.push(pkg)
    }
  }
  return failed
}

// ==================== Release app helpers ====================

const devfaultDir = path.join(os.homedir(), ".devfault")

function ghSlug(url) {
  const m = url.match(/github\.com[:/]+([^/]+)\/([^/\s]+?)(\.git)?$/i)
  return m ? `${m[1]}/${m[2]}` : null
}

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"))
  } catch {
    return fallback
  }
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n")
}

function gitHead(dir) {
  try {
    return execSync(`git -C "${dir}" rev-parse HEAD`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return null
  }
}

const LOCKFILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "uv.lock",
  "poetry.lock",
  "Pipfile.lock",
])

// After setup clones the DevFault repo, future runs should read the
// git-synced config instead of the static copy bundled in the npm package.
// Pins DEVFAULT_CONFIG only when currently running off the bundled fallback.
function pinConfigToSyncedClone(cfgBaseDir) {
  if (process.platform !== "win32") return
  if (process.env.DEVFAULT_CONFIG) return
  if (configPath !== path.join(pkgDir, "dev.config.json")) return

  const synced = path.join(cfgBaseDir, "DevFault", "dev.config.json")
  if (!fs.existsSync(synced)) return

  try {
    execSync(`setx DEVFAULT_CONFIG "${synced}"`, { stdio: "ignore" })
    console.log(`  Config pinned: DEVFAULT_CONFIG -> ${synced}`)
  } catch {}
}

// Installs mutate lockfiles; a conflicted lockfile must never wedge an
// unattended sync. Resolves to HEAD's version only when every unmerged
// file is a lockfile — real conflicts are left alone.
function resolveLockfileConflicts(dir) {
  try {
    const out = execSync(`git -C "${dir}" diff --name-only --diff-filter=U`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    if (!out) return false

    const files = out.split("\n")
    if (!files.every((f) => LOCKFILES.has(path.basename(f)))) return false

    for (const f of files) {
      execSync(`git -C "${dir}" checkout HEAD -- "${f}"`, { stdio: "ignore" })
    }
    return true
  } catch {
    return false
  }
}

async function getLatestRelease(slug) {
  // gh CLI first (works for private repos), public API fallback
  try {
    const out = execSync(`gh api repos/${slug}/releases/latest`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    return JSON.parse(out)
  } catch {}

  const res = await fetch(`https://api.github.com/repos/${slug}/releases/latest`)
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  return await res.json()
}

function pickSetupAsset(release) {
  const exes = (release.assets || []).filter(
    (a) => /\.exe$/i.test(a.name) && !/blockmap/i.test(a.name)
  )
  return exes.find((a) => /setup/i.test(a.name)) || exes[0] || null
}

async function downloadAsset(slug, asset, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  const dest = path.join(destDir, asset.name)

  try {
    execSync(
      `gh release download -R ${slug} --pattern "${asset.name}" -D "${destDir}" --clobber`,
      { stdio: "ignore" }
    )
    if (fs.existsSync(dest)) return dest
  } catch {}

  const res = await fetch(asset.browser_download_url, { redirect: "follow" })
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`)
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  return dest
}

async function installApps(repos) {
  const releaseRepos = repos.filter((r) => r.dist === "release")
  if (releaseRepos.length === 0) return []

  const appsPath = path.join(devfaultDir, "apps.json")
  const failed = []
  let installed = readJson(appsPath, {})

  for (const repo of releaseRepos) {
    const name = repoName(repo)
    const slug = ghSlug(repo.url)

    if (!slug) {
      console.error(`  ${name}: cannot parse GitHub URL`)
      failed.push(name)
      continue
    }

    try {
      const release = await getLatestRelease(slug)
      const tag = release.tag_name

      if (installed[name] === tag) {
        console.log(`  ${name}: ${tag} (up to date)`)
        continue
      }

      const asset = pickSetupAsset(release)
      if (!asset) {
        console.error(`  ${name}: no .exe asset in ${tag}`)
        failed.push(name)
        continue
      }

      console.log(`  ${name}: installing ${tag} (${asset.name})...`)
      const exePath = await downloadAsset(slug, asset, path.join(devfaultDir, "downloads"))
      execSync(`cmd /c start "" /wait "${exePath}" /S`, { stdio: "ignore" })

      installed = { ...installed, [name]: tag }
      writeJson(appsPath, installed)
      console.log(`  ${name}: ${tag} installed!`)
    } catch (err) {
      console.error(`  ${name}: failed - ${err.message.split("\n")[0]}`)
      failed.push(name)
    }
  }

  return failed
}

// ==================== add <url> ====================

if (cmd === "add") {
  if (!cmdArg) {
    console.error("Usage: devfault add <git-url>")
    process.exit(1)
  }

  const exists = config.repos.some((r) => normalizeUrl(r.url) === normalizeUrl(cmdArg))
  if (exists) {
    console.log(`Already in config: ${cmdArg}`)
    process.exit(0)
  }

  const updated = {
    ...config,
    repos: [...config.repos, { url: cmdArg }],
  }
  saveConfig(configPath, updated)

  const name = cmdArg.match(/\/([^/]+?)(\.git)?$/)?.[1] || cmdArg
  console.log(`Added: ${name}`)
  console.log(`Config: ${configPath} (${updated.repos.length} repos)`)
  process.exit(0)
}

// ==================== scan ====================

if (cmd === "scan") {
  if (!fs.existsSync(baseDir)) {
    console.error(`Base directory not found: ${baseDir}`)
    process.exit(1)
  }

  console.log(`\nScanning ${baseDir}...\n`)

  const existingUrls = new Set(config.repos.map((r) => normalizeUrl(r.url)))
  const added = []

  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = path.join(baseDir, entry.name)
    if (!fs.existsSync(path.join(dir, ".git"))) continue

    try {
      const url = execSync(`git -C "${dir}" remote get-url origin`, {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim()

      if (url && !existingUrls.has(normalizeUrl(url))) {
        added.push({ url })
        existingUrls.add(normalizeUrl(url))
      }
    } catch {}
  }

  if (added.length === 0) {
    console.log(`Found ${entries.length} dirs, all already in config.`)
    console.log(`Config: ${configPath} (${config.repos.length} repos)`)
    process.exit(0)
  }

  const updated = {
    ...config,
    repos: [...config.repos, ...added],
  }
  saveConfig(configPath, updated)

  for (const repo of added) {
    const name = repo.url.match(/\/([^/]+?)(\.git)?$/)?.[1] || repo.url
    console.log(`  Added: ${name}`)
  }
  console.log(`\nConfig updated! (${updated.repos.length} repos)`)
  process.exit(0)
}

// ==================== sync ====================

if (cmd === "sync") {
  const gitRoot = findGitRoot(path.dirname(configPath))

  if (!gitRoot) {
    console.error("Config is not inside a git repo. Cannot sync.")
    console.error(`Config path: ${configPath}`)
    process.exit(1)
  }

  console.log("\nSyncing config...\n")

  // Pull first
  try {
    execSync(`git -C "${gitRoot}" pull`, { stdio: "inherit" })
  } catch (err) {
    console.error(`Pull failed: ${err.message}`)
  }

  // Re-read config after pull (may have changed)
  const freshConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"))

  // Stage config file
  const relPath = path.relative(gitRoot, configPath)
  execSync(`git -C "${gitRoot}" add "${relPath}"`, { stdio: "inherit" })

  // Check if there's anything to commit
  try {
    execSync(`git -C "${gitRoot}" diff --cached --quiet`, { stdio: "ignore" })
    console.log(`\nAlready synced! (${freshConfig.repos.length} repos)`)
  } catch {
    // Has staged changes → commit + push
    const msg = `devfault: sync config (${freshConfig.repos.length} repos)`
    execSync(`git -C "${gitRoot}" commit -m "${msg}"`, { stdio: "inherit" })
    execSync(`git -C "${gitRoot}" push`, { stdio: "inherit" })
    console.log(`\nSynced! (${freshConfig.repos.length} repos)`)
  }

  process.exit(0)
}

// ==================== ls ====================

if (cmd === "ls" || cmd === "--list") {
  console.log("\nProjects:\n")
  for (const repo of config.repos) {
    const name = repoName(repo)
    const target = repoDir(repo)
    const cloned = fs.existsSync(path.join(target, ".git"))

    if (!cloned) {
      console.log(`  ${name.padEnd(22)} [not cloned]`)
      continue
    }

    const detected = smartDetect(target)
    const runCmd = getRunCmd(detected, repo)
    const pm = detected?.packageManager?.name

    if (runCmd) {
      const pmTag = pm && pm !== "npm" ? ` [${pm}]` : ""
      console.log(`  ${name.padEnd(22)} ${runCmd}${pmTag}`)
    } else {
      console.log(`  ${name.padEnd(22)} [no start command]`)
    }
  }
  console.log("")
  process.exit(0)
}

// ==================== run <name> ====================

if (cmd === "run" || cmd === "--run") {
  if (!cmdArg) {
    console.error("Usage: devfault run <name>")
    process.exit(1)
  }

  const repo = config.repos.find((r) => repoName(r).toLowerCase() === cmdArg.toLowerCase())
  if (!repo) {
    console.error(`Not found: ${cmdArg}`)
    process.exit(1)
  }

  const name = repoName(repo)
  const target = repoDir(repo)

  if (!fs.existsSync(target)) {
    console.error(`${name} not cloned yet. Run: devfault`)
    process.exit(1)
  }

  const detected = smartDetect(target)
  const runCmd = getRunCmd(detected, repo)

  if (!runCmd) {
    console.error(`${name}: no start command detected`)
    process.exit(1)
  }

  console.log(`Starting ${name}... (${runCmd})\n`)
  try {
    execSync(runCmd, { cwd: target, stdio: "inherit" })
  } catch {}
  process.exit(0)
}

// ==================== up ====================
// Headless full sync — designed to run unattended (autosync / logon).

if (cmd === "up") {
  const auto = process.argv.includes("--auto")
  const statePath = path.join(devfaultDir, "state.json")

  if (auto) {
    const state = readJson(statePath, {})
    const SIX_HOURS = 6 * 60 * 60 * 1000
    if (state.lastUp && Date.now() - state.lastUp < SIX_HOURS) process.exit(0)
  }

  console.log(`\n  DevFault up — ${new Date().toISOString()}`)
  console.log(`  Config: ${configPath}\n`)

  // 0. Config self-update (config lives in a git repo → pull latest)
  const cfgRoot = findGitRoot(path.dirname(configPath))
  let cfg = config
  if (cfgRoot) {
    try {
      execSync(`git -C "${cfgRoot}" pull --ff-only`, { stdio: "ignore" })
      cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"))
      console.log("  [config] pulled latest")
    } catch {
      console.log("  [config] pull skipped (offline or dirty)")
    }
  }

  // 1. Tools
  const toolsFailed = []
  for (const tool of cfg.tools || []) {
    if (!isToolInstalled(tool)) {
      console.log(`  [tools] installing ${tool.name}...`)
      try {
        execSync(
          `winget install -e --id ${tool.winget} --accept-source-agreements --accept-package-agreements`,
          { stdio: "ignore" }
        )
      } catch {
        toolsFailed.push(tool.name)
      }
    }
  }

  // 1.5 Global npm CLIs
  const npmFailed = installNpmGlobals(cfg.npmGlobal)

  // 2. Repos — clone missing (non-release), pull existing, deps only when HEAD moved
  const repoBase = expandHome(localOverrides.baseDir || cfg.baseDir)
  fs.mkdirSync(repoBase, { recursive: true })
  const reposFailed = []

  for (const repo of cfg.repos || []) {
    const name = repoName(repo)
    const target = repoDir(repo, repoBase)
    const isRelease = repo.dist === "release"
    const cloned = fs.existsSync(path.join(target, ".git"))

    try {
      if (!cloned) {
        if (isRelease) continue // app-only repo: source not needed, installed below
        console.log(`  [repos] ${name}: cloning...`)
        execSync(`git clone ${repo.url} "${target}"`, { stdio: "ignore" })
        if (repo.branch) {
          execSync(`git -C "${target}" checkout ${repo.branch}`, { stdio: "ignore" })
        }
        const detected = smartDetect(target)
        if (getInstallCmd(detected, repo)) {
          console.log(`  [repos] ${name}: installing deps...`)
          smartInstall(target, { packageManager: detected?.packageManager?.name || undefined })
        }
        console.log(`  [repos] ${name}: ready`)
        continue
      }

      const before = gitHead(target)
      // --autostash: unattended runs must survive lockfile drift from installs
      try {
        execSync(`git -C "${target}" pull --ff-only --autostash`, { stdio: "ignore" })
      } catch (err) {
        if (!resolveLockfileConflicts(target)) throw err
        execSync(`git -C "${target}" pull --ff-only --autostash`, { stdio: "ignore" })
        console.log(`  [repos] ${name}: recovered from lockfile conflict`)
      }
      const after = gitHead(target)

      if (before !== after) {
        console.log(`  [repos] ${name}: updated ${before?.slice(0, 7)} → ${after?.slice(0, 7)}`)
        if (!isRelease) {
          const detected = smartDetect(target)
          if (getInstallCmd(detected, repo)) {
            console.log(`  [repos] ${name}: reinstalling deps...`)
            smartInstall(target, { packageManager: detected?.packageManager?.name || undefined })
          }
        }
      }
    } catch (err) {
      console.error(`  [repos] ${name}: failed - ${err.message.split("\n")[0]}`)
      reposFailed.push(name)
    }
  }

  // 3. Packaged apps
  console.log("\n  [apps] checking releases...")
  const appsFailed = await installApps(cfg.repos || [])

  pinConfigToSyncedClone(repoBase)
  writeJson(statePath, { ...readJson(statePath, {}), lastUp: Date.now() })

  const allFailed = [...toolsFailed, ...npmFailed, ...reposFailed, ...appsFailed]
  console.log("")
  if (allFailed.length > 0) {
    console.log(`  Issues: ${allFailed.join(", ")}`)
  } else {
    console.log("  Everything up to date!")
  }
  console.log("")
  process.exit(allFailed.length > 0 ? 1 : 0)
}

// ==================== autosync ====================
// Register a hidden logon task (HKCU Run key, no admin needed) that keeps
// everything fresh via `devfault up --auto`.

if (cmd === "autosync") {
  if (process.platform !== "win32") {
    console.log("autosync is Windows-only for now. Use cron on this platform:")
    console.log("  @reboot devfault up --auto")
    process.exit(0)
  }

  const runKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"

  if (cmdArg === "off") {
    try {
      execSync(`reg delete "${runKey}" /v DevFault /f`, { stdio: "ignore" })
      console.log("Autosync disabled.")
    } catch {
      console.log("Autosync was not enabled.")
    }
    process.exit(0)
  }

  const logsDir = path.join(devfaultDir, "logs")
  fs.mkdirSync(logsDir, { recursive: true })
  const logPath = path.join(logsDir, "up.log")
  const vbsPath = path.join(devfaultDir, "devfault-up.vbs")

  const vbs = [
    'Set sh = CreateObject("WScript.Shell")',
    `sh.Run "cmd /c devfault up --auto >> ""${logPath}"" 2>&1", 0, False`,
    "",
  ].join("\r\n")
  fs.writeFileSync(vbsPath, vbs)

  execSync(`reg add "${runKey}" /v DevFault /t REG_SZ /d "wscript.exe \\"${vbsPath}\\"" /f`, {
    stdio: "ignore",
  })

  console.log("Autosync enabled: 'devfault up --auto' runs hidden at every logon.")
  console.log(`  Log: ${logPath}`)
  console.log("Disable with: devfault autosync off")
  process.exit(0)
}

// ==================== Default: full setup ====================

console.log(`\n  DevFault`)
console.log(`  =====`)
console.log(`  Config: ${configPath}\n`)

if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir, { recursive: true })
}

// === Phase 1: System tools ===
const toolsFailed = []

if (config.tools && config.tools.length > 0) {
  console.log("[Phase 1] System tools...\n")

  for (const tool of config.tools) {
    if (isToolInstalled(tool)) {
      console.log(`  ${tool.name} OK`)
    } else {
      console.log(`  Installing ${tool.name}...`)
      try {
        execSync(`winget install -e --id ${tool.winget} --accept-source-agreements --accept-package-agreements`, {
          stdio: "inherit",
        })
        console.log(`  ${tool.name} installed!\n`)
      } catch (err) {
        console.error(`  ${tool.name} failed: ${err.message}\n`)
        toolsFailed.push(tool.name)
      }
    }
  }

  console.log("")
}

// === Phase 1.5: Global npm CLIs ===
let npmGlobalFailed = []
if (config.npmGlobal && config.npmGlobal.length > 0) {
  console.log("[Phase 1.5] Global npm CLIs...\n")
  npmGlobalFailed = installNpmGlobals(config.npmGlobal)
  console.log(`  ${config.npmGlobal.length - npmGlobalFailed.length}/${config.npmGlobal.length} ready\n`)
}

// === Phase 2: Clone/pull repos ===
console.log("[Phase 2] Repos...\n")
console.log(`  Base: ${baseDir}\n`)

const failed = []

for (const repo of config.repos) {
  const name = repoName(repo)
  const target = repoDir(repo)

  // App-only repo: distributed as a packaged release, no source clone needed
  if (repo.dist === "release" && !fs.existsSync(path.join(target, ".git"))) {
    console.log(`  ${name}: packaged app (installed in Phase 3)\n`)
    continue
  }

  try {
    // Clone or pull
    if (fs.existsSync(path.join(target, ".git"))) {
      console.log(`  ${name}: pulling...`)
      execSync(`git -C "${target}" pull`, { stdio: "inherit" })
    } else {
      console.log(`  ${name}: cloning...`)
      execSync(`git clone ${repo.url} "${target}"`, { stdio: "inherit" })
    }

    if (repo.branch) {
      execSync(`git -C "${target}" checkout ${repo.branch}`, { stdio: "inherit" })
    }

    // === Phase 3: Smart detect + install ===
    const detected = smartDetect(target)
    const installCmd = getInstallCmd(detected, repo)
    const pm = detected?.packageManager?.name

    if (installCmd) {
      console.log(`  ${name}: installing deps...`)
      const result = smartInstall(target, { packageManager: pm || undefined })
      if (result.recovered.length > 0) {
        console.log(`  ${name}: recovered binaries: ${result.recovered.join(", ")}`)
      }
      if (!result.ok) {
        console.error(`  ${name}: install issues: ${result.failed.join(", ")}`)
      }
    }

    // Install npm globals if detected
    if (detected?.deps?.npmGlobal) {
      for (const g of detected.deps.npmGlobal) {
        try {
          execSync(`where ${g}`, { stdio: "ignore" })
        } catch {
          console.log(`  ${name}: installing ${g} globally...`)
          execSync(`npm install -g ${g}`, { stdio: "inherit" })
        }
      }
    }

    console.log(`  ${name}: done!\n`)
  } catch (err) {
    console.error(`  ${name}: failed - ${err.message}\n`)
    failed.push(name)
  }
}

// === Phase 3: Packaged apps ===
let appsFailed = []
if (config.repos.some((r) => r.dist === "release")) {
  console.log("[Phase 3] Packaged apps...\n")
  appsFailed = await installApps(config.repos)
  console.log("")
}

pinConfigToSyncedClone(baseDir)

// === Summary ===
console.log("")
if (toolsFailed.length > 0 || npmGlobalFailed.length > 0 || failed.length > 0 || appsFailed.length > 0) {
  if (toolsFailed.length > 0) console.log(`  Failed tools: ${toolsFailed.join(", ")}`)
  if (npmGlobalFailed.length > 0) console.log(`  Failed npm globals: ${npmGlobalFailed.join(", ")}`)
  if (failed.length > 0) console.log(`  Failed repos: ${failed.join(", ")}`)
  if (appsFailed.length > 0) console.log(`  Failed apps: ${appsFailed.join(", ")}`)
} else {
  console.log("  All tools, repos & apps ready!")
}
console.log(`\n  Run 'devfault ls' to see launchable projects.`)
console.log(`  Run 'devfault run <name>' to start one.\n`)
