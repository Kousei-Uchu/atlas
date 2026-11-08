import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the PRODUCTION build (spec 15.1), served locally.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'off' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 5'] } }, // touch viewport
    // Other engines are opt-in because they need `npx playwright install firefox webkit` first (M6-03):
    //   ATLAS_ALL_BROWSERS=1 npx playwright test
    ...(process.env.ATLAS_ALL_BROWSERS
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'safari', use: { ...devices['Desktop Safari'] } },
          { name: 'iphone', use: { ...devices['iPhone 14'] } },
        ]
      : []),
  ],
});
