import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import ReactMarkdown from "react-markdown";
import { SiteHeader } from "@/components/SiteHeader";
import { submitArticleFeedback } from "@/app/journal/actions";
import { getApprovedFeedback, getPublishedArticle } from "@/lib/articles";
import { getSiteUrl } from "@/lib/site";

export const instant = false;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const article = await getPublishedArticle(id);
  if (!article) return { title: "Story not found | AuraVault", robots: { index: false, follow: false } };

  const description = article.description || article.content.replace(/[#*_`>\[\]()]/g, "").slice(0, 160);
  const siteUrl = getSiteUrl();
  return {
    title: `${article.title} | AuraVault Journal`,
    description,
    ...(siteUrl ? { alternates: { canonical: new URL(`/journal/${encodeURIComponent(id)}`, siteUrl).toString() } } : {}),
    openGraph: { type: "article", title: article.title, description, ...(article.cover_url ? { images: [article.cover_url] } : {}) },
  };
}

export default async function JournalArticlePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ feedback?: string }> }) {
  await connection();
  const { id } = await params;
  const article = await getPublishedArticle(id);
  if (!article) notFound();
  const [feedback, query] = await Promise.all([getApprovedFeedback(id), searchParams]);

  return (
    <div className="site-shell">
      <SiteHeader active="journal" />
      <main className="journal-article-page">
        <Link className="asset-detail-back" href="/journal">Back to the journal</Link>
        <article>
          <header className="journal-article-header">
            <p className="asset-category">{article.category}</p>
            <h1>{article.title}</h1>
            {article.description && <p className="journal-article-description">{article.description}</p>}
            <p className="journal-article-author">By {article.author_name}</p>
            <time dateTime={article.created_at}>{new Date(article.created_at).toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</time>
          </header>
          {article.cover_url && <img className="journal-article-cover" src={article.cover_url} alt={article.title} />}
          <div className="journal-article-content"><ReactMarkdown>{article.content}</ReactMarkdown></div>
          <section className="article-feedback-section" aria-labelledby="feedback-title">
            <h2 id="feedback-title">Reader notes</h2>
            {query.feedback === "submitted" && <p className="feedback-status" role="status">Thank you. Your note will appear after review.</p>}
            {query.feedback === "invalid" && <p className="admin-form-error" role="alert">Enter your name and a note between 3 and 2,000 characters.</p>}
            {query.feedback === "unavailable" && <p className="admin-form-error" role="alert">Your note could not be submitted. Please try again later.</p>}
            {feedback.length ? <div className="approved-feedback">{feedback.map((item) => (
              <article key={item.id}>
                <p>{item.content}</p>
                <span>{item.author_name} · {new Date(item.created_at).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}</span>
              </article>
            ))}</div> : <p className="feedback-empty">No reader notes yet.</p>}
            <form action={submitArticleFeedback} className="feedback-form">
              <input type="hidden" name="article_id" value={id} />
              <label className="feedback-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
              <label>Your name<input name="author_name" minLength={2} maxLength={80} required /></label>
              <label>Your note<textarea name="content" minLength={3} maxLength={2000} rows={4} required /></label>
              <p>Notes are reviewed before they appear publicly.</p>
              <button className="primary-button">Submit for review</button>
            </form>
          </section>
        </article>
      </main>
    </div>
  );
}