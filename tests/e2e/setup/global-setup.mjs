import { execFileSync } from 'node:child_process';

// Готовит сохранения для e2e настоящим ядром игры (см. make-saves.ts).
export default function globalSetup() {
  execFileSync('node_modules/.bin/vite-node', ['tests/e2e/setup/make-saves.ts'], { stdio: 'inherit' });
}
