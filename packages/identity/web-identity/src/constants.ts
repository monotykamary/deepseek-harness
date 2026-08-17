/**
 * Wire and storage constants of the web identity domain. Deployment-varying
 * choices are plugin config; these are protocol and security invariants.
 * @module @monotykamary/dsh-web-identity/constants
 */

/** Default identity header the trusted proxy sets. */
export const IDENTITY_HEADER_DEFAULT = 'x-forwarded-user'

/** Default trusted-proxy allowlist spec: the proxy runs on the same host. */
export const IDENTITY_PROXY_DEFAULT = 'loopback'

/** Maximum identity header name length accepted from config. */
export const IDENTITY_HEADER_NAME_MAX_LENGTH = 64

/** Maximum trusted-proxy spec length accepted from config. */
export const IDENTITY_PROXY_SPEC_MAX_LENGTH = 64

/** Maximum identity user length recorded from a header or a cookie. */
export const IDENTITY_USER_MAX_LENGTH = 256

/** Default WebAuthn relying-party display name. */
export const IDENTITY_RP_NAME_DEFAULT = 'dsh'

/** Maximum relying-party name length accepted from config. */
export const IDENTITY_RP_NAME_MAX_LENGTH = 64

/** Username bounds for passkey registration. */
export const IDENTITY_USERNAME_MIN_LENGTH = 1
/** Maximum accepted passkey username length. */
export const IDENTITY_USERNAME_MAX_LENGTH = 256

/** Session cookie name. */
export const AUTH_COOKIE_NAME = 'dsh-identity'

/** Session cookie lifetime: one week. */
export const AUTH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

/** HMAC secret byte length for the session token. */
export const AUTH_SECRET_BYTES = 32

/** WebAuthn challenge lifetime: five minutes. */
export const AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000

/** Maximum JSON body bytes a passkey route buffers. */
export const AUTH_MAX_BODY_BYTES = 64 * 1024

/** State-directory filename of the persisted cookie HMAC secret. */
export const AUTH_SECRET_FILENAME = 'auth-secret'
/** State-directory filename of the passkey user registry. */
export const AUTH_USERS_FILENAME = 'users.json'
/** State-directory filename of the passkey credential registry. */
export const AUTH_CREDENTIALS_FILENAME = 'credentials.json'
/** State-directory filename of the generated operator bearer token. */
export const AUTH_OPERATOR_TOKEN_FILENAME = 'operator-token'

/** Local-storage key the web client reads for the operator bearer token. */
export const OPERATOR_TOKEN_STORAGE_KEY = 'dsh.operatorToken'
