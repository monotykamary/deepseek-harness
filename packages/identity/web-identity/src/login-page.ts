/**
 * The static passkey login page: a self-contained HTML document (no external
 * assets) running the WebAuthn register/login ceremonies against the
 * `/auth/passkey/*` JSON endpoints and storing an operator bearer token in
 * localStorage. On success it redirects to `/`, where the app boots with the
 * session cookie (or the operator token header) in place.
 * @module @monotykamary/dsh-web-identity/login-page
 */

import { OPERATOR_TOKEN_STORAGE_KEY } from './constants.ts'

/**
 * Render the login page document.
 * @returns the self-contained HTML page.
 */
export function renderLoginPage(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DeepSeek Harness 登录</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #101418; color: #e6e8eb; font: 15px/1.6 system-ui, -apple-system, sans-serif;
  }
  main { width: 340px; padding: 32px 28px; background: #171c21; border: 1px solid #2a323b; border-radius: 12px; }
  h1 { margin: 0 0 6px; font-size: 19px; font-weight: 600; }
  p.sub { margin: 0 0 20px; color: #9aa4ad; font-size: 13px; }
  label { display: block; margin: 14px 0 6px; color: #c8ced4; font-size: 13px; }
  input {
    width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px;
    border: 1px solid #2a323b; background: #101418; color: #e6e8eb; font: inherit;
  }
  input:focus { outline: none; border-color: #4d7bd9; }
  button {
    width: 100%; margin-top: 14px; padding: 9px 12px; border-radius: 8px; cursor: pointer;
    border: 1px solid #2a323b; background: #232a32; color: #e6e8eb; font: inherit;
  }
  button.primary { background: #4d7bd9; border-color: #4d7bd9; color: #fff; }
  button:disabled { opacity: 0.5; cursor: default; }
  #status { min-height: 20px; margin-top: 14px; color: #e08c8c; font-size: 13px; white-space: pre-wrap; }
  hr { border: none; border-top: 1px solid #2a323b; margin: 22px 0 4px; }
  .hint { color: #9aa4ad; font-size: 12px; margin-top: 8px; }
</style>
</head>
<body>
<main>
  <h1>DeepSeek Harness</h1>
  <p class="sub">此实例启用了 Passkey 身份验证。</p>
  <label for="username">用户名</label>
  <input id="username" autocomplete="username webauthn" placeholder="登录可留空；注册必填">
  <button id="login" class="primary">登录 Passkey</button>
  <button id="register">注册新 Passkey</button>
  <hr>
  <label for="operator-token">运营者令牌（可选）</label>
  <input id="operator-token" type="password" placeholder="Bearer 令牌">
  <button id="operator">以运营者身份进入</button>
  <div id="status"></div>
  <p class="hint">Passkey 绑定当前网址；在另一个地址（例如 tailnet 域名）访问时需要重新注册。</p>
</main>
<script>
(function () {
  'use strict'
  var statusEl = document.getElementById('status')
  var usernameEl = document.getElementById('username')
  function setStatus(text) { statusEl.textContent = text || '' }
  function setBusy(busy) {
    ['login', 'register', 'operator'].forEach(function (id) {
      document.getElementById(id).disabled = busy
    })
  }
  function b64url(buf) {
    var bytes = new Uint8Array(buf)
    var bin = ''
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+\$/, '')
  }
  function unb64url(str) {
    var bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(bin, function (c) { return c.charCodeAt(0) }).buffer
  }
  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    }).then(function (response) {
      return response.json().then(function (payload) {
        return { ok: response.ok, status: response.status, payload: payload }
      })
    })
  }
  function fail(result) {
    var error = result.payload && result.payload.error
    setStatus('操作失败' + (error ? '：' + error : '') + '（HTTP ' + result.status + '）')
  }
  function authenticate() {
    var username = usernameEl.value.trim()
    setBusy(true)
    setStatus('')
    post('/auth/passkey/login/options', username ? { username: username } : {})
      .then(function (result) {
        if (!result.ok) { fail(result); return }
        var options = result.payload
        var publicKey = {
          challenge: unb64url(options.challenge),
          rpId: options.rpId,
          userVerification: options.userVerification,
          timeout: options.timeout,
        }
        if (options.allowCredentials) {
          publicKey.allowCredentials = options.allowCredentials.map(function (c) {
            var entry = { id: unb64url(c.id), type: c.type }
            if (c.transports) entry.transports = c.transports
            return entry
          })
        }
        return navigator.credentials.get({ publicKey: publicKey }).then(function (cred) {
          return post('/auth/passkey/login/verify', {
            response: {
              id: cred.id,
              rawId: b64url(cred.rawId),
              type: cred.type,
              clientExtensionResults: cred.getClientExtensionResults(),
              response: {
                authenticatorData: b64url(cred.response.authenticatorData),
                clientDataJSON: b64url(cred.response.clientDataJSON),
                signature: b64url(cred.response.signature),
                userHandle: cred.response.userHandle ? b64url(cred.response.userHandle) : null,
              },
            },
          })
        })
      })
      .then(function (result) {
        if (result && !result.ok) { fail(result); return }
        window.location.replace('/')
      })
      .catch(function (error) {
        if (error && error.name === 'NotAllowedError') setStatus('已取消或验证失败，请重试。')
        else setStatus('验证失败：' + (error && error.message ? error.message : String(error)))
      })
      .finally(function () { setBusy(false) })
  }
  function register() {
    var username = usernameEl.value.trim()
    if (!username) { setStatus('注册需要填写用户名。'); return }
    setBusy(true)
    setStatus('')
    post('/auth/passkey/register/options', { username: username })
      .then(function (result) {
        if (!result.ok) { fail(result); return }
        var options = result.payload
        return navigator.credentials.create({
          publicKey: {
            challenge: unb64url(options.challenge),
            rp: options.rp,
            user: { id: unb64url(options.user.id), name: options.user.name, displayName: options.user.displayName },
            pubKeyCredParams: options.pubKeyCredParams,
            timeout: options.timeout,
            attestation: options.attestation,
            authenticatorSelection: options.authenticatorSelection,
            excludeCredentials: (options.excludeCredentials || []).map(function (c) {
              var entry = { id: unb64url(c.id), type: c.type }
              if (c.transports) entry.transports = c.transports
              return entry
            }),
          },
        }).then(function (cred) {
          return post('/auth/passkey/register/verify', {
            username: username,
            response: {
              id: cred.id,
              rawId: b64url(cred.rawId),
              type: cred.type,
              clientExtensionResults: cred.getClientExtensionResults(),
              response: {
                attestationObject: b64url(cred.response.attestationObject),
                clientDataJSON: b64url(cred.response.clientDataJSON),
              },
            },
          })
        })
      })
      .then(function (result) {
        if (result && !result.ok) { fail(result); return }
        window.location.replace('/')
      })
      .catch(function (error) {
        if (error && error.name === 'NotAllowedError') setStatus('已取消或注册失败，请重试。')
        else setStatus('注册失败：' + (error && error.message ? error.message : String(error)))
      })
      .finally(function () { setBusy(false) })
  }
  function operator() {
    var token = document.getElementById('operator-token').value.trim()
    if (!token) { setStatus('请输入运营者令牌。'); return }
    try { localStorage.setItem('${OPERATOR_TOKEN_STORAGE_KEY}', token) } catch (error) { /* storage unavailable */ }
    window.location.replace('/')
  }
  document.getElementById('login').addEventListener('click', authenticate)
  document.getElementById('register').addEventListener('click', register)
  document.getElementById('operator').addEventListener('click', operator)
  usernameEl.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') authenticate()
  })
  fetch('/auth/provider', { credentials: 'same-origin' })
    .then(function (response) { return response.json() })
    .then(function (info) {
      if (info && info.provider === 'passkey' && info.registration === 'closed') {
        document.getElementById('register').style.display = 'none'
      }
    })
    .catch(function () { /* page still works without provider info */ })
})()
</script>
</body>
</html>
`
}
