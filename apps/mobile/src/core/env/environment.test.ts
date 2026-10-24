import { createEnvironment, type RawEnvironment } from './environment';

const base: RawEnvironment = {
  appEnv: undefined,
  apiBaseUrl: undefined,
  enableM0Spike: undefined,
  isDevBuild: true,
};

describe('environment', () => {
  it('defaults debug builds to dev', () => {
    const env = createEnvironment(base);
    expect(env.name).toBe('dev');
    expect(env.isDevelopment).toBe(true);
    expect(env.isProduction).toBe(false);
    expect(env.logLevel).toBe('debug');
    expect(env.apiBaseUrl).toContain('10.0.2.2');
    expect(env.m0SpikeEnabled).toBe(false);
    expect(env.m4Enabled).toBe(true);
  });

  it('defaults release builds to prod', () => {
    const env = createEnvironment({ ...base, isDevBuild: false });
    expect(env.name).toBe('prod');
    expect(env.isProduction).toBe(true);
    expect(env.logLevel).toBe('warn');
    expect(env.apiBaseUrl).toBe('https://api.novatask.app');
    expect(env.m4Enabled).toBe(false);
  });

  it('parses staging and its public configuration', () => {
    const env = createEnvironment({ ...base, appEnv: 'staging', isDevBuild: false });
    expect(env.name).toBe('staging');
    expect(env.logLevel).toBe('info');
    expect(env.apiBaseUrl).toBe('https://staging-api.novatask.app');
    expect(env.m4Enabled).toBe(false);
  });

  it('keeps M4 dev tools out of staging and prod debug builds', () => {
    expect(createEnvironment({ ...base, appEnv: 'staging' }).m4Enabled).toBe(false);
    expect(createEnvironment({ ...base, appEnv: 'prod' }).m4Enabled).toBe(false);
  });

  it('only enables the M0 spike in dev', () => {
    expect(
      createEnvironment({ ...base, appEnv: 'dev', enableM0Spike: 'true' }).m0SpikeEnabled,
    ).toBe(true);
    expect(
      createEnvironment({ ...base, appEnv: 'staging', enableM0Spike: 'true' }).m0SpikeEnabled,
    ).toBe(false);
    expect(
      createEnvironment({ ...base, appEnv: 'prod', enableM0Spike: 'true' }).m0SpikeEnabled,
    ).toBe(false);
  });

  it('accepts an explicit public API URL and rejects secrets-shaped invalid URLs', () => {
    const env = createEnvironment({
      ...base,
      apiBaseUrl: 'https://example.test/api',
    });
    expect(env.apiBaseUrl).toBe('https://example.test/api');
    expect(() => createEnvironment({ ...base, apiBaseUrl: 'not-a-url' })).toThrow();
  });

  it('rejects unknown environment names', () => {
    expect(() => createEnvironment({ ...base, appEnv: 'qa' })).toThrow(/Invalid NOVA_APP_ENV/);
  });
});
