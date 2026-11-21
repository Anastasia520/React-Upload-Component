import { type AxeMatchers } from 'vitest-axe/matchers';

// vitest-axe 0.1.0 adds its matcher types to the global `Vi` namespace, which vitest 1.x no longer reads, so the
// matchers are added to vitest's own types here. Each test file still calls `expect.extend(axeMatchers)`.
declare module 'vitest' {
    interface Assertion extends AxeMatchers {}
    interface AsymmetricMatchersContaining extends AxeMatchers {}
}
