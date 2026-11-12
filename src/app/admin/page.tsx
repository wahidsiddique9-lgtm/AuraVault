import Link from "next/link";
import { connection } from "next/server";
import { deleteAsset, logoutAdmin, saveAsset } from "@/app/admin/actions";
import { AdminAuthUnavailableError, requireAdmin } from "@/lib/admin";
import { Asset } from "@/lib/assets";
import { AdminAuthUnavailable } from "@/components/AdminAuthUnavailable";

export const metadata = { title: "Inventory | AuraVault Admin", robots: { index: false, follow: false } };
export const instant = false;

const statusMessages: Record<string, string> = {
  saved: "Inventory item saved.",
  deleted: "Inventory item deleted.",
  invalid: "Check the inventory fields and try again.",
  "invalid-image-url": "Image previews must use a valid HTTPS URL.",
  "file-required": "Choose an image or document file before creating this item.",
  "invalid-file": "Use a supported file type up to 25 MB.",
  "invalid-preview": "Use a JPEG, PNG, or WebP preview up to 5 MB.",
  "preview-required": "Image products need a separate preview image.",
  "preview-upload-error": "The preview could not be uploaded. Check the public Storage bucket and admin policy.",
  "upload-error": "The file could not be uploaded. Check the Storage bucket and admin policies.",
  "save-error": "The item could not be saved. Check the database schema and access policy.",
  "database-migration-required": "The assets schema is missing required columns. Review and apply migration 202611040009 only after confirming its preflight conditions.",
  "auth-unavailable": "Supabase could not verify your admin session. Your changes were not applied; retry the action.",
  "delete-error": "The item could not be deleted.",
  "has-sales": "This product has confirmed purchases. Unpublish it instead of deleting it.",
};

