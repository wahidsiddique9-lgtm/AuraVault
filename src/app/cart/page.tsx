"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { CheckoutButton } from "@/components/CheckoutButton";
import { useCart } from "@/components/CartProvider";

export default function CartPage() {
  const { items, totalAmount, removeItem, clearCart } = useCart();
  return <div className="site-shell"><SiteHeader active="cart" /><main className="cart-page"><p className="eyebrow"><span className="eyebrow-line" /> YOUR SELECTION</p><h1>Your basket<span>.</span></h1>
    {items.length ? <div className="cart-layout"><section className="cart-page-items" aria-label="Basket items">{items.map((item) => <article className="cart-page-item" key={`${item.kind}-${item.id}`}>
      {item.image ? <img src={item.image} alt="" /> : <div className="cart-doc-thumb">AV</div>}
      <div className="cart-page-item-main"><span className="asset-category">{item.kind === "image" ? "IMAGE LICENSE" : "DIGITAL DOCUMENT"}</span><h2>{item.title}</h2><p>Single item license</p></div><strong>${item.price.toFixed(2)}</strong><button className="cart-remove" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.title}`}>×</button>
    </article>)}</section><aside className="cart-total"><div><span>Items</span><span>{items.length}</span></div><div><span>Total</span><strong>${totalAmount.toFixed(2)}</strong></div><p>Final prices are verified on the server. Downloads unlock after payment confirmation.</p><CheckoutButton /><button className="clear-cart" onClick={clearCart}>Empty basket</button></aside></div> : <div className="cart-page-empty"><span>↗</span><h2>A little room for something good.</h2><p>Your basket is empty.</p><div><Link href="/images">Browse images</Link><Link href="/documents">Browse documents</Link></div></div>}
  </main></div>;
}