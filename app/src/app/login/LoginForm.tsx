"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { login, type FormState } from "../auth-actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  const [info, setInfo] = useState("");
  const error = state.error;

  return (
    <form action={action} className="login-form" noValidate onChange={() => setInfo("")}>
      <div className="intro">
        <h2>Sign in</h2>
        <p>Use your citizen or official account to continue.</p>
      </div>
      <label className="label">
        Email
        <input className="field" type="email" name="email" autoComplete="email" defaultValue={state.email ?? ""} required={false} />
      </label>
      <div className="label">
        <span className="pw-label">
          <label htmlFor="password">Password</label>
          <button type="button" onClick={() => setInfo("Ask your administrator to reset your password. Self-service reset isn't set up yet.")}>Forgot?</button>
        </span>
        <input id="password" className="field" type="password" name="password" autoComplete="current-password" />
      </div>
      {error && !info ? <div className="error-text" role="alert">{error}</div> : null}
      {info ? <div className="info-text" role="status">{info}</div> : null}
      <button type="submit" className="login-submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <div className="divider">or</div>
      <button type="button" className="login-alt" onClick={() => setInfo("National ID sign-in isn't connected yet. Use your email and password for now.")}>
        Continue with national ID
      </button>
      <p className="login-foot">New to Insight Pitch? <Link href="/signup">Create an account</Link></p>
    </form>
  );
}
