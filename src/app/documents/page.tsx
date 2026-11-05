import { connection } from "next/server";
import { AssetMarketplace } from "@/components/AssetMarketplace";
import { SiteHeader } from "@/components/SiteHeader";
import { getPublishedAssets } from "@/lib/assets";
import { getSiteUrl } from "@/lib/site";

const siteUrl = getSiteUrl();
export const metadata = {
  title: "Documents | AuraVault",
  description: "Creative documents, templates, and resources.",
  ...(siteUrl ? { alternates: { canonical: new URL("/documents", siteUrl).toString() } } : {}),
};
export const instant = false;

export default async function DocumentsPage() {
  await connection();
  const assets = await getPublishedAssets("document");
  return <div className="site-shell"><SiteHeader active="documents" /><AssetMarketplace assets={assets} kind="document" /></div>;
}