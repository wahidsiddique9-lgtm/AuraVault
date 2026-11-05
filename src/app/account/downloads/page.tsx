import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { logoutAccount } from "@/app/account/actions";
import { SiteHeader } from "@/components/SiteHeader";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Purchases and downloads | AuraVault",
  robots: { index: false, follow: false },
};
export const instant = false;

export default async function AccountDownloadsPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  await connection();
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/account");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/account");

  const service = createSupabaseServiceClient();
  const query = await searchParams;
  const { data: orders, error } = service
    ? await service.from("orders").select("id,status,paid_at,subtotal_cents,currency")
      .eq("user_id", user.id).in("status", ["paid", "free"]).order("paid_at", { ascending: false })
    : { data: null, error: new Error("Purchase history is not configured") };
  const orderIds = (orders ?? []).map((order) => order.id);
  const { data: items } = service && orderIds.length
    ? await service.from("order_items").select("id,order_id,asset_id,asset_title,amount_cents")
      .in("order_id", orderIds).order("created_at", { ascending: false })
    : { data: [] };

  return <div className="site-shell">
    <SiteHeader active="account" />
    <main className="admin-content">
      <p className="eyebrow"><span className="eyebrow-line" /> YOUR AURAVAULT LIBRARY</p>
      <div className="admin-title-row"><div><h1>Purchases and downloads<span>.</span></h1><p>{user.email}</p></div><form action={logoutAccount}><button className="admin-delete-button">Sign out</button></form></div>
      {query.checkout === "success" && <p className="admin-status" role="status">Returning from checkout. Only Stripe-confirmed purchases appear here.</p>}
      {error && <p className="admin-status error">Purchase history is not configured. Contact the site administrator.</p>}
      {!error && items?.length ? <div className="article-admin-list">{items.map((item) => {
        const order = orders?.find((candidate) => candidate.id === item.order_id);
        return <article className="article-admin-row" key={item.id}>
          <div className="article-admin-meta"><span className="article-status published">{order?.status === "free" ? "Free" : "Paid"}</span><time dateTime={order?.paid_at ?? ""}>{order?.paid_at ? new Date(order.paid_at).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : ""}</time></div>
          <h2>{item.asset_title}</h2>
          <p>${(item.amount_cents / 100).toFixed(2)}</p>
          {item.asset_id
            ? <Link className="journal-card-link" href={`/api/downloads/${item.asset_id}`}>Download file <span aria-hidden="true">↗</span></Link>
            : <p>This product is no longer available.</p>}
        </article>;
      })}</div> : !error && <p className="admin-empty">No confirmed purchases yet.</p>}
    </main>
  </div>;
}