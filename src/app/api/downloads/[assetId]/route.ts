import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function GET(_request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assetId)) {
    return NextResponse.json({ error: "Download not found." }, { status: 404 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Sign in to access your downloads." }, { status: 401 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in to access your downloads." }, { status: 401 });

  const service = createSupabaseServiceClient();
  if (!service) return NextResponse.json({ error: "Downloads are not configured." }, { status: 503 });

  const { data: orders, error: orderError } = await service.from("orders")
    .select("id").eq("user_id", user.id).in("status", ["paid", "free"]);
  if (orderError || !orders?.length) return NextResponse.json({ error: "No purchase was found for this file." }, { status: 404 });

  const { data: purchase, error: purchaseError } = await service.from("order_items")
    .select("id,storage_path").eq("asset_id", assetId).in("order_id", orders.map((order) => order.id)).limit(1).maybeSingle();
  if (purchaseError || typeof purchase?.storage_path !== "string" || !purchase.storage_path.startsWith("originals/")) {
    return NextResponse.json({ error: "This file is not available for secure delivery." }, { status: 404 });
  }

  const { data: signedFile, error: signingError } = await service.storage
    .from("marketplace-originals").createSignedUrl(purchase.storage_path, 60, { download: true });
  if (signingError || !signedFile?.signedUrl) {
    console.error("[downloads] Signed URL creation failed", { name: signingError?.name ?? "unknown" });
    return NextResponse.json({ error: "The download could not be prepared." }, { status: 503 });
  }

  return NextResponse.redirect(signedFile.signedUrl, { status: 303, headers: { "Cache-Control": "no-store" } });
}