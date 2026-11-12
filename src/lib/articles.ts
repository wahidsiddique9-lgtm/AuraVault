import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PublishedArticle = {
  id: string;
  title: string;
  category: string;
  description: string;
  author_name: string;
  content: string;
  cover_url: string | null;
  published: boolean;
  created_at: string;
};

export type ApprovedFeedback = {
  id: string;
  author_name: string;
  content: string;
  created_at: string;
};

function withLegacyArticleDefaults(article: Omit<PublishedArticle, "description" | "author_name" | "cover_url">): PublishedArticle {
  return { ...article, description: "", author_name: "AuraVault", cover_url: null };
}

export async function getPublishedArticles(): Promise<PublishedArticle[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase.from("articles")
    .select("id,title,category,description,author_name,content,cover_url,published,created_at")
    .eq("published", true)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42703") {
      console.warn("[journal] Article metadata migration is pending; loading legacy fields");
      const legacy = await supabase.from("articles")
        .select("id,title,category,content,published,created_at")
        .eq("published", true)
        .order("created_at", { ascending: false });
      if (legacy.error) {
        console.error("[journal] Legacy article list failed", { code: legacy.error.code });
        return [];
      }
      return (legacy.data ?? []).map((article) => withLegacyArticleDefaults(article));
    }
    console.error("[journal] Published article list failed", { code: error.code });
    return [];
  }
  return (data ?? []) as PublishedArticle[];
}

export async function getPublishedArticle(id: string): Promise<PublishedArticle | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.from("articles")
    .select("id,title,category,description,author_name,content,cover_url,published,created_at")
    .eq("id", id).eq("published", true).maybeSingle();
  if (error) {
    if (error.code === "42703") {
      console.warn("[journal] Article metadata migration is pending; loading legacy fields");
      const legacy = await supabase.from("articles")
        .select("id,title,category,content,published,created_at")
        .eq("id", id).eq("published", true).maybeSingle();
      if (legacy.error) {
        console.error("[journal] Legacy article lookup failed", { code: legacy.error.code });
        return null;
      }
      return legacy.data ? withLegacyArticleDefaults(legacy.data) : null;
    }
    console.error("[journal] Published article lookup failed", { code: error.code });
    return null;
  }
  return data as PublishedArticle | null;
}

export async function getApprovedFeedback(articleId: string): Promise<ApprovedFeedback[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase.from("article_feedback")
    .select("id,author_name,content,created_at")
    .eq("article_id", articleId)
    .eq("approved", true)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[journal] Approved feedback lookup failed", { code: error.code });
    return [];
  }
  return (data ?? []) as ApprovedFeedback[];
}