"use client";

import Link from "next/link";
import { useState } from "react";
import { Asset, AssetKind } from "@/lib/assets";
import { useCart } from "@/components/CartProvider";

export function AssetDetail({ asset, kind }: { asset: Asset; kind: AssetKind }) {
  const { addItem, items } = useCart();
  const [dimensions, setDimensions] = useState("Loading…");
  const inBasket = items.some((item) => item.id === asset.id && item.kind === kind);

  return (
    <main className="asset-detail-page">
      <Link className="asset-detail-back" href={kind === "image" ? "/images" : "/documents"}>
        Back to {kind === "image" ? "images" : "documents"}
      </Link>
      <article className="asset-detail-layout">
        {kind === "image" && asset.image_url ? (
          <img
            className="asset-detail-preview"
            src={asset.image_url}
            alt={asset.title}
            onLoad={(event) => setDimensions(`${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight} px`)}
            onError={() => setDimensions("Preview unavailable")}
          />
        ) : (
          <div className="asset-detail-document" aria-hidden="true">AURAVAULT</div>
        )}
        <div className="asset-detail-copy">
          <p className="asset-category">{asset.category}</p>
          <h1>{asset.title}</h1>
          <p className="asset-detail-description">{asset.description}</p>
          <dl className="asset-detail-facts">
            <div><dt>{kind === "image" ? "Dimensions" : "Format"}</dt><dd>{kind === "image" ? dimensions : "Digital document"}</dd></div>
            <div><dt>License</dt><dd>Terms not configured</dd></div>
          </dl>
          <div className="asset-detail-purchase">
            <strong>{asset.price > 0 ? `$${asset.price.toFixed(2)}` : "Free"}</strong>
            <button
              className="primary-button"
              type="button"
              disabled={inBasket}
              onClick={() => addItem({ id: asset.id, kind, title: asset.title, price: asset.price, image: asset.image_url ?? "" })}
            >
              {inBasket ? "In basket" : "Add to basket"}
            </button>
          </div>
          <p className="asset-detail-payment-note">Checkout requires server payment setup. Eligible downloads unlock after verified payment.</p>
        </div>
      </article>
    </main>
  );
}