import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getLanguages } from "@/i18n/server";
import { Header } from "@/components/Header";
import { ToastProvider } from "@/components/Toast";
import { TxActivityProvider } from "@/components/TxActivity";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [user, settings, languages] = await Promise.all([requireUser(), getSettings(), getLanguages()]);
  const menu = languages.filter((l) => l.enabled).map(({ code, name, native }) => ({ code, name, native }));
  return (
    <ToastProvider>
      <TxActivityProvider>
        <Suspense>
          <Header user={user} languages={menu} defaultLanguage={settings.defaultLanguage} />
        </Suspense>
        {children}
      </TxActivityProvider>
    </ToastProvider>
  );
}
