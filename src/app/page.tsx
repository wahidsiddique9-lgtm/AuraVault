"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useCart } from "@/components/CartProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Photo = {
  id: string;
  title: string;
  creator: string;
  category: string;
  image: string;
  price: number;
  orientation: "Landscape" | "Portrait";
  description: string;
};

const imageUrl = (id: string, width = 900) => id.startsWith("http") || id.startsWith("blob:") ? id : `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;
const photoSource = (image: string, width = 900) => image.startsWith("http") || image.startsWith("blob:") ? image : imageUrl(image, width);

export default function Home() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All work");
  const [filter, setFilter] = useState("Curated");
  const [sortBy, setSortBy] = useState("Editor's choice");
  const [orientation, setOrientation] = useState("All formats");
  const [favorites, setFavorites] = useState<string[]>([]);
  const { items: cartPhotos, totalAmount: subtotal, addItem: addCartItem, removeItem: removeCartItem } = useCart();
  const [selected, setSelected] = useState<Photo | null>(null);
  const [panel, setPanel] = useState<"cart" | "upload" | "account" | null>(null);
  const [dark, setDark] = useState(false);
  const [notice, setNotice] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState("Nature");
  const [uploadPrice, setUploadPrice] = useState("18");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const categoryOptions = ["All work", ...new Set(photos.map((photo) => photo.category))];

  useEffect(() => {
    let active = true;
    async function loadPublishedImages() {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        if (active) {
          setCatalogError(true);
          setCatalogLoading(false);
        }
        return;
      }

      const { data, error } = await supabase.from("assets")
        .select("id,title,description,category,price,image_url")
        .eq("kind", "image")
        .eq("published", true)
        .order("created_at", { ascending: false });
      if (!active) return;
      if (error) {
        console.error("[catalog] Homepage image query failed", { code: error.code });
        setCatalogError(true);
      } else {
        setPhotos((data ?? []).flatMap((asset) => asset.image_url ? [{
          id: asset.id,
          title: asset.title,
          creator: "AuraVault contributor",
          category: asset.category,
          image: asset.image_url,
          price: Number(asset.price),
          orientation: "Landscape" as const,
          description: asset.description,
        }] : []));
      }
      setCatalogLoading(false);
    }
    void loadPublishedImages();
    return () => { active = false; };
  }, []);

  const visiblePhotos = photos.filter((photo) => {
    const matchesText = `${photo.title} ${photo.creator} ${photo.category} ${photo.description}`.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === "All work" || photo.category === category;
    const matchesPrice = filter !== "Free" || photo.price === 0;
    const matchesPremium = filter !== "Premium" || photo.price > 0;
    const matchesOrientation = orientation === "All formats" || photo.orientation === orientation;
    return matchesText && matchesCategory && matchesPrice && matchesPremium && matchesOrientation;
  });
  if (sortBy === "Price: low to high") visiblePhotos.sort((first, second) => first.price - second.price);
  if (sortBy === "Price: high to low") visiblePhotos.sort((first, second) => second.price - first.price);

  function showNotice(message: string) {
    if (message.startsWith("Checkout is disabled until Stripe is configured.")) {
      window.location.assign("/cart");
      return;
    }
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  }

  function toggleFavorite(id: string) {
    setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function recordOrientation(id: string, width: number, height: number) {
    const imageOrientation = width >= height ? "Landscape" as const : "Portrait" as const;
    setPhotos((current) => current.map((photo) => photo.id === id ? { ...photo, orientation: imageOrientation } : photo));
    setSelected((current) => current?.id === id ? { ...current, orientation: imageOrientation } : current);
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setAuthError("Supabase configuration is invalid. Add your project URL and anon or publishable key to .env.local, then restart Next.js.");
      return;
    }

    setAuthPending(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthError(error.message);
        return;
      }
      setPassword("");
      setPanel(null);
      showNotice("You are signed in.");
    } catch {
      setAuthError("Could not reach Supabase. Check your project URL and try again.");
    } finally {
      setAuthPending(false);
    }
  }

  function addToCart(photo: Photo) {
    addCartItem({
      id: photo.id,
      title: photo.title,
      price: photo.price,
      image: photo.image.startsWith("blob:") ? "" : photoSource(photo.image, 900),
      kind: "image",
    });
    showNotice("Added to your basket");
  }

  function acceptFiles(files: File[]) {
    const allowed = files.filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 12 * 1024 * 1024);
    if (allowed.length !== files.length) showNotice("Use JPEG, PNG or WebP files up to 12 MB each.");
    setPendingFiles((current) => [...current, ...allowed].slice(0, 10));
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    acceptFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  async function publishFiles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingFiles.length || !uploadTitle.trim()) {
      showNotice("Add at least one image and a title to continue.");
      return;
    }
    const additions = await Promise.all(pendingFiles.map(async (file, index) => {
      const bitmap = await createImageBitmap(file);
      const imageOrientation = bitmap.width >= bitmap.height ? "Landscape" as const : "Portrait" as const;
      bitmap.close();
      return {
      id: `upload-${Date.now()}-${index}`,
      title: pendingFiles.length > 1 ? `${uploadTitle.trim()} ${index + 1}` : uploadTitle.trim(),
      creator: "You",
      category: uploadCategory,
      image: URL.createObjectURL(file),
      price: Number(uploadPrice) || 0,
      orientation: imageOrientation,
      description: "New contributor submission.",
      };
    }));
    setPhotos((current) => [...additions, ...current]);
    setPendingFiles([]);
    setUploadTitle("");
    setPanel(null);
    setCategory("All work");
    showNotice("Added to this preview. Connect storage and review to publish publicly.");
  }

  return (
    <div className={`site-shell${dark ? " theme-dark" : ""}`}>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="AuraVault home"><span className="brand-mark">A</span><span>AuraVault</span></a>
        <nav className="main-nav" aria-label="Main navigation">
          <a className="nav-active" href="#discover">Discover</a>
          <Link href="/images">Images</Link>
          <Link href="/documents">Documents</Link>
          <a href="#collections">Collections</a>
          <a href="#journal">Journal</a>
          <a href="#membership">Membership</a>
        </nav>
        <div className="header-actions">
          <button className="icon-button theme-toggle" onClick={() => setDark(!dark)} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} title="Toggle theme">{dark ? "☼" : "◐"}</button>
          <Link className="text-button contributor-link" href="/admin/login">Admin sign in</Link>
          <button className="icon-button account-button" onClick={() => setPanel("account")} aria-label="Open account">♙</button>
          <button className="cart-button" onClick={() => setPanel("cart")} aria-label={`Open basket, ${cartPhotos.length} items`}><span>Basket</span><span className="cart-count">{cartPhotos.length}</span></button>
        </div>
      </header>
      <nav className="mobile-route-nav" aria-label="Browse AuraVault"><Link href="/">Discover</Link><Link href="/images">Images</Link><Link href="/documents">Documents</Link><Link href="/journal">Journal</Link></nav>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> THE CREATIVE IMAGE LIBRARY</p>
            <h1 id="hero-title">Images with<br /><em>something to say.</em></h1>
            <p className="hero-description">A considered collection of photographs for the stories you want to tell.</p>
            <form className="search-box" onSubmit={(event) => { event.preventDefault(); document.getElementById("discover")?.scrollIntoView({ behavior: "smooth" }); }}>
              <span className="search-icon" aria-hidden="true">⌕</span>
              <input aria-label="Search photographs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try ‘coastal light’ or ‘slow living’" />
              <button type="submit">Search <span aria-hidden="true">↗</span></button>
            </form>
            <div className="hero-footnote"><span>EDITOR&apos;S NOTE</span><span>Find the feeling, not just the subject.</span></div>
          </div>
          <div className="hero-art" aria-label="A dramatic mountain lake photograph">
            <img src={photos[0] ? photoSource(photos[0].image, 1600) : imageUrl("photo-1470770841072-f978cf4d019e", 1600)} alt={photos[0]?.title ?? "AuraVault image collection"} />
            <div className="hero-image-caption"><span>01 / 08</span><span>Quiet places, open skies</span><span>↗</span></div>
            <div className="hero-stamp">AV<br /><span>CURATED</span></div>
          </div>
          <div className="hero-index"><span>01</span><span className="index-rule" /><span>08</span></div>
        </section>

        <section className="category-strip" id="collections" aria-label="Browse categories">
          <div className="category-intro"><span>THE LIBRARY</span><strong>Browse by feeling</strong></div>
          <div className="category-list">
            {categoryOptions.slice(1).map((item, index) => <button key={item} className="category-chip" onClick={() => { setCategory(item); document.getElementById("discover")?.scrollIntoView({ behavior: "smooth" }); }}><span className="category-number">0{index + 1}</span>{item}<span className="chip-arrow">↗</span></button>)}
          </div>
          <button className="category-all" onClick={() => { setCategory("All work"); document.getElementById("discover")?.scrollIntoView({ behavior: "smooth" }); }}>All categories <span>↗</span></button>
        </section>

        <section className="gallery-section" id="discover">
          <div className="section-heading">
            <div><p className="eyebrow"><span className="eyebrow-line" /> A LITTLE MORE HUMAN</p><h2>Selected for <em>you.</em></h2></div>
            <p className="section-aside">Thoughtful imagery, made by independent photographers<br />and chosen by our editors.</p>
          </div>
          <div className="gallery-toolbar">
            <div className="filter-tabs" role="group" aria-label="Image type filter">
              {["Curated", "Free", "Premium", "Saved"].map((item) => <button key={item} className={filter === item ? "filter-tab active" : "filter-tab"} onClick={() => setFilter(item)}>{item}{item === "Saved" && favorites.length > 0 && <span className="saved-count">{favorites.length}</span>}</button>)}
            </div>
            <label className="sort-control">Sort by <select aria-label="Sort images" onChange={(event) => setSortBy(event.target.value)} value={sortBy}><option>Editor&apos;s choice</option><option>Price: low to high</option><option>Price: high to low</option></select><span>⌄</span></label>
          </div>
          <div className="active-category-row">
            <div className="mini-categories">{categoryOptions.map((item) => <button key={item} className={category === item ? "mini-category selected" : "mini-category"} onClick={() => setCategory(item)}>{item}</button>)}</div>
            <div className="gallery-refinements"><label className="orientation-control">{orientation === "All formats" ? "Format" : orientation}<select aria-label="Filter by orientation" value={orientation} onChange={(event) => setOrientation(event.target.value)}><option>All formats</option><option>Landscape</option><option>Portrait</option></select><span>⌄</span></label><span className="result-count">{visiblePhotos.length.toString().padStart(2, "0")} photographs</span></div>
          </div>
          {catalogLoading ? <div className="empty-gallery" role="status"><p>Loading published images…</p></div> : catalogError ? <div className="empty-gallery" role="alert"><p>Published images could not be loaded. Please try again later.</p></div> : photos.length === 0 ? <div className="empty-gallery"><p>No published images yet.</p></div> : filter === "Saved" && favorites.length === 0 ? <div className="empty-gallery"><span>♡</span><p>Your collection starts with a feeling.</p><button onClick={() => setFilter("Curated")}>Back to selected work</button></div> : visiblePhotos.filter((photo) => filter !== "Saved" || favorites.includes(photo.id)).length > 0 ? (
            <div className="photo-grid">
              {visiblePhotos.filter((photo) => filter !== "Saved" || favorites.includes(photo.id)).map((photo, index) => <article className={`photo-card card-${index % 4}`} key={photo.id}>
                <button className="photo-open" onClick={() => setSelected(photo)} aria-label={`View ${photo.title}`}>
                  <img src={photoSource(photo.image, 900)} alt={photo.title} loading="lazy" onLoad={(event) => recordOrientation(photo.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} />
                  <span className="photo-overlay"><span>VIEW IMAGE</span><span>↗</span></span>
                </button>
                <button className={`favorite-button${favorites.includes(photo.id) ? " is-favorite" : ""}`} onClick={() => toggleFavorite(photo.id)} aria-label={favorites.includes(photo.id) ? "Remove from saved" : "Save photograph"}>{favorites.includes(photo.id) ? "♥" : "♡"}</button>
                <div className="photo-info"><div><h3>{photo.title}</h3><p>{photo.creator} <span>·</span> {photo.category}</p></div><span className="photo-price">{photo.price ? `$${photo.price}` : "FREE"}</span></div>
              </article>)}
            </div>
          ) : <div className="empty-gallery"><span>⌕</span><p>No photographs found for this search.</p><button onClick={() => { setQuery(""); setCategory("All work"); setFilter("Curated"); }}>Clear filters</button></div>}
          <div className="gallery-more"><span>THE COLLECTION IS ALWAYS GROWING</span><button onClick={() => { setFilter("Curated"); setCategory("All work"); setQuery(""); }}>Explore all photography <span>↗</span></button></div>
        </section>

        <section className="journal-band" id="journal">
          <div className="journal-image"><img src={imageUrl("photo-1494438639946-1ebd1d20bf85", 1000)} alt="Sunlit pages and a cup of coffee on a writing desk" /></div>
          <div className="journal-copy"><p className="eyebrow"><span className="eyebrow-line" /> AURA VAULT JOURNAL</p><h2>Stories behind<br />the <em>still frame.</em></h2><p>Notes on making, seeing, and finding the image that feels like the beginning of something.</p><Link className="journal-copy-cta" href="/journal">Read the journal <span>↗</span></Link></div>
          <div className="journal-number">02<span> / JOURNAL</span></div>
        </section>

        <section className="membership-section" id="membership">
          <div><p className="eyebrow"><span className="eyebrow-line" /> MAKE ROOM FOR GOOD WORK</p><h2>More image.<br /><em>Less searching.</em></h2></div>
          <div className="membership-detail"><p>Explore considered photography and practical creative resources for your next project.</p><button onClick={() => window.location.assign("/documents")}>Browse documents <span>↗</span></button><span className="membership-note">Images and documents, selected with care.</span></div>
          <span className="membership-seal">AURA<br />VAULT<br /><small>EST. 2025</small></span>
        </section>
      </main>

      <footer className="site-footer"><a className="wordmark" href="#top"><span className="brand-mark">A</span><span>AuraVault</span></a><span>Discover. Create. Inspire.</span><span>Independent images, thoughtfully collected.</span><span>© 2025 AURAVAULT</span></footer>

      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notification">×</button></div>}

      {selected && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="detail-modal" role="dialog" aria-modal="true" aria-label={selected.title}><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close image details">×</button><img className="detail-image" src={selected.image.startsWith("blob:") ? selected.image : imageUrl(selected.image, 1400)} alt={selected.title} /><div className="detail-copy"><p className="eyebrow">{selected.category.toUpperCase()} · AURAVAULT SELECT</p><h2>{selected.title}</h2><p>Photograph by <strong>{selected.creator}</strong></p><p className="detail-description">{selected.description}</p><div className="detail-meta"><span>High-resolution image</span><span>Royalty-free license</span><span>{selected.orientation}</span></div><div className="detail-actions"><button className="primary-button" onClick={() => addToCart(selected)}>{selected.price ? `Add license · $${selected.price}` : "Get free image"}</button><button className="outline-button" onClick={() => toggleFavorite(selected.id)}>{favorites.includes(selected.id) ? "♥ Saved" : "♡ Save"}</button></div></div></section></div>}

      {panel && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPanel(null); }}><section className={`side-panel ${panel === "cart" ? "cart-panel" : "form-panel"}`} role="dialog" aria-modal="true" aria-label={panel === "cart" ? "Your basket" : panel === "upload" ? "Contribute photographs" : "Account"}><div className="panel-heading"><div><p className="eyebrow">AURAVAULT</p><h2>{panel === "cart" ? "Your basket" : panel === "upload" ? "Share your eye." : "Welcome back."}</h2></div><button className="modal-close" onClick={() => setPanel(null)} aria-label="Close panel">×</button></div>
        {panel === "cart" && <><div className="cart-items">{cartPhotos.length ? cartPhotos.map((item) => <div className="cart-item" key={`${item.kind}-${item.id}`}>{item.image ? <img src={item.image} alt="" /> : <div className="cart-doc-thumb">AV</div>}<div><strong>{item.title}</strong><span>{item.kind === "image" ? "Standard image license" : "Digital document"}</span><b>${item.price.toFixed(2)}</b></div><button onClick={() => removeCartItem(item.id)} aria-label={`Remove ${item.title}`}>×</button></div>) : <div className="cart-empty"><span>↗</span><p>Your basket is waiting for a good image.</p><button onClick={() => setPanel(null)}>Continue exploring</button></div>}</div><div className="cart-summary"><div><span>Subtotal</span><strong>${subtotal.toFixed(2)}</strong></div><p>Taxes calculated at checkout.</p><button className="primary-button" disabled={!cartPhotos.length} onClick={() => showNotice("Checkout is disabled until Stripe is configured. No payment has been taken.")}>Continue to checkout <span>↗</span></button><small>Secure checkout provider not connected.</small></div></>}
        {panel === "upload" && <form className="upload-form" onSubmit={publishFiles}><p className="panel-intro">Contribute to a library built on thoughtful, original photography.</p><label className="field-label">Photograph title<input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="Give this image a name" required /></label><label className="field-label">Category<select value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value)}>{["Nature", "Travel", "Lifestyle", "Architecture", "People"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="field-label">License price<select value={uploadPrice} onChange={(event) => setUploadPrice(event.target.value)}><option value="0">Free image</option><option value="14">$14 · Standard</option><option value="24">$24 · Extended</option><option value="32">$32 · Premium</option></select></label><label className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); acceptFiles(Array.from(event.dataTransfer.files)); }}><span className="drop-icon">＋</span><strong>{pendingFiles.length ? `${pendingFiles.length} image${pendingFiles.length > 1 ? "s" : ""} selected` : "Choose or drop photographs"}</strong><span>JPEG, PNG or WebP · 12 MB max each · 10 files</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleFiles} /></label>{pendingFiles.length > 0 && <ul className="file-list">{pendingFiles.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => setPendingFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove ${file.name}`}>×</button></li>)}</ul>}<div className="upload-notice">Submissions added here stay in this browser preview. Secure storage, review, and public publishing are not connected.</div><button className="primary-button" type="submit">Add to preview <span>↗</span></button></form>}
        {panel === "account" && <form className="upload-form" onSubmit={signIn}><p className="panel-intro">Sign in to keep your collections and downloads together.</p><label className="field-label">Email address<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label><label className="field-label">Password<input type="password" autoComplete="current-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required /></label>{authError && <p className="admin-form-error" role="alert">{authError}</p>}<button className="primary-button" type="submit" disabled={authPending}>{authPending ? "Signing in…" : "Continue"} <span>↗</span></button><p className="account-disclaimer">Sign-in is securely handled by Supabase.</p></form>}
      </section></div>}
    </div>
  );
}
