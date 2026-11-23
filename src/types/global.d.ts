export {};

declare global {
  interface Window {
    /** Debug hooks for QA/E2E. Shape grows as systems land. */
    __debug: Record<string, unknown>;
  }
}
