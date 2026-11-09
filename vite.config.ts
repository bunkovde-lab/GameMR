/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages публикует сайт по адресу /GameMR/, поэтому base задаётся через переменную окружения.
export default defineConfig({
  base: process.env.GAMEMR_BASE ?? '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/unit/setup.ts'],
  },
});
