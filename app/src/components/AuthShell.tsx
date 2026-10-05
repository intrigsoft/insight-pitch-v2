import { getI18n, getLanguages } from "@/i18n/server";
import { LogoMark } from "./icons";
import { getSettings } from "@/lib/settings";
import { LanguageMenu } from "./LanguageMenu";

// Left-hand brand panel shared by the sign-in and create-account screens.
export async function AuthShell({ children }: { children: React.ReactNode }) {
  const [{ t }, languages, settings] = await Promise.all([getI18n(), getLanguages(), getSettings()]);
  const menu = languages.filter((l) => l.enabled).map(({ code, name, native }) => ({ code, name, native }));
  return (
    <div className="login" data-screen-label="Login">
      <div className="login-hero">
        <div className="brand" lang="en"><LogoMark size={32} light /><span className="words"><span className="l1">Insight</span><span className="l2">Pitch</span></span></div>
        <div className="pitch">
          <h1>{t("auth.heroTitle")}</h1>
          <p>{t("auth.heroText")}</p>
        </div>
        <div className="copy">{t("auth.copyright")}</div>
      </div>
      <div className="login-panel">
        {menu.length > 1 ? <div className="auth-lang"><LanguageMenu languages={menu} defaultLanguage={settings.defaultLanguage} canManage={false} /></div> : null}
        {children}
      </div>
    </div>
  );
}
