"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/CartProvider";

export function CheckoutButton() {
  const { items } = useCart();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function beginCheckout() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetIds: items.map((item) => item.id) }),
      });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) {
        setError(result.error ?? "Checkout could not be opened.");
        return;
      }
      if (result.url.startsWith("/")) {
        window.location.assign(result.url);
        return;
      }

      const checkoutUrl = new URL(result.url);
      if (checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "checkout.stripe.com") {
        setError("The checkout destination could not be verified.");
        return;
      }
      window.location.assign(checkoutUrl.toString());
    } catch {
      setError("Could not reach secure checkout. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return <div className="checkout-control">
    <button className="primary-button" type="button" disabled={pending || !items.length} onClick={beginCheckout}>
      {pending ? "Opening secure checkout…" : "Continue to secure checkout"}
    </button>
    {error && <p className="admin-form-error" role="alert">{error} <Link href="/account">Account sign in</Link></p>}
  </div>;
}