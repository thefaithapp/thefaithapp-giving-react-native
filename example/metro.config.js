const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const givingSdkRoot = path.resolve(
  projectRoot,
  '..',
)
const config = getDefaultConfig(projectRoot)
const appEntryPoint = path.resolve(projectRoot, 'index.ts')
const appRuntimePackages = new Set([
  '@stripe/stripe-react-native',
  'expo',
  'expo-application',
  'expo-crypto',
  'expo-secure-store',
  'expo-web-browser',
  'react',
  'react-native',
  'react-native-webview',
])

function packageNameFromSpecifier(moduleName) {
  const parts = moduleName.split('/')
  return moduleName.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

config.watchFolders = [...new Set([...config.watchFolders, givingSdkRoot])]
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const packageName = packageNameFromSpecifier(moduleName)
  if (appRuntimePackages.has(packageName)) {
    return context.resolveRequest(
      { ...context, originModulePath: appEntryPoint },
      moduleName,
      platform,
    )
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
