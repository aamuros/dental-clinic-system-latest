import { defineConfig } from 'vitest/config'
import baseConfig from '../../vitest.config.ts'

export default defineConfig({
  resolve: baseConfig.resolve,
  test: {
    include: ['tests/integration/appointments.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
})
