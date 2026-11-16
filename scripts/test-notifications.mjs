// A real Windows/WebView2 integration check; never opens the user's profiles.
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs/promises'
import { spawn } from 'node:child_process'

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end('<!doctype html><title>Notification fixture</title><p>Tabbar notification test</p>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const root = path.resolve('test-results', `notifications-${Date.now()}`)
await fs.mkdir(root, { recursive: true })
try {
  const target = process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc'
  const args = ['build', '--manifest-path', 'src-tauri/Cargo.toml', '--release', '--target', target, '--features', 'tauri/custom-protocol', '--example', 'notification_smoke', '--locked']
  // Honor the existing build cache when provided by the caller.
  const run = (command, args) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', windowsHide: true })
    child.on('error', reject)
    child.on('exit', code => resolve(code ?? 1))
  })
  process.exitCode = await run('cargo', args)
  const binary = path.resolve(process.env.CARGO_TARGET_DIR || 'src-tauri/target', target, 'release/examples/notification_smoke.exe')
  const fixtureArgs = [root, `http://127.0.0.1:${server.address().port}`]
  if (process.exitCode === 0) process.exitCode = await run(binary, fixtureArgs)
  if (process.exitCode === 0) process.exitCode = await run(binary, [...fixtureArgs, 'persisted'])
} finally {
  server.closeAllConnections()
  server.close()
}
