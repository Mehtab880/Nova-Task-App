/**
 * Nova rule: user-visible JSX text must come from i18next (`t()`).
 */
export const noLiteralJsxText = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow literal text nodes in JSX',
    },
    schema: [],
    messages: {
      literal: 'Use a translation key via t() instead of literal JSX text.',
    },
  },
  create(context) {
    const filename = String(context.filename ?? '').replaceAll('\\', '/');

    if (/\.test\.[cm]?[jt]sx?$/.test(filename) || filename.includes('/tools/')) {
      return {};
    }

    return {
      JSXText(node) {
        if (node.value.trim().length > 0) {
          context.report({ node, messageId: 'literal' });
        }
      },
    };
  },
};
