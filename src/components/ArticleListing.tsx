"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PublishedArticle } from "@/lib/articles";

const pageSize = 12;

export function ArticleListing({ articles }: { articles: PublishedArticle[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All stories");
  const [page, setPage] = useState(1);
  const categories = ["All stories", ...new Set(articles.map((article) => article.category))];
  const filteredArticles = useMemo(() => articles.filter((article) => {
    const text = `${article.title} ${article.category} ${article.content}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (category === "All stories" || article.category === category);
  }), [articles, category, query]);
  const pageCount = Math.ceil(filteredArticles.length / pageSize);
  const currentPage = Math.min(page, Math.max(pageCount, 1));
  const pageArticles = filteredArticles.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <main className="journal-listing-page">
      <header className="journal-listing-hero">
        <p className="eyebrow"><span className="eyebrow-line" /> THE AURAVAULT JOURNAL</p>
        <h1>Stories behind<br /><em>the still frame.</em></h1>
        <p>Notes on making, seeing, and finding the image that feels like the beginning of something.</p>
      </header>
      <section className="journal-listing-content" aria-label="Published articles">
        <div className="journal-listing-controls">
          <label>Search stories<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, topic, or phrase" /></label>
          <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <span>{filteredArticles.length} {filteredArticles.length === 1 ? "story" : "stories"}</span>
        </div>
        {filteredArticles.length ? (
          <div className="journal-card-grid">
            {pageArticles.map((article) => (
              <article className="journal-card" key={article.id}>
                {article.cover_url && <Link href={`/journal/${article.id}`}><img className="journal-card-cover" src={article.cover_url} alt="" loading="lazy" /></Link>}
                <p className="asset-category">{article.category}</p>
                <h2><Link href={`/journal/${article.id}`}>{article.title}</Link></h2>
                <p className="journal-card-excerpt">{article.description || article.content.replace(/[#*_`>\[\]()]/g, "").slice(0, 220)}</p>
                <span className="journal-card-author">By {article.author_name}</span>
                <Link className="journal-card-link" href={`/journal/${article.id}`}>Read story <span aria-hidden="true">↗</span></Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="asset-empty">
            <span>⌕</span>
            <p>{articles.length ? "No stories match those filters." : "New stories are on the way."}</p>
            {articles.length > 0 && <button onClick={() => { setQuery(""); setCategory("All stories"); }}>Clear filters</button>}
          </div>
        )}
        {pageCount > 1 && <nav className="listing-pagination" aria-label="Journal pages">
          <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
          <span>Page {currentPage} of {pageCount}</span>
          <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
        </nav>}
      </section>
    </main>
  );
}