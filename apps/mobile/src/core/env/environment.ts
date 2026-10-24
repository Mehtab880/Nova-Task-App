import { z } from 'zod';
import { NativeModules } from 'react-native';

interface NativeBuildConstants {
  readonly APP_ENV?: string;
}

export const ENVIRONMENT_NAMES = ['dev', 'staging', 'prod'] as const;

export type EnvironmentName = (typeof ENVIRONMENT_NAMES)[number];

export type EnvironmentLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppEnvironment {
  readonly name: EnvironmentName;
  readonly apiBaseUrl: string;
  /** Only true for the dev flavor when explicitly enabled at build time. */
  readonly m0SpikeEnabled: boolean;
  /** M4 reminder proof of concept is intentionally dev-flavor only. */
  readonly m4Enabled: boolean;
  readonly logLevel: EnvironmentLogLevel;
  readonly isDevelopment: boolean;
  readonly isProduction: boolean;
}

export interface RawEnvironment {
  readonly appEnv: string | undefined;
  readonly apiBaseUrl: string | undefined;
  readonly enableM0Spike: string | undefined;
  readonly isDevBuild: boolean;
}

const environmentSchema = z.object({
  name: z.enum(ENVIRONMENT_NAMES),
  apiBaseUrl: z.string().url(),
  m0SpikeEnabled: z.boolean(),
  m4Enabled: z.boolean(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']),
  isDevelopment: z.boolean(),
  isProduction: z.boolean(),
});

const DEFAULT_API_BASE_URL: Record<EnvironmentName, string> = {
  dev: 'http://10.0.2.2:8080',
  staging: 'https://staging-api.novatask.app',
  prod: 'https://api.novatask.app',
};

const LOG_LEVEL: Record<EnvironmentName, EnvironmentLogLevel> = {
  dev: 'debug',
  staging: 'info',
  prod: 'warn',
};

function resolveEnvironmentName(raw: RawEnvironment): EnvironmentName {
  if (raw.appEnv !== undefined && raw.appEnv.length > 0) {
    const parsed = z.enum(ENVIRONMENT_NAMES).safeParse(raw.appEnv);
    if (!parsed.success) {
      throw new Error(`Invalid NOVA_APP_ENV: ${raw.appEnv}`);
    }
    return parsed.data;
  }

  return raw.isDevBuild ? 'dev' : 'prod';
}

function parseBoolean(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

/**
 * Pure environment builder. Tests exercise every flavor without rebuilding.
 * Secrets must never be added to this object; it is inlined into the JS bundle.
 */
export function createEnvironment(raw: RawEnvironment): AppEnvironment {
  const name = resolveEnvironmentName(raw);
  const isDevelopment = name === 'dev';
  const isProduction = name === 'prod';
  const requestedSpike = parseBoolean(raw.enableM0Spike);

  return environmentSchema.parse(
    Object.freeze({
      name,
      apiBaseUrl: raw.apiBaseUrl ?? DEFAULT_API_BASE_URL[name],
      m0SpikeEnabled: isDevelopment && !isProduction && requestedSpike,
      m4Enabled: isDevelopment,
      logLevel: LOG_LEVEL[name],
      isDevelopment,
      isProduction,
    }),
  );
}

function nativeBuildEnvironment(): string | undefined {
  const constants = NativeModules['NovaReminders'] as NativeBuildConstants | undefined;
  return constants?.APP_ENV;
}

function readBuildEnvironment(): RawEnvironment {
  return {
    appEnv: process.env.NOVA_APP_ENV ?? nativeBuildEnvironment(),
    apiBaseUrl: process.env.NOVA_API_BASE_URL,
    enableM0Spike: process.env.NOVA_ENABLE_M0_SPIKE,
    isDevBuild: __DEV__,
  };
}

export const environment: AppEnvironment = createEnvironment(readBuildEnvironment());