function queryFailureMessage(error: { code?: string; message?: string }, resource: "inventory" | "sales") {
  const code = error.code;
  if (code === "42703" || code === "PGRST204") {
    return resource === "inventory"
      ? "The assets table is missing a column used by this dashboard. This list query needs file_url/storage_path; editor actions also need preview_storage_path from migration 202611040009. Do not rerun migration 202610310001 when the table already exists."
      : "The orders schema is incomplete. Compare its columns with migration 202611040009 before applying any SQL.";
  }
  if (resource === "sales" && (code === "42P01" || code === "PGRST205")) {
    return "The orders table is not available in the exposed public schema. Migration 202611040009 defines orders and order_items; inspect the schema first, then apply only after reviewing the migration.";
  }
  if (code === "42501") {
    return `Supabase denied access to ${resource}. Verify the current admin claim and the applicable Row Level Security policy.`;
  }
  if (/fetch|network|timeout|temporar/i.test(error.message ?? "")) {
    return `Supabase could not load ${resource} right now. Your session has not been cleared; retry after the connection recovers.`;
  }
  return `Supabase could not load ${resource}. Check the relevant table, columns, permissions, and connection${code ? ` (error ${code})` : ""}.`;
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ status?: string; reason?: string }> }) {
  await connection();
  let admin: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    admin = await requireAdmin();
  } catch (error) {
    if (error instanceof AdminAuthUnavailableError) return <AdminAuthUnavailable retryHref="/admin" />;
    throw error;
  }
  const { supabase, user } = admin;
  const query = await searchParams;
  const [{ data, error }, { count: articleCount }, { data: paidOrders, error: ordersError }] = await Promise.all([
    supabase.from("assets").select("id,kind,title,description,category,price,image_url,storage_path,published")
      .order("created_at", { ascending: false }),
    supabase.from("articles").select("id", { count: "exact", head: true }),
    supabase.from("orders").select("id,subtotal_cents").eq("status", "paid"),
  ]);
  const assets = (data ?? []) as Asset[];
  const salesTotal = (paidOrders ?? []).reduce((total, order) => total + Number(order.subtotal_cents), 0);

  return <main className="admin-page">
    <header className="admin-topbar"><Link className="wordmark" href="/"><span className="brand-mark">A</span><span>AuraVault</span></Link><nav className="admin-nav"><Link className="admin-nav-active" href="/admin">Inventory</Link><Link href="/admin/articles">Journal</Link></nav><span className="admin-private-label">PRIVATE ADMIN</span><div className="admin-user"><span>{user.email}</span><form action={logoutAdmin}><button>Sign out</button></form></div></header>
    <div className="admin-content"><p className="eyebrow"><span className="eyebrow-line" /> INVENTORY CONTROL</p><div className="admin-title-row"><div><h1>Manage inventory<span>.</span></h1><p>Changes are saved to Supabase Storage and the public catalogs.</p></div><div className="admin-count"><strong>{assets.length.toString().padStart(2, "0")}</strong><span>ITEMS</span><strong>{articleCount ?? 0}</strong><span>ARTICLES</span><strong>{paidOrders?.length ?? 0}</strong><span>PAID ORDERS</span><strong>${(salesTotal / 100).toFixed(2)}</strong><span>SALES USD</span></div></div>
      {query.status && statusMessages[query.status] && <p className={query.status.endsWith("error") || query.status === "invalid" || query.status.startsWith("invalid") ? "admin-status error" : "admin-status"} role="status">{statusMessages[query.status]}{query.reason ? ` (Supabase code: ${query.reason})` : ""}</p>}
      {error && <div className="admin-setup-note" role="alert">{queryFailureMessage(error, "inventory")}</div>}
      {ordersError && <div className="admin-setup-note" role="alert">{queryFailureMessage(ordersError, "sales")}</div>}
      <section className="admin-inventory-section"><div className="admin-section-title"><h2>Published and draft items</h2><span>{assets.length} total</span></div>
        {assets.length ? <div className="admin-inventory-list">{assets.map((asset) => <article className="admin-asset-row" key={asset.id}>
          <form action={saveAsset} className="admin-asset-form" ><input type="hidden" name="id" value={asset.id} /><label>Type<select name="kind" defaultValue={asset.kind}><option value="image">Image</option><option value="document">Document</option></select></label><label>Title<input name="title" defaultValue={asset.title} maxLength={160} required /></label><label>Category<input name="category" defaultValue={asset.category} maxLength={80} required /></label><label>Price (USD)<input name="price" type="number" min="0" max="100000" step="0.01" defaultValue={asset.price} required /></label><label className="admin-wide-field">Replace original file (private, optional)<input name="asset_file" type="file" accept="image/jpeg,image/png,image/webp,image/avif,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation" /></label><label className="admin-wide-field">Replace preview image (optional)<input name="preview_file" type="file" accept="image/jpeg,image/png,image/webp" />{asset.image_url && <a className="admin-current-file" href={asset.image_url} target="_blank" rel="noreferrer">View current preview</a>}</label><label className="admin-wide-field">Description<textarea name="description" defaultValue={asset.description} rows={2} /></label><label className="admin-publish-check"><input name="published" type="checkbox" defaultChecked={asset.published} /> Published</label><button className="admin-save-button">Save changes</button></form>
          <form action={deleteAsset} className="admin-delete-form"><input type="hidden" name="id" value={asset.id} /><button className="admin-delete-button">Delete</button></form>
        </article>)}</div> : <p className="admin-empty">No managed inventory yet. Add the first item below.</p>}
      </section>
      <section className="admin-create-section"><div className="admin-section-title"><h2>Add inventory</h2><span>NEW ITEM</span></div><form action={saveAsset} className="admin-asset-form admin-new-asset" ><label>Type<select name="kind" defaultValue="image"><option value="image">Image</option><option value="document">Document</option></select></label><label>Title<input name="title" maxLength={160} required /></label><label>Category<input name="category" maxLength={80} defaultValue="Nature" required /></label><label>Price (USD)<input name="price" type="number" min="0" max="100000" step="0.01" defaultValue="18" required /></label><label className="admin-wide-field">Upload original file (private)<input name="asset_file" type="file" accept="image/jpeg,image/png,image/webp,image/avif,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation" required /></label><label className="admin-wide-field">Preview image (required for images)<input name="preview_file" type="file" accept="image/jpeg,image/png,image/webp" /></label><label className="admin-wide-field">Description<textarea name="description" rows={2} /></label><label className="admin-publish-check"><input name="published" type="checkbox" /> Published</label><button className="admin-save-button">Upload and create</button></form></section>
    </div>
  </main>;
}