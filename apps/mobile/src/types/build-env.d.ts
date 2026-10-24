/**
 * Build-time environment variables inlined by
 * babel-plugin-transform-inline-environment-variables.
 *
 * Only public, non-secret values belong here.
 */
declare const process: {
  readonly env: {
    readonly NODE_ENV?: string;
    readonly NOVA_APP_ENV?: string;
    readonly NOVA_API_BASE_URL?: string;
    readonly NOVA_ENABLE_M0_SPIKE?: string;
  };
};
