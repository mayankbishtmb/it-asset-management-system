const { defineConfig } = require('vite');
const path = require('path');

module.exports = defineConfig({
  root: path.resolve(__dirname, 'frontend'),
  publicDir: false,
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
  build: { outDir: path.resolve(__dirname, 'public'), emptyOutDir: true },
});
