/**
 * File-backed registry of passkey users (`users.json` in the state
 * directory): username → the credential ids that authenticate them. Holds no
 * key material (that is the credential store); this just answers "which
 * credentials belong to this user" for registration exclude-lists and login
 * allow-lists. Atomic tmp+rename write, graceful fallback to empty on a
 * missing or corrupt file.
 * @module @monotykamary/dsh-web-identity/user-store
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import z from '@monotykamary/schemastery'

/** One stored user: its username and the credential ids that prove it. */
export interface StoredUser {
  username: string
  credentialIds: string[]
}

const usersFileSchema = z.object({
  version: z.const(1),
  users: z.dict(z.object({
    username: z.string().required(),
    credentialIds: z.array(z.string()),
  })),
})

/** Persisted users document. */
export class UserStore {
  private readonly users = new Map<string, StoredUser>()

  /**
   * Load the store.
   * @param filePath - the users.json path; absent/corrupt files start empty.
   */
  constructor(private readonly filePath: string) {
    this.load()
  }

  /**
   * One user's snapshot (fresh copies), or null.
   * @param username - the user to read.
   * @returns the stored user, or null when absent.
   */
  get(username: string): StoredUser | null {
    const user = this.users.get(username)
    return user === undefined ? null : { ...user, credentialIds: [...user.credentialIds] }
  }

  /**
   * Get a user or create it (persisted immediately when created).
   * @param username - the user to read or create.
   * @returns the stored user (fresh copies).
   */
  findOrCreate(username: string): StoredUser {
    const existing = this.users.get(username)
    if (existing !== undefined) return { ...existing, credentialIds: [...existing.credentialIds] }
    const user: StoredUser = { username, credentialIds: [] }
    this.users.set(username, user)
    this.persist()
    return { ...user, credentialIds: [...user.credentialIds] }
  }

  /**
   * Append one credential id to a user's allow-list; unknown users are ignored.
   * @param username - the user owning the credential.
   * @param credentialId - the credential id to append.
   */
  addCredential(username: string, credentialId: string): void {
    const user = this.users.get(username)
    if (user === undefined || user.credentialIds.includes(credentialId)) return
    user.credentialIds.push(credentialId)
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
      console.warn('web-identity: users file invalid; ignoring (' + this.filePath + ')')
      return
    }
    let parsed: { users: Record<string, StoredUser> }
    try {
      parsed = usersFileSchema(json as never)
    } catch {
      console.warn('web-identity: users file invalid; ignoring (' + this.filePath + ')')
      return
    }
    this.users.clear()
    for (const [username, user] of Object.entries(parsed.users)) {
      this.users.set(username, { username: user.username, credentialIds: [...user.credentialIds] })
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const payload = {
      version: 1,
      users: Object.fromEntries(this.users.entries()),
    }
    const tmpPath = this.filePath + '.tmp'
    writeFileSync(tmpPath, JSON.stringify(payload, null, 2) + '\n', 'utf8')
    renameSync(tmpPath, this.filePath)
  }
}
