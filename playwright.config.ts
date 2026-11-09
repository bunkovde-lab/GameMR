import { defineConfig, devices } from '@playwright/test';

// Разрешения из ТЗ §15.2. Портретный телефон — отдельный этап (OPEN-10), здесь не проверяется.
export const VIEWPORTS = [
  { name: 'pc-1920', width: 1920, height: 1080 },
  { name: 'pc-1366', width: 1366, height: 768 },
  { name: 'tablet-1194', width: 1194, height: 834 },
  { name: 'phone-844', width: 844, height: 390 },
] as const;

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/setup/global-setup.mjs',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'off' },
  projects: VIEWPORTS.map((v) => ({
    name: v.name,
    use: { ...devices['Desktop Chrome'], viewport: { width: v.width, height: v.height }, hasTouch: v.width < 1300 },
  })),
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
