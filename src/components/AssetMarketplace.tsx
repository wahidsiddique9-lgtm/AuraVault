"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Asset, AssetKind } from "@/lib/assets";
import { useCart } from "@/components/CartProvider";

const pageSize = 12;

export function AssetMarketplace({ assets, kind }: { assets: Asset[]; kind: AssetKind }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [priceFilter, setPriceFilter] = useState("Any price");
  const [sort, setSort] = useState("Featured");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const { addItem, items } = useCart();
  const categories = ["All categories", ...new Set(assets.map((asset) => asset.category))];
  const visibleAssets = useMemo(() => assets.filter((asset) => {
    const text = `${asset.title} ${asset.description} ${asset.category}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (category === "All categories" || category === asset.category) &&
      (priceFilter === "Any price" || (priceFilter === "Free" ? asset.price === 0 : asset.price > 0));
  }).sort((first, second) => sort === "Price: low to high" ? first.price - second.price : sort === "Price: high to low" ? second.price - first.price : 0), [assets, category, priceFilter, query, sort]);
  const pageCount = Math.ceil(visibleAssets.length / pageSize);
  const currentPage = Math.min(page, Math.max(pageCount, 1));
  const pageAssets = visibleAssets.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function addAsset(asset: Asset) {
    addItem({ id: asset.id, kind, title: asset.title, price: asset.price, image: asset.image_url ?? "" });
    setNotice("Added to your basket");
    window.setTimeout(() => setNotice(""), 2200);
  }

  const title = kind === "image" ? "Images" : "Documents";
  return (
    <main className="marketplace-page">
      <section className={`marketplace-hero ${kind === "document" ? "documents-hero" : "images-hero"}`}>
        <p className="eyebrow"><span className="eyebrow-line" /> THE AURAVAULT LIBRARY</p>
        <h1>{kind === "image" ? <>Images with<br /><em>a point of view.</em></> : <>Useful things<br /><em>for good work.</em></>}</h1>
        <p>{kind === "image" ? "Original photography chosen for the stories you want to tell." : "Thoughtful templates, guides, and resources for creative practice."}</p>
        <label className="market-search"><span aria-hidden="true">⌕</span><input aria-label={`Search ${title.toLowerCase()}`} placeholder={`Search ${title.toLowerCase()}`} value={query} onChange={(event) => setQuery(event.target.value)} /><span className="search-hint">↵</span></label>
      </section>
      <section className="asset-listing">
        <div className="asset-toolbar">
          <div className="asset-filter-group" aria-label="Filter by category">{categories.map((item) => <button key={item} className={category === item ? "mini-category selected" : "mini-category"} onClick={() => setCategory(item)}>{item}</button>)}</div>
          <div className="asset-controls">
            <label>Price<select value={priceFilter} onChange={(event) => setPriceFilter(event.target.value)}><option>Any price</option><option>Free</option><option>Paid</option></select></label>
            <label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option>Featured</option><option>Price: low to high</option><option>Price: high to low</option></select></label>
          </div>
        </div>
        <p className="asset-count">{visibleAssets.length} {title.toLowerCase()}</p>
        {visibleAssets.length ? <div className={`asset-grid ${kind === "document" ? "document-grid" : "image-grid"}`}>
          {pageAssets.map((asset) => {
            const inBasket = items.some((item) => item.id === asset.id && item.kind === kind);
            const detailHref = `/${kind === "image" ? "images" : "documents"}/${asset.id}`;
            return <article className="asset-card" key={asset.id}>
              <Link className="asset-cover-link" href={detailHref} aria-label={`View details for ${asset.title}`}>
                {asset.image_url ? <img className="asset-cover" src={asset.image_url} alt={asset.title} loading="lazy" /> : <div className="document-cover" aria-hidden="true"><span>AV</span><small>{asset.category.toUpperCase()}</small><b>{asset.title}</b><i>DOWNLOADABLE RESOURCE</i></div>}
              </Link>
              <div className="asset-card-info"><div><p className="asset-category">{asset.category}</p><h2><Link href={detailHref}>{asset.title}</Link></h2><p className="asset-description">{asset.description}</p></div><div className="asset-card-bottom"><strong>{asset.price ? `$${asset.price.toFixed(2)}` : "FREE"}</strong><button className={inBasket ? "asset-add added" : "asset-add"} onClick={() => addAsset(asset)}>{inBasket ? "In basket" : "Add to basket"}<span>{inBasket ? "✓" : "+"}</span></button></div></div>
            </article>;
          })}
        </div> : <div className="asset-empty"><span>⌕</span><p>No {title.toLowerCase()} match those filters.</p><button onClick={() => { setQuery(""); setCategory("All categories"); setPriceFilter("Any price"); }}>Clear filters</button></div>}
        {pageCount > 1 && <nav className="listing-pagination" aria-label={`${title} pages`}>
          <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
          <span>Page {currentPage} of {pageCount}</span>
          <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
        </nav>}
      </section>
      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}