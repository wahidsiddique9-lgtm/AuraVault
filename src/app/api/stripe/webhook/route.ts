import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getStripeClient } from "@/lib/stripe";

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const service = createSupabaseServiceClient();
  if (!stripe || !webhookSecret || !service) {
    return NextResponse.json({ error: "Payment verification is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object;
    const orderId = session.metadata?.order_id;
    if (orderId) {
      const { data: order, error: lookupError } = await service.from("orders")
        .select("id,checkout_session_id")
        .eq("id", orderId)
        .maybeSingle();
      if (lookupError) return NextResponse.json({ error: "Order verification failed." }, { status: 503 });
      if (order?.checkout_session_id === session.id) {
        const { error: updateError } = await service.from("orders")
          .update({ status: "cancelled" })
          .eq("id", order.id)
          .eq("checkout_session_id", session.id)
          .eq("status", "pending");
        if (updateError) return NextResponse.json({ error: "Order update failed." }, { status: 503 });
      }
    }
    return NextResponse.json({ received: true });
  }

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object;
  const orderId = session.metadata?.order_id;
  const userId = session.metadata?.user_id;
  if (!orderId || !userId || session.mode !== "payment" || session.payment_status !== "paid") {
    return NextResponse.json({ received: true });
  }

  const { data: order, error: orderError } = await service.from("orders")
    .select("id,user_id,checkout_session_id,status,subtotal_cents,currency")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) return NextResponse.json({ error: "Order verification failed." }, { status: 503 });
  if (!order || order.checkout_session_id !== session.id || order.user_id !== userId || session.client_reference_id !== order.id ||
      session.amount_total !== order.subtotal_cents || session.currency !== order.currency) {
    console.error("[stripe] Verified event did not match its stored order", { orderId });
    return NextResponse.json({ received: true });
  }
  if (order.status === "paid") return NextResponse.json({ received: true });
  if (order.status !== "pending") return NextResponse.json({ received: true });

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
  const { data: updatedOrder, error: updateError } = await service.from("orders")
    .update({ status: "paid", paid_at: new Date().toISOString(), payment_intent_id: paymentIntentId })
    .eq("id", order.id)
    .eq("checkout_session_id", session.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (updateError) {
    console.error("[stripe] Verified order could not be marked paid", { code: updateError.code });
    return NextResponse.json({ error: "Order update failed." }, { status: 503 });
  }
  if (!updatedOrder) {
    const { data: currentOrder, error: currentOrderError } = await service.from("orders")
      .select("status")
      .eq("id", order.id)
      .maybeSingle();
    if (currentOrderError) return NextResponse.json({ error: "Order verification failed." }, { status: 503 });
    if (currentOrder?.status !== "paid") return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}