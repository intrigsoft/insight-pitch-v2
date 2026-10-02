"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = useCallback((m: string) => {
    setMessage(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 2400);
  }, []);
  return (
    <ToastContext.Provider value={flash}>
      {children}
      {message ? <div className="toast" role="status" key={message + Date.now()}>{message}</div> : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
