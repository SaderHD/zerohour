// Runs the game server (tsx watch) and the Vite dev server together. Open http://localhost:5173
import { spawn } from 'node:child_process';

const procs = [
  spawn('npm', ['run', 'dev', '-w', 'server'], { stdio: 'inherit', env: { ...process.env, ZH_DEBUG: '1' } }),
  spawn('npm', ['run', 'dev', '-w', 'client'], { stdio: 'inherit' }),
];
const stop = () => procs.forEach((p) => p.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => { stop(); process.exitCode = code ?? 0; }));
