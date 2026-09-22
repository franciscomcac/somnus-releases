import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'vitest'

import { EXE_VERSION_STRINGS } from './set-exe-identity.mjs'
import { mergeBuildConfig, resolveWindowsSigning } from './windows-signing.mjs'

const require = createRequire(import.meta.url)
const desktopPackage = require('../package.json')

const THUMBPRINT = 'ab cd ef 01 23 45 67 89 ab cd ef 01 23 45 67 89 ab cd ef 01'
const AZURE = {
  SOMNUS_AZURE_SIGN_ENDPOINT: 'https://weu.codesigning.azure.net/',
  SOMNUS_AZURE_SIGN_ACCOUNT: 'acct',
  SOMNUS_AZURE_SIGN_PROFILE: 'profile',
  SOMNUS_AZURE_SIGN_PUBLISHER: 'Somnus Publisher',
  AZURE_TENANT_ID: 'tenant',
  AZURE_CLIENT_ID: 'client',
  AZURE_CLIENT_SECRET: 'secret'
}

// Unsigned stays the default: every end-user install/update rebuild has no
// signing env, and those builds must keep package.json's signAndEditExecutable
// =false path (no winCodeSign download, rcedit identity stamp only). The app's
// own Azure OpenAI identity vars alone must not flip a build into signing.
test('without SOMNUS_ signing vars (or off-host / forced off) the build config is untouched', () => {
  const unsignedEnvs = [
    [{}, 'win32'],
    [{ AZURE_TENANT_ID: 't', AZURE_CLIENT_ID: 'c', AZURE_CLIENT_SECRET: 's' }, 'win32'],
    [{ SOMNUS_WIN_SIGN_SHA1: THUMBPRINT }, 'linux'],
    [{ SOMNUS_WIN_SIGN: 'off', SOMNUS_WIN_SIGN_SHA1: THUMBPRINT, ...AZURE }, 'win32']
  ]
  for (const [env, platform] of unsignedEnvs) {
    const result = resolveWindowsSigning(env, platform)
    assert.equal(result.mode, 'none')
    assert.equal(result.overrides, null)
    assert.equal(result.error, undefined)
  }
  assert.equal(desktopPackage.build.win.signAndEditExecutable, false)
})

// When signing, electron-builder re-edits the exe resources right before it
// signs; the copyright it writes must equal the rcedit stamp, and signing must
// be forced so a broken credential fails the release instead of shipping an
// unsigned installer. A half-configured Azure setup is an error, not a silent
// unsigned build.
test('signing modes enable edit+sign, force it, and keep the stamped identity', () => {
  for (const env of [{ SOMNUS_WIN_SIGN_SHA1: THUMBPRINT }, AZURE]) {
    const { overrides, error } = resolveWindowsSigning(env, 'win32')
    assert.equal(error, undefined)
    const merged = mergeBuildConfig(desktopPackage.build, overrides)
    assert.equal(merged.win.signAndEditExecutable, true)
    assert.equal(merged.win.forceCodeSigning, true)
    assert.equal(merged.copyright, EXE_VERSION_STRINGS.LegalCopyright)
    assert.equal(merged.afterExtract, desktopPackage.build.afterExtract)
    assert.deepEqual(merged.win.target, desktopPackage.build.win.target)
  }

  const partial = resolveWindowsSigning({ SOMNUS_AZURE_SIGN_ENDPOINT: 'x' }, 'win32')
  assert.equal(partial.overrides, null)
  assert.match(partial.error, /SOMNUS_AZURE_SIGN_ACCOUNT/)
})
