export type AppErrorCategory =
  'validation' | 'storage' | 'network' | 'configuration' | 'unexpected';

export interface AppErrorParams {
  readonly code: string;
  readonly category: AppErrorCategory;
  readonly message: string;
  readonly cause?: unknown;
  readonly retriable?: boolean;
  readonly context?: Readonly<Record<string, unknown>>;
}

export interface SerializedAppError {
  readonly name: 'AppError';
  readonly code: string;
  readonly category: AppErrorCategory;
  readonly message: string;
  readonly retriable: boolean;
  readonly context: Readonly<Record<string, unknown>>;
}

/**
 * Stable application error shape. Domain and infrastructure code may throw
 * this; UI may branch on `code`, never on message text.
 */
export class AppError extends Error {
  readonly code: string;
  readonly category: AppErrorCategory;
  readonly retriable: boolean;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(params: AppErrorParams) {
    super(params.message);
    this.name = 'AppError';
    this.code = params.code;
    this.category = params.category;
    this.retriable = params.retriable ?? false;
    this.context = Object.freeze({ ...params.context });

    if (params.cause !== undefined) {
      this.cause = params.cause;
    }

    Object.setPrototypeOf(this, new.target.prototype);
  }

  static fromUnknown(
    error: unknown,
    fallback: Omit<AppErrorParams, 'cause'> = {
      code: 'unexpected_error',
      category: 'unexpected',
      message: 'An unexpected error occurred.',
    },
  ): AppError {
    if (error instanceof AppError) {
      return error;
    }

    return new AppError({ ...fallback, cause: error });
  }

  toJSON(): SerializedAppError {
    return {
      name: 'AppError',
      code: this.code,
      category: this.category,
      message: this.message,
      retriable: this.retriable,
      context: this.context,
    };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
