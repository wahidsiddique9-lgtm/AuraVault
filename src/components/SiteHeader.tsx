"use client";

import Link from "next/link";
import { useCart } from "@/components/CartProvider";

export function SiteHeader({ active }: { active: "images" | "documents" | "journal" | "cart" | "account" }) {
  const { items } = useCart();
  return <>
    <header className="site-header">
      <Link className="wordmark" href="/"><span className="brand-mark">A</span><span>AuraVault</span></Link>
      <nav className="main-nav" aria-label="Main navigation">
        <Link className={active === "images" ? "nav-active" : ""} href="/images">Images</Link>
        <Link className={active === "documents" ? "nav-active" : ""} href="/documents">Documents</Link>
        <Link className={active === "journal" ? "nav-active" : ""} href="/journal">Journal</Link>
        <Link className={active === "account" ? "nav-active" : ""} href="/account">Account</Link>
      </nav>
      <div className="header-actions">
        <Link className="cart-button" href="/cart" aria-label={`Open basket, ${items.length} items`}><span>Basket</span><span className="cart-count">{items.length}</span></Link>
        <Link className="text-button admin-shortcut" href="/admin/login">Admin</Link>
      </div>
    </header>
    <nav className="mobile-route-nav" aria-label="Browse AuraVault"><Link href="/images">Images</Link><Link href="/documents">Documents</Link><Link href="/journal">Journal</Link><Link href="/account">Account</Link><Link href="/cart">Basket ({items.length})</Link></nav>
  </>;
}