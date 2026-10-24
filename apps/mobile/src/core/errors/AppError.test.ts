import { AppError, isAppError } from './AppError';

describe('AppError', () => {
  it('captures a stable code, category, and retry flag', () => {
    const error = new AppError({
      code: 'db_unavailable',
      category: 'storage',
      message: 'Database is unavailable',
      retriable: true,
      context: { table: 'm0_spike' },
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AppError');
    expect(error.code).toBe('db_unavailable');
    expect(error.category).toBe('storage');
    expect(error.retriable).toBe(true);
    expect(error.context).toEqual({ table: 'm0_spike' });
    expect(error.toJSON()).toEqual({
      name: 'AppError',
      code: 'db_unavailable',
      category: 'storage',
      message: 'Database is unavailable',
      retriable: true,
      context: { table: 'm0_spike' },
    });
  });

  it('preserves an existing AppError and wraps unknown errors', () => {
    const original = new AppError({ code: 'x', category: 'unexpected', message: 'x' });
    expect(AppError.fromUnknown(original)).toBe(original);

    const wrapped = AppError.fromUnknown(new Error('secret details'));
    expect(wrapped.code).toBe('unexpected_error');
    expect(wrapped.cause).toBeInstanceOf(Error);
    expect(wrapped.message).toBe('An unexpected error occurred.');
  });

  it('identifies AppErrors', () => {
    expect(isAppError(new AppError({ code: 'a', category: 'validation', message: 'a' }))).toBe(
      true,
    );
    expect(isAppError(new Error('a'))).toBe(false);
  });
});
