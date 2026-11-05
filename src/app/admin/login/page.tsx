import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Admin sign in | AuraVault", robots: { index: false, follow: false } };
export const instant = false;

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ setup?: string; unauthorized?: string }> }) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  let signedInWithoutAdminAccess = false;
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const metadata = user.app_metadata as Record<string, unknown>;
      const isAdmin = metadata.role === "admin" || metadata.is_admin === true;
      if (isAdmin) redirect("/admin");
      signedInWithoutAdminAccess = true;
    }
  }

  return <main className="admin-login-page">
    <Link className="wordmark" href="/"><span className="brand-mark">A</span><span>AuraVault</span></Link>
    <section className="admin-login-card">
      <p className="eyebrow"><span className="eyebrow-line" /> PRIVATE CONTROL PANEL</p>
      <h1>Administrator<br /><em>sign in.</em></h1>
      <p className="admin-login-copy">Access is limited to accounts explicitly authorized by the AuraVault owner.</p>
      {query.setup || !isSupabaseConfigured() ? <div className="admin-setup-note">Supabase is not configured. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then apply the inventory migrations.</div> : null}
      {query.unauthorized || signedInWithoutAdminAccess ? <p className="admin-form-error" role="alert">This account does not have administrator access.</p> : null}
      <AdminLoginForm />
      <p className="admin-no-signup">Admin accounts are provisioned privately. There is no public admin registration.</p>
    </section>
  </main>;
}