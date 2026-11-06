import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Admin sign in | AuraVault", robots: { index: false, follow: false } };
export const instant = false;

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ unauthorized?: string }> }) {
  const query = await searchParams;
  const supabaseConfigured = isSupabaseConfigured();
  console.log("Env check:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "Exists" : "Missing");
  console.log("Anon key check:", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "Exists" : "Missing");
  console.log("Supabase config validation:", supabaseConfigured ? "Passed" : "Failed");
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
      {!supabaseConfigured ? <div className="admin-setup-note">Supabase configuration is unavailable. Verify <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> are set to valid values.</div> : null}
      {query.unauthorized || signedInWithoutAdminAccess ? <p className="admin-form-error" role="alert">This account does not have administrator access.</p> : null}
      <AdminLoginForm />
      <p className="admin-no-signup">Admin accounts are provisioned privately. There is no public admin registration.</p>
    </section>
  </main>;
}