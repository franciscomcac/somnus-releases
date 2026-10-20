const PROVIDER_SETUP_ERROR_RE =
  // Somnus: the backend's own wording ("Somnus is not connected to any AI provider yet") is
  // a setup state, not an error — the sign-in panel already says what to do.
  /No (?:inference|Somnus) provider(?: is)? configured|no_provider_configured|set an API key|not connected to any AI provider/i

const SESSION_INFO_CREDENTIAL_WARNING_RE = /^No API key configured for provider '[^']*'\. First message will fail\.$/

export function isProviderSetupErrorMessage(message: null | string | undefined): boolean {
  const text = message?.trim()

  if (!text) {
    return false
  }

  return PROVIDER_SETUP_ERROR_RE.test(text) || SESSION_INFO_CREDENTIAL_WARNING_RE.test(text)
}
