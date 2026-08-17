import { describe, expect, it } from 'vitest'
import { renderLoginPage } from '../src/login-page.ts'

describe('renderLoginPage', () => {
  const page = renderLoginPage()

  it('is a complete HTML document with the passkey and operator forms', () => {
    expect(page).toContain('<!DOCTYPE html>')
    expect(page).toContain('id="login"')
    expect(page).toContain('id="register"')
    expect(page).toContain('id="operator"')
    expect(page).toContain('/auth/passkey/login/options')
    expect(page).toContain('/auth/passkey/register/verify')
  })

  it('interpolates the operator-token storage key into the page script', () => {
    expect(page).toContain("localStorage.setItem('dsh.operatorToken', token)")
  })
})
