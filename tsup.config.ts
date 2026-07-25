import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: [
    '@stripe/stripe-react-native',
    '@thefaithapp/auth-react-native',
    'react',
    'react-native',
    'react-native-webview',
  ],
  outExtension({ format }) {
    return { js: format === 'esm' ? '.mjs' : '.js' }
  },
})
