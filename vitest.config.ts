import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const packageRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      'react-native': resolve(packageRoot, 'test/mocks/react-native.ts'),
      'react-native-webview': resolve(
        packageRoot,
        'test/mocks/react-native-webview.ts',
      ),
      '@stripe/stripe-react-native': resolve(
        packageRoot,
        'test/mocks/stripe-react-native.ts',
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    restoreMocks: true,
  },
})
