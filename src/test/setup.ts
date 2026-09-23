import "@testing-library/jest-dom/vitest";

// Mantine reads `matchMedia` (color scheme, reduced motion) and observes
// element sizes; jsdom implements neither. Tests running in the `node`
// environment have no `window` and need neither stub.
if (typeof window !== "undefined") {
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;

  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
