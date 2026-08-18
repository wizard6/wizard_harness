import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['core/test/**/*.spec.ts', 'obs/**/*.spec.ts'],
  },
});
