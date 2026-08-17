/**
 * File-backed registry of passkey key material (`credentials.json` in the
 * state directory): credential id → { publicKey (base64), counter, username }.
 * The login verify path looks the credential up by the assertion's id,
 * reconstructs it for simplewebauthn, and updates the replay-protection
 * counter on success. Atomic tmp+rename write, graceful fallback to empty on
 * a missing or corrupt file.
 * @module @monotykamary/dsh-web-identity/credential-store
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import z from '@monotykamary/schemastery'

/** One stored credential: the COSE public key bytes (base64), counter, owner. */
export interface StoredCredential {
  id: string
  publicKey: string
  counter: number
  username: string
}

const credentialsFileSchema = z.object({
  version: z.const(1),
  credentials: z.dict(z.object({
    id: z.string().required(),
    publicKey: z.string().required(),
    counter: z.natural().required(),
    username: z.string().required(),
  })),
})

/** Persisted credentials document. */
export class CredentialStore {
  private readonly credentials = new Map<string, StoredCredential>()

  /**
   * Load the store.
   * @param filePath - the credentials.json path; absent/corrupt files start empty.
   */
  constructor(private readonly filePath: string) {
    this.load()
  }

  /**
   * One credential, or null.
   * @param id - the credential id to read.
   * @returns the stored credential, or null when absent.
   */
  get(id: string): StoredCredential | null {
    return this.credentials.get(id) ?? null
  }

  /**
   * Store one credential (overwrites the same id).
   * @param credential - the credential to store.
   */
  put(credential: StoredCredential): void {
    this.credentials.set(credential.id, credential)
    this.persist()
  }

  /**
   * Update a credential's replay-protection counter; unknown ids are ignored.
   * @param id - the credential id to update.
   * @param counter - the verified new counter.
   */
  updateCounter(id: string, counter: number): void {
    const credential = this.credentials.get(id)
    if (credential === undefined) return
    credential.counter = counter
    this.persist()
  }

  private load(): void {
    let raw: string
    try {
      raw = readFileSync(this.filePath, 'utf8')
    } catch {
      return
    }
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      console.warn('web-identity: credentials file invalid; ignoring (' + this.filePath + ')')
      return
    }
    let parsed: { credentials: Record<string, StoredCredential> }
    try {
      parsed = credentialsFileSchema(json as never)
    } catch {
      console.warn('web-identity: credentials file invalid; ignoring (' + this.filePath + ')')
      return
    }
    this.credentials.clear()
    for (const [id, credential] of Object.entries(parsed.credentials)) {
      this.credentials.set(id, { ...credential })
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const payload = {
      version: 1,
      credentials: Object.fromEntries(this.credentials.entries()),
    }
    const tmpPath = this.filePath + '.tmp'
    writeFileSync(tmpPath, JSON.stringify(payload, null, 2) + '\n', 'utf8')
    renameSync(tmpPath, this.filePath)
  }
}
