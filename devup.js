#!/usr/bin/env node

import { execSync } from "child_process"
import fs from "fs"
import path from "path"
import os from "os"

// --init：產生範例 config 到 ~/.devup/
if (process.argv.includes("--init")) {
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

console.log(`📄 Using config: ${configPath}\n`)

const config = JSON.parse(fs.readFileSync(configPath, "utf-8"))
const baseDir = path.resolve(config.baseDir.replace("~", os.homedir()))

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
