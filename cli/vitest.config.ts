import { defineConfig } from 'vitest/config'
import { VitestReporter } from 'tdd-guard-vitest'
import path from 'path'

export default defineConfig({
  test: {
    reporters: ['default', new VitestReporter(path.resolve(__dirname, '..'))],
    testTimeout: 30000,
  },
})
