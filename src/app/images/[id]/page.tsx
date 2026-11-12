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
  const asset = await getPublishedAsset("image", id);
  if (!asset) return { title: "Image not found | AuraVault", robots: { index: false, follow: false } };

  const description = asset.description || `Discover ${asset.title} in the AuraVault image collection.`;
  const siteUrl = getSiteUrl();
  return {
    title: `${asset.title} | AuraVault Images`,
    description,
    ...(siteUrl ? { alternates: { canonical: new URL(`/images/${encodeURIComponent(id)}`, siteUrl).toString() } } : {}),
    openGraph: { type: "website", title: asset.title, description, ...(asset.image_url ? { images: [asset.image_url] } : {}) },
  };
}

export default async function ImageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const asset = await getPublishedAsset("image", id);
  if (!asset) notFound();
  return <div className="site-shell"><SiteHeader active="images" /><AssetDetail asset={asset} kind="image" /></div>;
}