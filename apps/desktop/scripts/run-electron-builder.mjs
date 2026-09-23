// Resolve electronDist at runtime (#38673, #47917): electron-builder 26.8.x can
// re-unpack a broken Electron.app; reusing the installed dist dodges that.
// npm workspace hoisting is non-deterministic — require.resolve finds electron
// wherever it landed. Dist present → -c.electronDist=<abs>/dist; absent → let
// electron-builder fetch via @electron/get (electronVersion + ELECTRON_MIRROR).

import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import os from "node:os"

import { mergeBuildConfig, resolveWindowsSigning } from "./windows-signing.mjs"

const require = createRequire(import.meta.url)

function electronDistDir() {
  try {
    return path.join(path.dirname(require.resolve("electron/package.json")), "dist")
  } catch {
    return null
  }
}

function distBinary(dist) {
  if (process.platform === "darwin") {
    return path.join(dist, "Electron.app", "Contents", "MacOS", "Electron")
  }
  if (process.platform === "win32") {
    return path.join(dist, "electron.exe")
  }
  return path.join(dist, "electron")
}

function electronBuilderCli() {
  const pkgJson = require.resolve("electron-builder/package.json")
  const bin = require(pkgJson).bin
  const rel = typeof bin === "string" ? bin : bin["electron-builder"]
  return path.join(path.dirname(pkgJson), rel)
}

const dist = electronDistDir()
// Local `hermes desktop` builds only ever package (--dir or dist), never
// publish a GitHub release — no CI workflow drives this script. But the npm
// lifecycle env sets CI=1 (so esbuild's postinstall doesn't try interactive
// animations), and electron-builder treats CI=1 as a signal to implicitly
// resolve a publish target. That resolution reads <projectDir>/.git/config
// directly — projectDir here is apps/desktop, which has no .git of its own
// (only the repo root does) and no "repository" field in its package.json —
// so it fails with "Cannot detect repository by .git/config". Pin publish to
// "never" so electron-builder skips that lookup entirely.
// Somnus: the release script passes `--publish always` to upload to GitHub
// Releases (auto-update feed); every other build stays local-only.
const args = process.argv.slice(2).includes("--publish") ? [] : ["--publish", "never"]
const localElectronDist = dist && fs.existsSync(distBinary(dist)) ? dist : null
if (!localElectronDist) {
  console.warn(
    "[run-electron-builder] no local electron dist; electron-builder will fetch " +
      "via @electron/get (electronVersion + ELECTRON_MIRROR)."
  )
}

// Windows release signing (SIGNING.md). Only when signing env vars are present
// do we hand electron-builder a generated config file = package.json "build"
// deep-merged with the signing overrides. Two electron-builder quirks force
// this shape:
//   * CLI dotted flags (`-c.win.x=true`) arrive as STRINGS (only nsis.* and
//     extraMetadata.* are coerced), and yargs number-parses digit-only values
//     such as some thumbprints, so the overrides must be real JSON.
//   * Mixing `--config <file>` with any `-c.x=y` flag turns the file into an
//     `extends` PARENT of package.json "build" — package.json would then win
//     and re-disable signing. So in signing mode electronDist goes INTO the
//     file and dotted -c flags are refused.
// Without credentials nothing changes: the build reads package.json "build"
// plus -c.electronDist exactly as before and stays unsigned.
const userArgs = process.argv.slice(2)
const dryRun = userArgs.includes("--signing-dry-run")
const passthrough = userArgs.filter(arg => arg !== "--signing-dry-run")
const signing = resolveWindowsSigning()
for (const note of signing.notes) {
  console.log(`[run-electron-builder] ${note}`)
}
if (signing.error) {
  console.error(`[run-electron-builder] ${signing.error}`)
  process.exit(1)
}

let signingConfigFile = null
if (signing.overrides) {
  const configFlag = passthrough.find(arg => /^(-c|--config)([.=]|$)/.test(arg))
  if (configFlag) {
    console.error(
      `[run-electron-builder] "${configFlag}" cannot be combined with env-driven signing ` +
        "(it would let package.json override the signing config); put the option in package.json \"build\" instead"
    )
    process.exit(1)
  }
  const pkg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "..", "package.json"), "utf8"))
  const merged = mergeBuildConfig(pkg.build || {}, signing.overrides)
  if (localElectronDist) {
    merged.electronDist = localElectronDist
  }
  if (dryRun) {
    console.log(JSON.stringify({ mode: signing.mode, overrides: signing.overrides, win: merged.win, toolsets: merged.toolsets ?? null, copyright: merged.copyright }, null, 2))
    process.exit(0)
  }
  // Relative paths inside the config (hooks, icon, entitlements, output dir)
  // resolve against the project dir, not the config file's dir, so a temp
  // location behaves exactly like package.json.
  signingConfigFile = path.join(os.tmpdir(), `somnus-electron-builder-signed-${process.pid}-${Date.now()}.json`)
  fs.writeFileSync(signingConfigFile, JSON.stringify(merged, null, 2), "utf8")
  args.push("--config", signingConfigFile)
} else {
  if (dryRun) {
    console.log(JSON.stringify({ mode: signing.mode, overrides: null }, null, 2))
    process.exit(0)
  }
  if (localElectronDist) {
    args.push(`-c.electronDist=${localElectronDist}`)
  }
}

args.push(...passthrough)

const result = spawnSync(process.execPath, [electronBuilderCli(), ...args], {
  stdio: "inherit",
})
if (signingConfigFile) {
  try {
    fs.rmSync(signingConfigFile, { force: true })
  } catch {
    // Best-effort cleanup of the generated config.
  }
}
if (result.error) {
  console.error(`[run-electron-builder] spawn failed: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status == null ? 1 : result.status)
