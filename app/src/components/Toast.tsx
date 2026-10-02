"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = useCallback((m: string) => {
    // A new id restarts the entry animation even when the same message repeats.
    setToast((t) => ({ id: (t?.id ?? 0) + 1, message: m }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2400);
  }, []);
  return (
    <ToastContext.Provider value={flash}>
      {children}
      {toast ? <div className="toast" role="status" key={toast.id}>{toast.message}</div> : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
