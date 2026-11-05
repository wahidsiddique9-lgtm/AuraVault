import Link from "next/link";
import { connection } from "next/server";
import { MarkdownArticleEditor } from "@/components/MarkdownArticleEditor";
import { createArticle, deleteArticle, deleteArticleFeedback, logoutAdmin, setFeedbackApproval, updateArticle } from "@/app/admin/actions";
import { AdminAuthUnavailableError, requireAdmin } from "@/lib/admin";
import { AdminAuthUnavailable } from "@/components/AdminAuthUnavailable";

export const metadata = { title: "Journal | AuraVault Admin", robots: { index: false, follow: false } };
export const instant = false;

type Article = {
  id: string;
  title: string;
  category: string;
  description: string;
  author_name: string;
  content: string;
  cover_url: string | null;
  cover_storage_path: string | null;
  published: boolean;
  created_at: string;
};

type Feedback = {
  id: string;
  article_id: string | null;
  author_name: string;
  content: string;
  approved: boolean;
  created_at: string;
};

const messages: Record<string, string> = {
  saved: "Article saved.",
  deleted: "Article deleted.",
  invalid: "Check the title, category, and article content.",
  "save-error": "The article could not be saved. Verify the articles table and access policy.",
  "metadata-migration-required": "Apply migration 202610310006_article_metadata.sql before saving descriptions, author names, or cover images.",
  "cover-upload-error": "The cover image could not be uploaded. Use JPEG, PNG, or WebP up to 5 MB.",
  "delete-error": "The article could not be deleted.",
  "feedback-saved": "Feedback moderation updated.",
  "feedback-deleted": "Feedback deleted.",
  "feedback-error": "The feedback action could not be completed.",
  "auth-unavailable": "Supabase could not verify your admin session. Your changes were not applied; retry the action.",
};

const categories = ["Photography", "Stories", "Tutorials", "Creative practice", "Behind the image"];

