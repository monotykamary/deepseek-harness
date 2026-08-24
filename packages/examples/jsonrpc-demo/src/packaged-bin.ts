#!/usr/bin/env node
/**
 * Closed-runtime JSON-RPC agent bin. Bare plugins resolve from the installed
 * runtime closure while relative plugins remain configuration-relative.
 *
 * @module @monotykamary/dsh-sdk-jsonrpc-demo/packaged-bin
 */

import { runJsonrpcAgent } from './runner.ts'

/* exercised through the built Python runtime carriers */
await runJsonrpcAgent(import.meta.url)
