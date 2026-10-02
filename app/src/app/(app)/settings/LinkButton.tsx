"use client";

import { useTransition } from "react";
import { useToast } from "@/components/Toast";
import { linkStreams } from "./actions";

export function LinkButton({ a, b }: { a: string; b: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button className="link-btn" disabled={pending} onClick={() => start(async () => {
      const r = await linkStreams(a, b);
      toast(r.ok ? "Streams linked" : r.error);
    })}>Link</button>
  );
}
