// windows-signing.mjs — decide, from environment variables alone, whether a
// Windows electron-builder run signs its output, and with what.
//
// Default (no signing env vars): returns mode "none" and NO overrides, so the
// build is byte-for-byte the historical unsigned build driven by package.json
// (win.signAndEditExecutable=false). Every end-user install/update rebuild runs
// down this path — those machines never carry signing credentials.
//
// With credentials present (the release machine only) it returns a config
// override that run-electron-builder.mjs merges over package.json "build":
//
//   win.signAndEditExecutable = true   electron-builder's own edit+sign pass
//   win.forceCodeSigning      = true   a signing failure fails the build
//   copyright                 = <the same LegalCopyright rcedit stamps>
//   + the provider block (signtoolOptions or azureSignOptions)
//
// ORDER OF OPERATIONS (why stamping is still safe; electron-builder 26.15.x,
// app-builder-lib/out/platformPackager.js + winPackager.js):
//   1. afterExtract  -> scripts/after-extract.mjs: rcedit stamps icon + identity
//                       on the pristine electron.exe
//   2. rename electron.exe -> Somnus.exe, beforeCopyExtraFiles: resedit injects
//                       the ELECTRONASAR integrity resource
//   3. afterPack
//   4. signApp       -> signAndEditResources(): resedit rewrites version strings
//                       + icon, THEN signs Somnus.exe; then other .exe files
//   5. afterSign     -> scripts/notarize.mjs (no-op on win32)
//   6. NSIS target   -> builds + signs uninstaller and Setup.exe
// Every PE edit (1, 2, 4a) happens before the signature (4b), and nothing edits
// the exe afterwards, so signatures stay valid. Step 4a overwrites the rcedit
// strings with electron-builder's own values; `copyright` below (and
// author="Somnus" -> CompanyName, productName -> ProductName/FileDescription)
// keep them identical to what set-exe-identity.mjs stamps.
//
// Providers (first match wins; see SIGNING.md):
//   cert-store  SOMNUS_WIN_SIGN_SHA1=<thumbprint>  a cert visible in the Windows
//               certificate store (Certum SimplySign cloud, a YubiKey/HSM token,
//               ...), signed with signtool.
//   azure       SOMNUS_AZURE_SIGN_ENDPOINT/_ACCOUNT/_PROFILE/_PUBLISHER plus the
//               standard AZURE_TENANT_ID/AZURE_CLIENT_ID/AZURE_CLIENT_SECRET
//               (Azure Artifact Signing, formerly Trusted Signing).
//   SOMNUS_WIN_SIGN=off forces an unsigned build even when credentials exist.
//
// The azure provider deliberately keys off SOMNUS_-prefixed variables: the app
// itself reads AZURE_CLIENT_ID & co. for Azure OpenAI identity, so a developer
// who happens to have those exported must not silently flip into signing mode.

import { EXE_VERSION_STRINGS } from './set-exe-identity.mjs'

const CERTUM_TIMESTAMP_URL = 'http://time.certum.pl'
const AZURE_REQUIRED = [
  'SOMNUS_AZURE_SIGN_ENDPOINT',
  'SOMNUS_AZURE_SIGN_ACCOUNT',
  'SOMNUS_AZURE_SIGN_PROFILE',
  'SOMNUS_AZURE_SIGN_PUBLISHER'
]

function read(env, name) {
  const value = env[name]
  return typeof value === 'string' ? value.trim() : ''
}

function commonOverrides() {
  return {
    // electron-builder's resedit pass (step 4a) writes LegalCopyright from
    // `copyright`; keep it identical to the rcedit stamp.
    copyright: EXE_VERSION_STRINGS.LegalCopyright,
    win: {
      signAndEditExecutable: true,
      forceCodeSigning: true
    }
  }
}

function azureCredentialProblem(env) {
  const tenant = read(env, 'AZURE_TENANT_ID')
  const client = read(env, 'AZURE_CLIENT_ID')
  const secret = read(env, 'AZURE_CLIENT_SECRET')
  const certPath = read(env, 'AZURE_CLIENT_CERTIFICATE_PATH')
  const missing = []
  if (!tenant) missing.push('AZURE_TENANT_ID')
  if (!client) missing.push('AZURE_CLIENT_ID')
  if (!secret && !certPath) missing.push('AZURE_CLIENT_SECRET (or AZURE_CLIENT_CERTIFICATE_PATH)')
  return missing
}

