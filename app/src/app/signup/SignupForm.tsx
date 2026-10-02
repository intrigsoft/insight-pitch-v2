"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup, type FormState } from "../auth-actions";

export function SignupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signup, {});
  return (
    <form action={action} className="login-form" noValidate>
      <div className="intro">
        <h2>Create an account</h2>
        <p>Citizen accounts can draft proposals and join every discussion.</p>
      </div>
      <label className="label">
        Full name
        <input className="field" name="name" autoComplete="name" defaultValue={state.name ?? ""} />
      </label>
      <label className="label">
        Email
        <input className="field" type="email" name="email" autoComplete="email" defaultValue={state.email ?? ""} />
      </label>
      <label className="label">
        Password
        <input className="field" type="password" name="password" autoComplete="new-password" />
      </label>
      {state.error ? <div className="error-text" role="alert">{state.error}</div> : null}
      <button type="submit" className="login-submit" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
      <p className="login-foot">Already have an account? <Link href="/login">Sign in</Link></p>
    </form>
  );
}
