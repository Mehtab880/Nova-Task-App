/**
 * Jest setup for React Native.
 *
 * Keep this file limited to test-harness concerns. No product behavior.
 */
import '@testing-library/react-native';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

// op-sqlite is a native module and is not available in Jest. The M0 spike has
// its own device-only verification; unit tests cover pure helpers.
jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => {
    throw new Error('op-sqlite is not available in the Jest environment');
  }),
}));
