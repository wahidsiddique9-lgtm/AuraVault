import { connection } from "next/server";
import { AssetMarketplace } from "@/components/AssetMarketplace";
import { SiteHeader } from "@/components/SiteHeader";
import { getPublishedAssets } from "@/lib/assets";
import { getSiteUrl } from "@/lib/site";

const siteUrl = getSiteUrl();
export const metadata = {
  title: "Images | AuraVault",
  description: "Discover thoughtfully selected stock photography.",
  ...(siteUrl ? { alternates: { canonical: new URL("/images", siteUrl).toString() } } : {}),
};
export const instant = false;

export default async function ImagesPage() {
  await connection();
  const assets = await getPublishedAssets("image");
  return <div className="site-shell"><SiteHeader active="images" /><AssetMarketplace assets={assets} kind="image" /></div>;
}