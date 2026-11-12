import { connection } from "next/server";
import { ArticleListing } from "@/components/ArticleListing";
import { SiteHeader } from "@/components/SiteHeader";
import { getPublishedArticles } from "@/lib/articles";
import { getSiteUrl } from "@/lib/site";

const siteUrl = getSiteUrl();
export const metadata = {
  title: "Journal | AuraVault",
  description: "Stories about photography, creative practice, and seeing.",
  ...(siteUrl ? { alternates: { canonical: new URL("/journal", siteUrl).toString() } } : {}),
};
export const instant = false;

export default async function JournalPage() {
  await connection();
  const articles = await getPublishedArticles();
  return <div className="site-shell"><SiteHeader active="journal" /><ArticleListing articles={articles} /></div>;
}