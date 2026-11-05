import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AssetKind = "image" | "document";
export type Asset = {
  id: string;
  kind: AssetKind;
  title: string;
  description: string;
  category: string;
  price: number;
  image_url: string | null;
  storage_path?: string | null;
  published: boolean;
};

export async function getPublishedAssets(kind: AssetKind): Promise<Asset[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase.from("assets").select("id,kind,title,description,category,price,image_url,published")
    .eq("kind", kind).eq("published", true).order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as Asset[];
}

export async function getPublishedAsset(kind: AssetKind, id: string): Promise<Asset | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.from("assets")
    .select("id,kind,title,description,category,price,image_url,published")
    .eq("id", id).eq("kind", kind).eq("published", true).maybeSingle();
  if (error) {
    console.error("[catalog] Published asset lookup failed", { code: error.code });
    return null;
  }
  return data as Asset | null;
}