import Link from "next/link";

export function AdminAuthUnavailable({ retryHref }: { retryHref: "/admin" | "/admin/articles" }) {
  return <main className="admin-page">
    <div className="admin-content">
      <p className="eyebrow"><span className="eyebrow-line" /> PRIVATE ADMIN</p>
      <h1>Session check paused<span>.</span></h1>
      <p className="admin-login-copy" role="alert">AuraVault could not reach Supabase to verify this session. This does not confirm that you were signed out. Your admin actions are paused until verification succeeds.</p>
      <Link className="admin-save-button" href={retryHref}>Try again</Link>
    </div>
  </main>;
}