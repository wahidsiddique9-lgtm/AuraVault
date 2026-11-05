"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function AccountAccessForm() {
  const router = useRouter();
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setError("");
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError("Account access is not configured.");
      setPending(false);
      return;
    }

    try {
      const result = creatingAccount
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) {
        setError(creatingAccount ? "The account could not be created. Check your details and try again." : "Email or password is incorrect.");
        return;
      }
      if (creatingAccount && !result.data.session) {
        setMessage("Check your email to confirm the new account, then sign in.");
        return;
      }
      router.replace("/account/downloads");
      router.refresh();
    } catch {
      setError("Could not reach the account service. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return <form className="admin-login-form" onSubmit={submit}>
    <label>Email address<input name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
    <label>Password<input name="password" type="password" autoComplete={creatingAccount ? "new-password" : "current-password"} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
    {error && <p className="admin-form-error" role="alert">{error}</p>}
    {message && <p className="feedback-status" role="status">{message}</p>}
    <button className="admin-primary" type="submit" disabled={pending}>{pending ? "Please wait…" : creatingAccount ? "Create account" : "Sign in"}</button>
    <button className="account-mode-toggle" type="button" onClick={() => { setCreatingAccount(!creatingAccount); setError(""); setMessage(""); }}>
      {creatingAccount ? "Already have an account? Sign in" : "New to AuraVault? Create an account"}
    </button>
  </form>;
}