/**
 * Local ESLint plugin for Nova Task architectural rules.
 */
import { noHardcodedColors } from './no-hardcoded-colors.mjs';
import { noLiteralJsxText } from './no-literal-jsx-text.mjs';

export default {
  meta: {
    name: 'eslint-plugin-nova',
    version: '0.1.0',
  },
  rules: {
    'no-hardcoded-colors': noHardcodedColors,
    'no-literal-jsx-text': noLiteralJsxText,
  },
};
