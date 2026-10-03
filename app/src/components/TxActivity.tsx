"use client";

import { createContext, useCallback, useContext, useState } from "react";

// Counts translation requests in flight on the page, so the header can show "Translating…".
const Ctx = createContext<{ busy: number; track: <T>(p: Promise<T>) => Promise<T> }>({ busy: 0, track: (p) => p });

export function TxActivityProvider({ children }: { children: React.ReactNode }) {
  const [busy, setBusy] = useState(0);
  const track = useCallback(<T,>(p: Promise<T>) => {
    setBusy((b) => b + 1);
    return p.finally(() => setBusy((b) => b - 1));
  }, []);
  return <Ctx.Provider value={{ busy, track }}>{children}</Ctx.Provider>;
}

export const useTxActivity = () => useContext(Ctx);
