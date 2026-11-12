import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountAccessForm } from "@/components/AccountAccessForm";
import { SiteHeader } from "@/components/SiteHeader";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Your AuraVault account",
  robots: { index: false, follow: false },
};
export const instant = false;

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/account/downloads");
  }

  return <div className="site-shell">
    <SiteHeader active="account" />
    <main className="admin-login-page">
      <section className="admin-login-card">
        <p className="eyebrow"><span className="eyebrow-line" /> CUSTOMER ACCOUNT</p>
        <h1>Your library<br /><em>travels with you.</em></h1>
        <p className="admin-login-copy">Sign in or create an account to access verified purchases and downloads.</p>
        <AccountAccessForm />
      </section>
    </main>
  </div>;
}