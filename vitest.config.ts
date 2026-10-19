import { defineConfig } from 'vitest/config';

// Unit tests only: the Playwright specs in e2e/ run with npm run test:e2e.
export default defineConfig({ test: { exclude: ['e2e/**', 'node_modules/**', 'dist/**'] } });
