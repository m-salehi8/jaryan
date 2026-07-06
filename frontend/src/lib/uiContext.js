import { createContext, useCallback, useContext, useMemo, useState } from "react";

// Shared UI state: open/close the global Command Palette from anywhere
// (App's Ctrl+K listener and the Layout search button) without prop drilling.
const UIContext = createContext({ paletteOpen: false, setPaletteOpen: () => {} });

export function UIProvider({ children }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const value = useMemo(() => ({ paletteOpen, setPaletteOpen }), [paletteOpen]);
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  return useContext(UIContext);
}

// Convenience hook for opening the palette.
export function usePalette() {
  const { paletteOpen, setPaletteOpen } = useUI();
  const open = useCallback(() => setPaletteOpen(true), [setPaletteOpen]);
  const close = useCallback(() => setPaletteOpen(false), [setPaletteOpen]);
  return { paletteOpen, open, close, setPaletteOpen };
}
