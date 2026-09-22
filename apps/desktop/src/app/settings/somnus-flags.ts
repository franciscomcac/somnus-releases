// Somnus: Nous-only settings surfaces (Nous Portal subscription / sign-in, Nous Cloud) do not
// apply to Somnus customers. The code stays compiled for upstream parity; these flags keep it
// unreachable. Tests that exercise the upstream Nous paths mock this module to `true`.

/** Nous-managed tool backends (``requires_nous_auth`` rows) in Settings → Keys/Capabilities. */
export const SHOW_NOUS_MANAGED_TOOLS = false as boolean

/** The Nous Cloud connection kind (portal sign-in + agent discovery) in Settings → Gateways. */
export const SHOW_NOUS_CLOUD = false as boolean
