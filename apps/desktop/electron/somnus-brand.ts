// Somnus distribution constants. Every Somnus-specific value the Electron side
// needs lives here so upstream Hermes merges touch as few lines as possible.

export const SOMNUS = {
  appName: 'Somnus',
  // Must match package.json build.appId (Windows AUMID / Start Menu shortcut).
  appId: 'com.somnus.desktop',
  protocol: 'somnus',
  // Data folder name: %LOCALAPPDATA%\somnus on Windows, ~/.somnus elsewhere.
  // Deliberately separate from Hermes so a customer's own Hermes is never touched.
  homeDirName: 'somnus',
  homeDirNamePosix: '.somnus',
  // Public repo that hosts the engine snapshot + install scripts customers download.
  releasesRepo: 'franciscomcac/somnus-releases',
  releasesBranch: 'main',
  // The Somnus gateway every request goes through.
  gatewayUrl: 'https://gateway-production-c837.up.railway.app/v1',
  // Somnus accounts website: sign-up, billing, and the app sign-in handoff.
  accountsUrl: 'https://accounts-production-3073.up.railway.app'
} as const

export const SOMNUS_RELEASES_GIT_URL = `https://github.com/${SOMNUS.releasesRepo}.git`
export const SOMNUS_RELEASES_RAW_BASE = `https://raw.githubusercontent.com/${SOMNUS.releasesRepo}`
