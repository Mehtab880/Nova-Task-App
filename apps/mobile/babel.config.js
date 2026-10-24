const path = require('node:path');

/**
 * Babel configuration for the Nova Task mobile app.
 *
 * - module-resolver powers the `@/` path alias and the workspace package
 *   outside of TypeScript (Metro, Jest). Absolute paths keep aliases stable
 *   regardless of the process working directory (monorepo Jest projects).
 * - transform-inline-environment-variables bakes only public, non-secret
 *   build-time values into the bundle. Secrets must never live here.
 */
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: [__dirname],
        alias: {
          '@': path.resolve(__dirname, 'src'),
          '@nova/shared': path.resolve(__dirname, '../../packages/shared/src'),
        },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      },
    ],
    // Zod v4's ESM entry uses `export * as ns`; Metro ships that syntax to
    // Babel, and the React Native preset does not include this transform.
    '@babel/plugin-transform-export-namespace-from',
    [
      'transform-inline-environment-variables',
      {
        include: ['NOVA_APP_ENV', 'NOVA_API_BASE_URL', 'NOVA_ENABLE_M0_SPIKE'],
      },
    ],
  ],
};
