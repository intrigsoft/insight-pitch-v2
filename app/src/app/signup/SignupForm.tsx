"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup, type FormState } from "../auth-actions";
import { useI18n } from "@/i18n/client";

export function SignupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signup, {});
  const { t } = useI18n();
  return (
    <form action={action} className="login-form" noValidate>
      <div className="intro">
        <h2>{t("auth.createAccountTitle")}</h2>
        <p>{t("auth.createAccountIntro")}</p>
      </div>
      <label className="label">
        {t("auth.fullName")}
        <input className="field" name="name" autoComplete="name" defaultValue={state.name ?? ""} />
      </label>
      <label className="label">
        {t("auth.email")}
        <input className="field" type="email" name="email" autoComplete="email" defaultValue={state.email ?? ""} />
      </label>
      <label className="label">
        {t("auth.password")}
        <input className="field" type="password" name="password" autoComplete="new-password" />
      </label>
      {state.error ? <div className="error-text" role="alert">{state.error}</div> : null}
      <button type="submit" className="login-submit" disabled={pending}>{pending ? t("auth.creatingAccount") : t("auth.createAccountButton")}</button>
      <p className="login-foot">{t("auth.haveAccount")} <Link href="/login">{t("auth.signIn")}</Link></p>
    </form>
  );
}