/**
 * @returns {{mode: 'none'|'cert-store'|'azure', overrides: object|null, notes: string[], error?: string}}
 */
export function resolveWindowsSigning(env = process.env, platform = process.platform) {
  const notes = []
  const switchValue = read(env, 'SOMNUS_WIN_SIGN').toLowerCase()
  if (['off', '0', 'false', 'no'].includes(switchValue)) {
    return { mode: 'none', overrides: null, notes: ['SOMNUS_WIN_SIGN=off: building unsigned'] }
  }

  const sha1 = read(env, 'SOMNUS_WIN_SIGN_SHA1').replace(/[\s:]/g, '')
  const azureSet = AZURE_REQUIRED.filter(name => read(env, name))

  if (!sha1 && azureSet.length === 0) {
    return { mode: 'none', overrides: null, notes: ['no signing credentials in env: building unsigned'] }
  }

  if (platform !== 'win32') {
    return {
      mode: 'none',
      overrides: null,
      notes: [`signing env vars present but host is ${platform}; Windows signing only runs on a Windows host — building unsigned`]
    }
  }

  if (sha1) {
    if (!/^[0-9a-fA-F]{40}$/.test(sha1)) {
      return { mode: 'none', overrides: null, notes, error: `SOMNUS_WIN_SIGN_SHA1 must be a 40-hex-char certificate thumbprint (got ${sha1.length} chars)` }
    }
    if (azureSet.length) notes.push('both SOMNUS_WIN_SIGN_SHA1 and SOMNUS_AZURE_SIGN_* are set; using the certificate-store thumbprint')
    const timestamp = read(env, 'SOMNUS_WIN_SIGN_TIMESTAMP_URL') || CERTUM_TIMESTAMP_URL
    const overrides = commonOverrides()
    overrides.win.signtoolOptions = {
      certificateSha1: sha1.toUpperCase(),
      signingHashAlgorithms: ['sha256'],
      rfc3161TimeStampServer: timestamp,
      timeStampServer: timestamp
    }
    // "1.1.0" = the zip-packaged Windows Kits signtool. The legacy default
    // ("0.0.0") downloads winCodeSign-2.6.0.7z whose macOS symlinks make 7-Zip
    // fail on non-admin Windows — the reason signAndEditExecutable was turned
    // off in the first place (see set-exe-identity.mjs). SIGNTOOL_PATH, when
    // set, still takes precedence over either.
    overrides.toolsets = { winCodeSign: '1.1.0' }
    notes.push(`signing with certificate ${sha1.toUpperCase()} from the Windows certificate store; timestamp ${timestamp}`)
    return { mode: 'cert-store', overrides, notes }
  }

  const missingAzure = AZURE_REQUIRED.filter(name => !read(env, name))
  const missingCreds = azureCredentialProblem(env)
  if (missingAzure.length || missingCreds.length) {
    return {
      mode: 'none',
      overrides: null,
      notes,
      error: `Azure Artifact Signing is partially configured; missing: ${[...missingAzure, ...missingCreds].join(', ')}`
    }
  }
  const overrides = commonOverrides()
  overrides.win.azureSignOptions = {
    publisherName: read(env, 'SOMNUS_AZURE_SIGN_PUBLISHER'),
    endpoint: read(env, 'SOMNUS_AZURE_SIGN_ENDPOINT'),
    codeSigningAccountName: read(env, 'SOMNUS_AZURE_SIGN_ACCOUNT'),
    certificateProfileName: read(env, 'SOMNUS_AZURE_SIGN_PROFILE')
  }
  notes.push(
    `signing with Azure Artifact Signing (account ${overrides.win.azureSignOptions.codeSigningAccountName}, profile ${overrides.win.azureSignOptions.certificateProfileName})`
  )
  return { mode: 'azure', overrides, notes }
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

/** Deep-merge `overrides` onto a copy of `base` (arrays and scalars replace). */
export function mergeBuildConfig(base, overrides) {
  const out = { ...base }
  for (const [key, value] of Object.entries(overrides || {})) {
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? mergeBuildConfig(out[key], value) : value
  }
  return out
}
