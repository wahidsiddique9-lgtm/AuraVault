import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getPublishedArticles } from "@/lib/articles";
import { getPublishedAssets } from "@/lib/assets";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const siteUrl = new URL("https://the-auravault.vercel.app");

  const urls: MetadataRoute.Sitemap = ["/", "/images", "/documents", "/journal"].map((path) => ({
    url: new URL(path, siteUrl).toString(),
  }));
  if (!isSupabaseConfigured()) return urls;

  const [articles, images, documents] = await Promise.all([
    getPublishedArticles(),
    getPublishedAssets("image"),
    getPublishedAssets("document"),
  ]);

  return [
    ...urls,
    ...images.map((asset) => ({ url: new URL(`/images/${encodeURIComponent(asset.id)}`, siteUrl).toString() })),
    ...documents.map((asset) => ({ url: new URL(`/documents/${encodeURIComponent(asset.id)}`, siteUrl).toString() })),
    ...articles.map((article) => ({
      url: new URL(`/journal/${encodeURIComponent(article.id)}`, siteUrl).toString(),
      lastModified: new Date(article.created_at),
    })),
  ];
}