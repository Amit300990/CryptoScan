#!/usr/bin/env node
/**
 * CryptoGuard Mobile startup wrapper.
 *
 * The artifact-managed workflow health check goes through the Expo dev domain
 * (which has a deadlock: routing requires the workflow to already be RUNNING).
 * This script is used instead via a configureWorkflow-based workflow whose
 * health check is a direct TCP check to port 5000.
 *
 * - Port 5000  : immediate HTTP responder (satisfies direct TCP health check)
 * - Port 22995 : Metro bundler directly (Expo dev domain routes here)
 */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const HEALTH_PORT = 5000;    // configureWorkflow waitForPort
const METRO_PORT  = 22995;   // Expo dev domain routes to this port

console.log(`CryptoGuard Mobile starting (health:${HEALTH_PORT} metro:${METRO_PORT})`);

// ── Health-check server (binds immediately) ─────────────────────────────────
const health = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
});
health.listen(HEALTH_PORT, () => {
  console.log(`Health server ready on port ${HEALTH_PORT}`);
});

// ── Metro bundler ───────────────────────────────────────────────────────────
// Locate the expo CLI from the local workspace install
let expoCli;
try {
  expoCli = require.resolve('expo/bin/cli');
} catch {
  expoCli = path.join(__dirname, '..', 'node_modules', 'expo', 'bin', 'cli.js');
}

const metro = spawn(process.execPath, [expoCli, 'start', '--port', String(METRO_PORT)], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
  env: {
    ...process.env,
    PORT: String(METRO_PORT),
    EXPO_PUBLIC_DOMAIN: process.env.EXPO_PUBLIC_DOMAIN || process.env.REPLIT_DEV_DOMAIN || '',
  },
});

metro.on('error', (err) => {
  console.error('Metro failed to start:', err.message);
  process.exit(1);
});
metro.on('exit', (code, signal) => {
  console.log(`Metro exited: code=${code} signal=${signal}`);
  health.close();
  process.exit(code ?? 1);
});

// ── Graceful shutdown ───────────────────────────────────────────────────────
function shutdown(sig) {
  console.log(`Received ${sig}, shutting down…`);
  metro.kill(sig);
  health.close(() => process.exit(0));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
