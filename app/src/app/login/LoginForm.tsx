"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { login, type FormState } from "../auth-actions";
import { useI18n } from "@/i18n/client";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  const [info, setInfo] = useState("");
  const { t } = useI18n();
  const error = state.error;

  return (
    <form action={action} className="login-form" noValidate onChange={() => setInfo("")}>
      <div className="intro">
        <h2>{t("auth.signIn")}</h2>
        <p>{t("auth.signInIntro")}</p>
      </div>
      <label className="label">
        {t("auth.email")}
        <input className="field" type="email" name="email" autoComplete="email" defaultValue={state.email ?? ""} required={false} />
      </label>
      <div className="label">
        <span className="pw-label">
          <label htmlFor="password">{t("auth.password")}</label>
          <button type="button" onClick={() => setInfo(t("auth.forgotInfo"))}>{t("auth.forgot")}</button>
        </span>
        <input id="password" className="field" type="password" name="password" autoComplete="current-password" />
      </div>
      {error && !info ? <div className="error-text" role="alert">{error}</div> : null}
      {info ? <div className="info-text" role="status">{info}</div> : null}
      <button type="submit" className="login-submit" disabled={pending}>{pending ? t("auth.signingIn") : t("auth.signIn")}</button>
      <div className="divider">{t("auth.or")}</div>
      <button type="button" className="login-alt" onClick={() => setInfo(t("auth.nationalIdInfo"))}>
        {t("auth.nationalId")}
      </button>
      <p className="login-foot">{t("auth.newHere")} <Link href="/signup">{t("auth.createAccount")}</Link></p>
    </form>
  );
}
