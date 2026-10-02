import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { Header } from "@/components/Header";
import { ToastProvider } from "@/components/Toast";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <ToastProvider>
      <Suspense>
        <Header user={user} />
      </Suspense>
      {children}
    </ToastProvider>
  );
}
