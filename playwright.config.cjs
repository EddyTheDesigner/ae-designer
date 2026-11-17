const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser', timeout: 30000, fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:8173', viewport: { width: 1440, height: 820 }, headless: true },
  webServer: { command: 'node scripts/serve.cjs', url: 'http://127.0.0.1:8173', reuseExistingServer: true },
  reporter: [['list']]
});
