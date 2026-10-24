const COLOR_PATTERN =
  /(?:^|[\s("'`])(?:#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\(|hsla?\()/;

/**
 * Nova rule: colours may only be declared in src/design/tokens/colors.ts.
 * Tests are exempt because they assert token values.
 */
export const noHardcodedColors = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow colour literals outside the design token files',
    },
    schema: [],
    messages: {
      hardcoded:
        'Colour literals are forbidden here. Add a semantic token to src/design/tokens/colors.ts.',
    },
  },
  create(context) {
    const filename = String(context.filename ?? '').replaceAll('\\', '/');

    if (
      filename.includes('/design/tokens/colors.ts') ||
      /\.test\.[cm]?[jt]sx?$/.test(filename) ||
      filename.includes('/tools/')
    ) {
      return {};
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string' && COLOR_PATTERN.test(node.value)) {
          context.report({ node, messageId: 'hardcoded' });
        }
      },
      TemplateElement(node) {
        if (COLOR_PATTERN.test(node.value.raw)) {
          context.report({ node, messageId: 'hardcoded' });
        }
      },
    };
  },
};
