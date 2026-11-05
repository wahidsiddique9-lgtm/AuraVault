"use client";

import { useActionState } from "react";
import { AdminLoginState, loginAdmin } from "@/app/admin/actions";

const initialState: AdminLoginState = { error: "" };

export function AdminLoginForm() {
  const [state, action, pending] = useActionState(loginAdmin, initialState);
  return <form className="admin-login-form" action={action}>
    <label>Email address<input name="email" type="email" autoComplete="username" required /></label>
    <label>Password<input name="password" type="password" autoComplete="current-password" minLength={8} required /></label>
    {state.error && <p className="admin-form-error" role="alert">{state.error}</p>}
    <button className="admin-primary" type="submit" disabled={pending}>{pending ? "Checking access…" : "Sign in securely"}</button>
  </form>;
}