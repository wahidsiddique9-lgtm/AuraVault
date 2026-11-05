"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function submitArticleFeedback(formData: FormData) {
  const articleId = String(formData.get("article_id") ?? "");
  const authorName = String(formData.get("author_name") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const honeypot = String(formData.get("website") ?? "").trim();
  const returnToArticle = `/journal/${articleId}`;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(articleId) ||
      authorName.length < 2 || authorName.length > 80 || content.length < 3 || content.length > 2000) {
    redirect(`${returnToArticle}?feedback=invalid`);
  }
  if (honeypot) redirect(`${returnToArticle}?feedback=submitted`);

  const supabase = await createSupabaseServerClient({ requireCookieWrites: true });
  if (!supabase) redirect(`${returnToArticle}?feedback=unavailable`);

  const { error } = await supabase.from("article_feedback").insert({
    article_id: articleId,
    author_name: authorName,
    content,
    approved: false,
  });
  if (error) {
    console.error("[journal] Feedback submission failed", { code: error.code });
    redirect(`${returnToArticle}?feedback=unavailable`);
  }

  revalidatePath(returnToArticle);
  redirect(`${returnToArticle}?feedback=submitted`);
}