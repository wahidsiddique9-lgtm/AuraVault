import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getStripeClient } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site";

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Sign-in is unavailable." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in before checkout." }, { status: 401 });

  let submittedIds: unknown;
  try {
    submittedIds = (await request.json()).assetIds;
  } catch {
    return NextResponse.json({ error: "The basket could not be read." }, { status: 400 });
  }
  if (!Array.isArray(submittedIds) || submittedIds.length < 1 || submittedIds.length > 20 ||
      !submittedIds.every((id) => typeof id === "string" && idPattern.test(id))) {
    return NextResponse.json({ error: "The basket contains invalid items." }, { status: 400 });
  }

  const assetIds = [...new Set(submittedIds as string[])];
  if (assetIds.length !== submittedIds.length) {
    return NextResponse.json({ error: "Remove duplicate items and try again." }, { status: 400 });
  }

  const [stripe, service, siteUrl] = [getStripeClient(), createSupabaseServiceClient(), getSiteUrl()];
  if (!service || !siteUrl) {
    return NextResponse.json({ error: "Checkout is not configured on this server." }, { status: 503 });
  }
  const origin = request.headers.get("origin");
  if (origin !== siteUrl.origin) return NextResponse.json({ error: "Checkout request origin is invalid." }, { status: 403 });

  const { data: assets, error: assetError } = await supabase.from("assets")
    .select("id,kind,title,description,price,image_url,storage_path,published")
    .in("id", assetIds)
    .eq("published", true);
  if (assetError || !assets || assets.length !== assetIds.length) {
    return NextResponse.json({ error: "One or more products are no longer available." }, { status: 409 });
  }

  const products = assets.map((asset) => {
    const price = Number(asset.price);
    return {
      ...asset,
      amountCents: Math.round(price * 100),
      hasPrivateOriginal: typeof asset.storage_path === "string" && asset.storage_path.startsWith("originals/"),
    };
  });
  if (products.some((product) => !product.hasPrivateOriginal || !Number.isSafeInteger(product.amountCents) || product.amountCents < 0)) {
    return NextResponse.json({ error: "A basket item is invalidly priced or not yet migrated to private delivery." }, { status: 409 });
  }

  const subtotalCents = products.reduce((sum, product) => sum + product.amountCents, 0);
  const { data: order, error: orderError } = await service.from("orders")
    .insert({ user_id: user.id, status: subtotalCents === 0 ? "free" : "pending", currency: "usd", subtotal_cents: subtotalCents })
    .select("id")
    .single();
  if (orderError || !order) {
    console.error("[checkout] Order creation failed", { code: orderError?.code });
    return NextResponse.json({ error: "The order could not be started." }, { status: 503 });
  }

  const { error: itemsError } = await service.from("order_items").insert(products.map((product) => ({
    order_id: order.id,
    asset_id: product.id,
    asset_title: product.title,
    storage_path: product.storage_path,
    amount_cents: product.amountCents,
  })));
  if (itemsError) {
    console.error("[checkout] Order item creation failed", { code: itemsError.code });
    await service.from("orders").update({ status: "failed" }).eq("id", order.id);
    return NextResponse.json({ error: "The order could not be started." }, { status: 503 });
  }
  if (subtotalCents === 0) {
    return NextResponse.json({ url: "/account/downloads?checkout=free" }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!stripe) {
    await service.from("orders").update({ status: "failed" }).eq("id", order.id);
    return NextResponse.json({ error: "Secure checkout is not configured on this server." }, { status: 503 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: order.id,
      customer_email: user.email ?? undefined,
      metadata: { order_id: order.id, user_id: user.id },
      line_items: products.filter((product) => product.amountCents > 0).map((product) => ({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: product.amountCents,
          product_data: {
            name: product.title,
            description: product.description.slice(0, 500) || undefined,
            ...(product.image_url ? { images: [product.image_url] } : {}),
          },
        },
      })),
      success_url: new URL("/account/downloads?checkout=success", siteUrl).toString(),
      cancel_url: new URL("/cart?checkout=cancelled", siteUrl).toString(),
    });

    const { error: sessionError } = await service.from("orders")
      .update({ checkout_session_id: session.id })
      .eq("id", order.id);
    if (sessionError || !session.url) {
      await stripe.checkout.sessions.expire(session.id);
      await service.from("orders").update({ status: "failed" }).eq("id", order.id);
      return NextResponse.json({ error: "Secure checkout could not be opened." }, { status: 503 });
    }
    return NextResponse.json({ url: session.url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[checkout] Stripe session creation failed", { name: error instanceof Error ? error.name : "unknown" });
    await service.from("orders").update({ status: "failed" }).eq("id", order.id);
    return NextResponse.json({ error: "Secure checkout could not be opened." }, { status: 503 });
  }
}