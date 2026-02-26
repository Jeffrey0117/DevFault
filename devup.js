#!/usr/bin/env node

import { execSync } from "child_process"
import { createRequire } from "module"
import fs from "fs"
import path from "path"
import os from "os"

const require = createRequire(import.meta.url)
const { detect } = require("zerosetup/lib/detect")

const cmd = process.argv[2]
const cmdArg = process.argv[3]

// ==================== init ====================

if (cmd === "init" || cmd === "--init") {
  const initDir = path.join(os.homedir(), ".devup")
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
  console.log("Edit the file, add your repos, then run: devup")
  process.exit(0)
}

// ==================== Load config ====================

const candidates = [
  path.join(process.cwd(), "dev.config.json"),
  path.join(os.homedir(), ".devup", "dev.config.json"),
]

const configPath = candidates.find((p) => fs.existsSync(p))

if (!configPath) {
  console.error("No dev.config.json found.\n")
  console.error("Create one at:")
  console.error("  1. ./dev.config.json")
  console.error("  2. ~/.devup/dev.config.json\n")
  console.error("Or run: devup init")
  process.exit(1)
}

const config = JSON.parse(fs.readFileSync(configPath, "utf-8"))
const baseDir = path.resolve(config.baseDir.replace("~", os.homedir()))

// ==================== Helpers ====================

function repoName(repo) {
  if (repo.name) return repo.name
  // Extract from URL: https://github.com/user/my-project.git → my-project
  const match = repo.url.match(/\/([^/]+?)(\.git)?$/)
  return match ? match[1] : repo.url
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
  try {
    execSync(`where ${tool.cmd}`, { stdio: "ignore" })
    return true
  } catch {
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
}

// ==================== ls ====================

if (cmd === "ls" || cmd === "--list") {
  console.log("\nProjects:\n")
  for (const repo of config.repos) {
    const name = repoName(repo)
    const target = path.join(baseDir, name)
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
    console.error("Usage: devup run <name>")
    process.exit(1)
  }

  const repo = config.repos.find((r) => repoName(r).toLowerCase() === cmdArg.toLowerCase())
  if (!repo) {
    console.error(`Not found: ${cmdArg}`)
    process.exit(1)
  }

  const name = repoName(repo)
  const target = path.join(baseDir, name)

  if (!fs.existsSync(target)) {
    console.error(`${name} not cloned yet. Run: devup`)
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

// ==================== Default: full setup ====================

console.log(`\n  DevUp`)
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

// === Phase 2: Clone/pull repos ===
console.log("[Phase 2] Repos...\n")
console.log(`  Base: ${baseDir}\n`)

const failed = []

for (const repo of config.repos) {
  const name = repoName(repo)
  const target = path.join(baseDir, name)

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
      const pmLabel = pm && pm !== "npm" ? ` (${pm})` : ""
      console.log(`  ${name}: installing deps${pmLabel}...`)
      execSync(installCmd, { cwd: target, stdio: "inherit" })
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

// === Summary ===
console.log("")
if (toolsFailed.length > 0 || failed.length > 0) {
  if (toolsFailed.length > 0) console.log(`  Failed tools: ${toolsFailed.join(", ")}`)
  if (failed.length > 0) console.log(`  Failed repos: ${failed.join(", ")}`)
} else {
  console.log("  All tools & repos ready!")
}
console.log(`\n  Run 'devup ls' to see launchable projects.`)
console.log(`  Run 'devup run <name>' to start one.\n`)
