"use client";

import { createContext, ReactNode, useContext, useMemo, useSyncExternalStore } from "react";

export type CartItem = {
  id: string;
  title: string;
  price: number;
  image: string;
  kind: "image" | "document";
};

type CartContextValue = {
  items: CartItem[];
  totalAmount: number;
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const storageKey = "auravault-cart-v1";
const emptySnapshot = "[]";
const listeners = new Set<() => void>();

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CartItem>;
  return typeof item.id === "string" && typeof item.title === "string" &&
    typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0 &&
    typeof item.image === "string" && (item.kind === "image" || item.kind === "document");
}

export function CartProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const items = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(snapshot);
      return Array.isArray(parsed) ? parsed.filter(isCartItem) : [];
    } catch {
      return [];
    }
  }, [snapshot]);

  const value = useMemo<CartContextValue>(() => ({
    items,
    totalAmount: items.reduce((total, item) => total + item.price, 0),
    addItem: (item) => {
      const current = readItems();
      if (!current.some((existing) => existing.id === item.id && existing.kind === item.kind)) writeItems([...current, item]);
    },
    removeItem: (id) => writeItems(readItems().filter((item) => item.id !== id)),
    clearCart: () => writeItems([]),
  }), [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

function getSnapshot() {
  try {
    return window.localStorage.getItem(storageKey) ?? emptySnapshot;
  } catch {
    return emptySnapshot;
  }
}

function getServerSnapshot() {
  return emptySnapshot;
}

function readItems(): CartItem[] {
  try {
    const parsed: unknown = JSON.parse(getSnapshot());
    return Array.isArray(parsed) ? parsed.filter(isCartItem) : [];
  } catch {
    return [];
  }
}

function writeItems(items: CartItem[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(items));
  } catch {
    return;
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}