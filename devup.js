#!/usr/bin/env node

import { execSync } from "child_process"
import fs from "fs"
import path from "path"
import os from "os"

const args = process.argv.slice(2)

// --init：產生範例 config 到 ~/.devup/
if (args.includes("--init")) {
  const initDir = path.join(os.homedir(), ".devup")
  const initPath = path.join(initDir, "dev.config.json")

  if (fs.existsSync(initPath)) {
    console.log(`⚠️  設定檔已存在：${initPath}`)
    process.exit(0)
  }

  const template = {
    baseDir: "~/workspace",
    repos: [
      {
        name: "my-project",
        url: "git@github.com:yourname/my-project.git",
        branch: "main",
        postInstall: "npm install",
      },
    ],
  }

  fs.mkdirSync(initDir, { recursive: true })
  fs.writeFileSync(initPath, JSON.stringify(template, null, 2) + "\n")
  console.log(`✅ 範例設定已建立：${initPath}`)
  console.log("👉 編輯這個檔案，加入你的 repos，然後執行 devup")
  process.exit(0)
}

// Config 搜尋順序：
// 1. 當前目錄的 dev.config.json
// 2. ~/.devup/dev.config.json（推薦放這）
const candidates = [
  path.join(process.cwd(), "dev.config.json"),
  path.join(os.homedir(), ".devup", "dev.config.json"),
]

const configPath = candidates.find((p) => fs.existsSync(p))

if (!configPath) {
  console.error("❌ 找不到 dev.config.json")
  console.error("")
  console.error("請建立設定檔在以下任一位置：")
  console.error(`  1. ./dev.config.json`)
  console.error(`  2. ~/.devup/dev.config.json`)
  console.error("")
  console.error("或執行 devup --init 產生範例設定")
  process.exit(1)
}

const config = JSON.parse(fs.readFileSync(configPath, "utf-8"))
const baseDir = path.resolve(config.baseDir.replace("~", os.homedir()))

// --list：列出所有可啟動的專案
if (args.includes("--list")) {
  const runnable = config.repos.filter((r) => r.run)
  if (runnable.length === 0) {
    console.log("沒有設定 run 指令的專案")
    process.exit(0)
  }
  console.log("\n可啟動的專案：\n")
  for (const repo of runnable) {
    console.log(`  ${repo.name.padEnd(20)} → ${repo.run}`)
  }
  console.log("")
  process.exit(0)
}

// --run <name>：啟動專案
const runIdx = args.indexOf("--run")
if (runIdx !== -1) {
  const name = args[runIdx + 1]
  if (!name) {
    console.error("❌ 請指定專案名稱：devup --run <name>")
    process.exit(1)
  }

  const repo = config.repos.find((r) => r.name.toLowerCase() === name.toLowerCase())
  if (!repo) {
    console.error(`❌ 找不到專案：${name}`)
    process.exit(1)
  }
  if (!repo.run) {
    console.error(`❌ ${repo.name} 沒有設定 run 指令`)
    process.exit(1)
  }

  const target = path.join(baseDir, repo.name)
  if (!fs.existsSync(target)) {
    console.error(`❌ 專案目錄不存在：${target}`)
    console.error("   請先執行 devup 安裝")
    process.exit(1)
  }

  console.log(`🚀 Starting ${repo.name}... (${repo.run})\n`)
  try {
    execSync(repo.run, { cwd: target, stdio: "inherit" })
  } catch {}
  process.exit(0)
}

// === Default: full setup ===
console.log(`📄 Using config: ${configPath}\n`)

if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir, { recursive: true })
}

// === Phase 1: Install tools ===
const toolsFailed = []

if (config.tools && config.tools.length > 0) {
  console.log("🔧 Phase 1: Checking system tools...\n")

  for (const tool of config.tools) {
    // 先用 where 檢查 PATH，找不到再用 winget list 確認是否已裝
    let installed = false
    try {
      execSync(`where ${tool.cmd}`, { stdio: "ignore" })
      installed = true
    } catch {
      try {
        const out = execSync(`winget list --id ${tool.winget} --accept-source-agreements`, { encoding: "utf-8" })
        if (out.includes(tool.winget)) installed = true
      } catch {}
    }

    if (installed) {
      console.log(`✅ ${tool.name} already installed, skipping`)
    } else {
      console.log(`📦 Installing ${tool.name}...`)
      try {
        execSync(`winget install -e --id ${tool.winget} --accept-source-agreements --accept-package-agreements`, { stdio: "inherit" })
        console.log(`✅ ${tool.name} installed!\n`)
      } catch (err) {
        console.error(`❌ ${tool.name} install failed: ${err.message}\n`)
        toolsFailed.push(tool.name)
      }
    }
  }

  if (toolsFailed.length > 0) {
    console.log(`⚠️  Some tools failed: ${toolsFailed.join(", ")}`)
    console.log("   Continuing with repos anyway...\n")
  } else {
    console.log("🔧 All tools ready!\n")
  }
}

// === Phase 2: Clone/pull repos ===
console.log("📂 Phase 2: Setting up repos...")
console.log(`📂 Base directory: ${baseDir}\n`)

const failed = []

for (const repo of config.repos) {
  const target = path.join(baseDir, repo.name)

  try {
    if (fs.existsSync(path.join(target, ".git"))) {
      console.log(`🔄 Pulling ${repo.name}...`)
      execSync(`git -C "${target}" pull`, { stdio: "inherit" })
    } else {
      console.log(`📥 Cloning ${repo.name}...`)
      execSync(`git clone ${repo.url} "${target}"`, { stdio: "inherit" })
    }

    if (repo.branch) {
      console.log(`🌿 Checking out branch: ${repo.branch}`)
      execSync(`git -C "${target}" checkout ${repo.branch}`, { stdio: "inherit" })
    }

    if (repo.postInstall) {
      console.log(`⚙️  Running postInstall: ${repo.postInstall}`)
      execSync(repo.postInstall, { cwd: target, stdio: "inherit" })
    }

    console.log(`✅ ${repo.name} done!\n`)
  } catch (err) {
    console.error(`❌ ${repo.name} failed: ${err.message}\n`)
    failed.push(repo.name)
  }
}

if (toolsFailed.length > 0 || failed.length > 0) {
  if (toolsFailed.length > 0) console.log(`⚠️  Failed tools: ${toolsFailed.join(", ")}`)
  if (failed.length > 0) console.log(`⚠️  Failed repos: ${failed.join(", ")}`)
} else {
  console.log("🚀 All tools & repos are ready!")
}
