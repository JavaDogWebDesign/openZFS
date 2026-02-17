/**
 * Vitest global test setup.
 *
 * - Extends expect with jest-dom matchers (toBeInTheDocument, etc.)
 * - Cleans up the DOM after every test via @testing-library/react
 * - Stubs global fetch so nothing escapes to the network
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Automatically unmount React trees that were mounted with render() after each test.
afterEach(() => {
  cleanup();
});

// Provide a default no-op fetch stub so tests that forget to mock it
// get a clear failure rather than a real HTTP call.
if (!globalThis.fetch || !(globalThis.fetch as unknown as { _isMockFunction?: boolean })._isMockFunction) {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
  );
}
