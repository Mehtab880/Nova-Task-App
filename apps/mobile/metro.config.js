const path = require('node:path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

/**
 * Metro configuration for a pnpm monorepo.
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  projectRoot,
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    // Keep aliases in sync with tsconfig.json and babel.config.js.
    extraNodeModules: {
      '@nova/shared': path.resolve(workspaceRoot, 'packages/shared/src'),
    },
    sourceExts: ['js', 'jsx', 'json', 'ts', 'tsx'],
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
