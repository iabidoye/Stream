#!/usr/bin/env node

import { spawn } from 'node:child_process'

const mode = process.env.RAILWAY_WORKER || process.env.SERVICE_MODE || 'monitor'
const port = process.env.PORT || '3002'
const nextBin = process.platform === 'win32' ? 'node_modules/.bin/next.cmd' : 'node_modules/.bin/next'

const commands = {
  monitor: [nextBin, ['start', '-p', port]],
  'gold100-live': ['node', ['scripts/gold-100pct-paper-demo.mjs', '--account=live', '--trade']],
  'eightam-live': ['node', ['scripts/eightam-ny-optimised-live.mjs', '--account=live', '--trade']],
}

const command = commands[mode]

if (!command) {
  console.error(`Unknown Railway start mode: ${mode}`)
  console.error(`Expected one of: ${Object.keys(commands).join(', ')}`)
  process.exit(1)
}

console.log(`Railway start mode: ${mode}`)

const [cmd, args] = command
const child = spawn(cmd, args, {
  env: process.env,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