export default async function AdminArticlesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await connection();
  let admin: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    admin = await requireAdmin();
  } catch (error) {
    if (error instanceof AdminAuthUnavailableError) return <AdminAuthUnavailable retryHref="/admin/articles" />;
    throw error;
  }
  const { supabase, user } = admin;
  const query = await searchParams;
  const articleQuery = await supabase.from("articles")
    .select("id,title,category,description,author_name,content,cover_url,cover_storage_path,published,created_at")
    .order("created_at", { ascending: false });
  let data = articleQuery.data;
  let error = articleQuery.error;
  let metadataReady = !error;
  if (error?.code === "42703") {
    console.warn("[admin] Article metadata migration is pending; loading legacy fields");
    const legacyQuery = await supabase.from("articles")
      .select("id,title,category,content,published,created_at")
      .order("created_at", { ascending: false });
    error = legacyQuery.error;
    data = legacyQuery.data?.map((article) => ({
      ...article,
      description: "",
      author_name: "AuraVault",
      cover_url: null,
      cover_storage_path: null,
    })) ?? null;
    metadataReady = false;
  }
  const articles = (data ?? []) as Article[];
  const { data: feedbackData, error: feedbackError } = await supabase.from("article_feedback")
    .select("id,article_id,author_name,content,approved,created_at")
    .order("created_at", { ascending: false });
  const feedback = (feedbackData ?? []) as Feedback[];

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <Link className="wordmark" href="/"><span className="brand-mark">A</span><span>AuraVault</span></Link>
        <nav className="admin-nav">
          <Link href="/admin">Inventory</Link>
          <Link className="admin-nav-active" href="/admin/articles">Journal</Link>
        </nav>
        <span className="admin-private-label">PRIVATE ADMIN</span>
        <div className="admin-user"><span>{user.email}</span><form action={logoutAdmin}><button>Sign out</button></form></div>
      </header>

      <div className="admin-content">
        <p className="eyebrow"><span className="eyebrow-line" /> AURA VAULT JOURNAL</p>
        <div className="admin-title-row">
          <div><h1>Write a story<span>.</span></h1><p>Draft and publish photography stories, tutorials, and creative ideas.</p></div>
          <div className="admin-count"><strong>{articles.length.toString().padStart(2, "0")}</strong><span>ARTICLES</span></div>
        </div>
        {query.status && messages[query.status] && (
          <p className={query.status.endsWith("error") || query.status === "invalid" ? "admin-status error" : "admin-status"} role="status">
            {messages[query.status]}
          </p>
        )}
        {error && <div className="admin-setup-note">Articles could not be loaded. Apply <code>supabase/migrations/202610310002_storage_and_articles.sql</code>.</div>}
        {!metadataReady && !error && <div className="admin-setup-note">Apply <code>supabase/migrations/202610310006_article_metadata.sql</code> to save article descriptions, author names, and cover images.</div>}

        <section className="article-editor-section">
          <div className="admin-section-title"><h2>New article</h2><span>MARKDOWN SUPPORTED</span></div>
          <form action={createArticle} className="article-editor-form">
            <div className="article-meta-fields">
              <label>Title<input name="title" maxLength={180} placeholder="A good title invites a closer look" required /></label>
              <label>Category<select name="category" required defaultValue="Photography">{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label>Description<input name="description" maxLength={300} placeholder="A short summary for the journal listing" /></label>
              <label>Author<input name="author_name" minLength={2} maxLength={80} defaultValue="AuraVault" required /></label>
            </div>
            <label className="article-cover-field">Cover image<input name="cover_file" type="file" accept="image/jpeg,image/png,image/webp" /></label>
            <label className="article-content-field">
              Article content
              <MarkdownArticleEditor name="content" rows={18} placeholder={"Write your story here. Markdown is supported.\n\n## A section heading\n\nAdd your opening paragraph..."} />
            </label>
            <div className="article-submit-row">
              <label className="admin-publish-check"><input name="published" type="checkbox" /> Publish immediately</label>
              <button className="admin-save-button">Save article</button>
            </div>
          </form>
        </section>

        <section className="admin-inventory-section">
          <div className="admin-section-title"><h2>Saved articles</h2><span>{articles.length} TOTAL</span></div>
          {articles.length ? (
            <div className="article-admin-list">
              {articles.map((article) => (
                <article className="article-admin-row" key={article.id}>
                  <div className="article-admin-meta">
                    <span className="asset-category">{article.category}</span>
                    <span className={article.published ? "article-status published" : "article-status"}>{article.published ? "Published" : "Draft"}</span>
                    <time dateTime={article.created_at}>{new Date(article.created_at).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}</time>
                  </div>
                  <h3>{article.title}</h3>
                  <details>
                    <summary>Edit article</summary>
                    <form action={updateArticle} className="article-editor-form">
                      <input type="hidden" name="id" value={article.id} />
                      <div className="article-meta-fields">
                        <label>Title<input name="title" defaultValue={article.title} maxLength={180} required /></label>
                        <label>Category<select name="category" defaultValue={article.category} required>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
                        <label>Description<input name="description" defaultValue={article.description} maxLength={300} /></label>
                        <label>Author<input name="author_name" defaultValue={article.author_name} minLength={2} maxLength={80} required /></label>
                      </div>
                      <label className="article-cover-field">Replace cover (optional)<input name="cover_file" type="file" accept="image/jpeg,image/png,image/webp" />{article.cover_url && <a className="admin-current-file" href={article.cover_url} target="_blank" rel="noreferrer">View current cover</a>}</label>
                      <label className="article-content-field">Article content<MarkdownArticleEditor name="content" defaultValue={article.content} rows={14} /></label>
                      <div className="article-submit-row">
                        <label className="admin-publish-check"><input name="published" type="checkbox" defaultChecked={article.published} /> Published</label>
                        <button className="admin-save-button">Save changes</button>
                      </div>
                    </form>
                  </details>
                  <details><summary>Preview saved content</summary><pre>{article.content}</pre></details>
                  <form action={deleteArticle}>
                    <input type="hidden" name="id" value={article.id} />
                    <button className="admin-delete-button">Delete article</button>
                  </form>
                </article>
              ))}
            </div>
          ) : <p className="admin-empty">No articles yet. Draft your first story above.</p>}
        </section>

        <section className="admin-inventory-section">
          <div className="admin-section-title"><h2>Reader feedback</h2><span>{feedback.length} TOTAL</span></div>
          {feedbackError && <p className="admin-status error">Apply <code>supabase/migrations/202610310005_article_feedback.sql</code> to enable feedback moderation.</p>}
          {feedback.length ? (
            <div className="article-admin-list">
              {feedback.map((item) => (
                <article className="article-admin-row" key={item.id}>
                  <div className="article-admin-meta">
                    <span className={item.approved ? "article-status published" : "article-status"}>{item.approved ? "Approved" : "Awaiting review"}</span>
                    <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}</time>
                  </div>
                  <p>{item.article_id ? articles.find((article) => article.id === item.article_id)?.title ?? "Article no longer published" : "Article removed"}</p>
                  <p><strong>{item.author_name}</strong></p>
                  <p>{item.content}</p>
                  <div className="feedback-admin-actions">
                    <form action={setFeedbackApproval}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="approved" value={item.approved ? "false" : "true"} />
                      <button className="admin-save-button">{item.approved ? "Unpublish note" : "Approve note"}</button>
                    </form>
                    <form action={deleteArticleFeedback}>
                      <input type="hidden" name="id" value={item.id} />
                      <button className="admin-delete-button">Delete note</button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          ) : !feedbackError ? <p className="admin-empty">No reader feedback yet.</p> : null}
        </section>
      </div>
    </main>
  );
}