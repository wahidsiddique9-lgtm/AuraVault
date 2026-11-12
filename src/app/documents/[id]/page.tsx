import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AssetDetail } from "@/components/AssetDetail";
import { SiteHeader } from "@/components/SiteHeader";
import { getPublishedAsset } from "@/lib/assets";
import { getSiteUrl } from "@/lib/site";

export const instant = false;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const asset = await getPublishedAsset("document", id);
  if (!asset) return { title: "Document not found | AuraVault", robots: { index: false, follow: false } };

  const description = asset.description || `Explore ${asset.title}, a digital resource from AuraVault.`;
  const siteUrl = getSiteUrl();
  return {
    title: `${asset.title} | AuraVault Documents`,
    description,
    ...(siteUrl ? { alternates: { canonical: new URL(`/documents/${encodeURIComponent(id)}`, siteUrl).toString() } } : {}),
    openGraph: { type: "website", title: asset.title, description },
  };
}

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const asset = await getPublishedAsset("document", id);
  if (!asset) notFound();
  return <div className="site-shell"><SiteHeader active="documents" /><AssetDetail asset={asset} kind="document" /></div>;
}