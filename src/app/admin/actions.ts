"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRetryableSupabaseError, requireAdmin, requireAdminForAction, safeAuthErrorDetails } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bucketName = "marketplace-assets";
const originalsBucketName = "marketplace-originals";
const maximumUploadBytes = 25 * 1024 * 1024;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const previewTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const documentTypes = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const articleCoverTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maximumArticleCoverBytes = 5 * 1024 * 1024;

function isMissingDatabaseColumn(error: { code?: string } | null) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

async function hasExpectedFileSignature(file: File, kind: "image" | "document") {
  const header = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const startsWith = (...bytes: number[]) => bytes.every((byte, index) => header[index] === byte);
  const ascii = (start: number, length: number) => String.fromCharCode(...header.slice(start, start + length));

  if (kind === "image") {
    if (file.type === "image/jpeg") return startsWith(0xff, 0xd8, 0xff);
    if (file.type === "image/png") return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    if (file.type === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
    if (file.type === "image/avif") return ascii(4, 4) === "ftyp" && /^(avif|avis)$/.test(ascii(8, 4));
    return false;
  }

  if (file.type === "application/pdf") return ascii(0, 5) === "%PDF-";
  if (file.type.startsWith("application/vnd.openxmlformats-officedocument.")) return startsWith(0x50, 0x4b, 0x03, 0x04);
  return (file.type === "text/plain" || file.type === "text/markdown") && !header.includes(0);
}

async function hasConfirmedPurchases(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], assetId: string) {
  const { data: items, error: itemsError } = await supabase.from("order_items")
    .select("order_id").eq("asset_id", assetId);
  if (itemsError) return true;
  if (!items?.length) return false;
  const { data: orders, error: ordersError } = await supabase.from("orders")
    .select("id").in("id", items.map((item) => item.order_id)).in("status", ["paid", "free"]).limit(1);
  return ordersError || Boolean(orders?.length);
}

export type AdminLoginState = { error: string };

export async function loginAdmin(_previousState: AdminLoginState, formData: FormData): Promise<AdminLoginState> {
  let supabase;
  try {
    supabase = await createSupabaseServerClient({ requireCookieWrites: true });
  } catch (error) {
    console.warn("[auth] Admin sign-in client setup failed", safeAuthErrorDetails(error));
    return { error: "Supabase is temporarily unavailable. Your sign-in was not completed; try again shortly." };
  }
  if (!supabase) return { error: "Admin sign-in is unavailable until Supabase is configured." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 8) return { error: "Enter a valid email address and password." };

  let result;
  try {
    result = await supabase.auth.signInWithPassword({ email, password });
  } catch (error) {
    console.warn("[auth] Admin sign-in request failed", safeAuthErrorDetails(error));
    return { error: "Supabase is temporarily unavailable. Your sign-in was not completed; try again shortly." };
  }
  const { data, error } = result;
  if (error) {
    console.warn("[auth] Admin sign-in rejected", safeAuthErrorDetails(error));
    return {
      error: isRetryableSupabaseError(error)
        ? "Supabase is temporarily unavailable. Your sign-in was not completed; try again shortly."
        : "Email or password is incorrect.",
    };
  }
  if (!data.user) return { error: "Email or password is incorrect." };

  const metadata = data.user.app_metadata as Record<string, unknown>;
  if (metadata.role !== "admin" && metadata.is_admin !== true) {
    console.warn("[auth] Admin login denied", {
      roleClaimPresent: metadata.role === "admin",
      booleanAdminClaimPresent: metadata.is_admin === true,
    });
    await supabase.auth.signOut();
    return { error: "This account is not authorized for AuraVault administration." };
  }

  redirect("/admin");
}

export async function logoutAdmin() {
  const supabase = await createSupabaseServerClient({ requireCookieWrites: true });
  if (supabase) await supabase.auth.signOut();
  redirect("/admin/login");
}

export async function saveAsset(formData: FormData) {
  const { supabase } = await requireAdminForAction("/admin");
  const id = String(formData.get("id") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const price = Number(formData.get("price"));
  const uploadedFile = formData.get("asset_file");
  const uploadedPreview = formData.get("preview_file");
  const published = formData.get("published") === "on";

  if (!title || title.length > 160 || !category || category.length > 80 ||
      !["image", "document"].includes(kind) || !Number.isFinite(price) || price < 0 || price > 100000) {
    redirect("/admin?status=invalid");
  }

  if (kind !== "image" && kind !== "document") redirect("/admin?status=invalid");
  const file = uploadedFile instanceof File && uploadedFile.size > 0 ? uploadedFile : null;
  const previewFile = uploadedPreview instanceof File && uploadedPreview.size > 0 ? uploadedPreview : null;
  const idIsValid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (id && !idIsValid) redirect("/admin?status=invalid");
  if (!id && !file) redirect("/admin?status=file-required");

  let existing: { kind: string; storage_path: string | null; image_url: string | null; file_url: string | null; preview_storage_path: string | null } | null = null;
  if (id) {
    const { data, error } = await supabase.from("assets").select("kind,storage_path,image_url,file_url,preview_storage_path").eq("id", id).single();
    if (isMissingDatabaseColumn(error)) redirect("/admin?status=database-migration-required");
    if (error || !data) redirect("/admin?status=save-error");
    existing = data;
  }

  if (!file && (!existing || existing.kind !== kind || !existing.storage_path)) {
    redirect("/admin?status=file-required");
  }

  if (file && (file.size > maximumUploadBytes || !(kind === "image" ? imageTypes : documentTypes).has(file.type) || !(await hasExpectedFileSignature(file, kind)))) {
    redirect("/admin?status=invalid-file");
  }
  if (previewFile && (previewFile.size > maximumArticleCoverBytes || !previewTypes.has(previewFile.type) || !(await hasExpectedFileSignature(previewFile, "image")))) redirect("/admin?status=invalid-preview");

  let newStoragePath: string | null = null;
  let newPreviewPath: string | null = null;
  let previewUrl = existing?.image_url ?? null;
  if (file) {
    const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100) || "upload";
    newStoragePath = `originals/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from(originalsBucketName).upload(newStoragePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) {
      console.error("[publish] Storage upload failed", { name: uploadError.name });
      const uploadStatus = "statusCode" in uploadError && typeof uploadError.statusCode === "string"
        ? uploadError.statusCode
        : uploadError.name;
      const reason = /^[A-Za-z0-9_-]{1,40}$/.test(uploadStatus) ? uploadStatus : "unknown";
      redirect(`/admin?status=upload-error&reason=${encodeURIComponent(reason)}`);
    }
  }

  if (previewFile) {
    const safeName = previewFile.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100) || "preview";
    newPreviewPath = `previews/${crypto.randomUUID()}-${safeName}`;
    const { error: previewError } = await supabase.storage.from(bucketName).upload(newPreviewPath, previewFile, {
      cacheControl: "3600",
      contentType: previewFile.type,
      upsert: false,
    });
    if (previewError) {
      if (newStoragePath) await supabase.storage.from(originalsBucketName).remove([newStoragePath]);
      console.error("[publish] Preview upload failed", { name: previewError.name });
      redirect("/admin?status=preview-upload-error");
    }
    previewUrl = supabase.storage.from(bucketName).getPublicUrl(newPreviewPath).data.publicUrl;
  }
  if (kind === "image" && (!previewUrl || (file && existing && !existing.preview_storage_path && !previewFile))) {
    if (newStoragePath) await supabase.storage.from(originalsBucketName).remove([newStoragePath]);
    redirect("/admin?status=preview-required");
  }

  const values = {
    kind,
    title,
    description,
    category,
    price,
    image_url: previewUrl,
    file_url: file ? null : existing?.file_url ?? null,
    storage_path: newStoragePath ?? existing?.storage_path ?? null,
    preview_storage_path: newPreviewPath ?? existing?.preview_storage_path ?? null,
    published,
  };
  const result = id
    ? await supabase.from("assets").update(values).eq("id", id)
    : await supabase.from("assets").insert(values);
  if (result.error) {
    console.error("[publish] Asset database write failed", { code: result.error.code });
    if (newStoragePath) await supabase.storage.from(originalsBucketName).remove([newStoragePath]);
    if (newPreviewPath) await supabase.storage.from(bucketName).remove([newPreviewPath]);
    if (isMissingDatabaseColumn(result.error)) redirect("/admin?status=database-migration-required");
    redirect(`/admin?status=save-error&reason=${encodeURIComponent(result.error.code ?? "unknown")}`);
  }
  if (newStoragePath && existing?.storage_path && !(await hasConfirmedPurchases(supabase, id))) {
    const oldBucket = existing.storage_path.startsWith("originals/") ? originalsBucketName : bucketName;
    await supabase.storage.from(oldBucket).remove([existing.storage_path]);
  }
  if (newPreviewPath && existing?.preview_storage_path) await supabase.storage.from(bucketName).remove([existing.preview_storage_path]);

  revalidatePath("/images");
  revalidatePath("/documents");
  revalidatePath("/admin");
  redirect("/admin?status=saved");
}

export async function deleteAsset(formData: FormData) {
  const { supabase } = await requireAdminForAction("/admin");
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) redirect("/admin?status=invalid");
  if (await hasConfirmedPurchases(supabase, id)) redirect("/admin?status=has-sales");

  const { data: asset } = await supabase.from("assets").select("storage_path,preview_storage_path").eq("id", id).maybeSingle();
  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) redirect("/admin?status=delete-error");
  if (asset?.storage_path) {
    const storageBucket = asset.storage_path.startsWith("originals/") ? originalsBucketName : bucketName;
    await supabase.storage.from(storageBucket).remove([asset.storage_path]);
  }
  if (asset?.preview_storage_path) await supabase.storage.from(bucketName).remove([asset.preview_storage_path]);
  revalidatePath("/images");
  revalidatePath("/documents");
  revalidatePath("/admin");
  redirect("/admin?status=deleted");
}

export async function createArticle(formData: FormData) {
  const { supabase } = await requireAdminForAction("/admin/articles");
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const authorName = String(formData.get("author_name") ?? "").trim();
  const coverValue = formData.get("cover_file");
  const coverFile = coverValue instanceof File && coverValue.size > 0 ? coverValue : null;
  const published = formData.get("published") === "on";
  if (!title || title.length > 180 || !category || category.length > 80 || !content || content.length > 100000 ||
      description.length > 300 || authorName.length < 2 || authorName.length > 80 ||
      (coverFile && (coverFile.size > maximumArticleCoverBytes || !articleCoverTypes.has(coverFile.type) || !(await hasExpectedFileSignature(coverFile, "image"))))) {
    redirect("/admin/articles?status=invalid");
  }
  let coverPath: string | null = null;
  let coverUrl: string | null = null;
  if (coverFile) {
    const safeName = coverFile.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100) || "cover";
    coverPath = `article-covers/${crypto.randomUUID()}-${safeName}`;
    const { error: coverError } = await supabase.storage.from(bucketName).upload(coverPath, coverFile, {
      cacheControl: "3600",
      contentType: coverFile.type,
      upsert: false,
    });
    if (coverError) {
      console.error("[journal] Cover upload failed", { name: coverError.name });
      redirect("/admin/articles?status=cover-upload-error");
    }
    coverUrl = supabase.storage.from(bucketName).getPublicUrl(coverPath).data.publicUrl;
  }

  let { error } = await supabase.from("articles").insert({
    title, category, content, description, author_name: authorName, published,
    cover_url: coverUrl, cover_storage_path: coverPath,
  });
  if (error?.code === "42703" && !description && authorName === "AuraVault" && !coverFile) {
    const legacyInsert = await supabase.from("articles").insert({ title, category, content, published });
    error = legacyInsert.error;
  } else if (error?.code === "42703") {
    if (coverPath) await supabase.storage.from(bucketName).remove([coverPath]);
    redirect("/admin/articles?status=metadata-migration-required");
  }
  if (error) {
    if (coverPath) await supabase.storage.from(bucketName).remove([coverPath]);
    redirect("/admin/articles?status=save-error");
  }
  revalidatePath("/admin/articles");
  revalidatePath("/journal");
  redirect("/admin/articles?status=saved");
}

export async function updateArticle(formData: FormData) {
  const { supabase } = await requireAdminForAction("/admin/articles");
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const authorName = String(formData.get("author_name") ?? "").trim();
  const coverValue = formData.get("cover_file");
  const coverFile = coverValue instanceof File && coverValue.size > 0 ? coverValue : null;
  const published = formData.get("published") === "on";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
      !title || title.length > 180 || !category || category.length > 80 || !content || content.length > 100000 ||
      description.length > 300 || authorName.length < 2 || authorName.length > 80 ||
      (coverFile && (coverFile.size > maximumArticleCoverBytes || !articleCoverTypes.has(coverFile.type) || !(await hasExpectedFileSignature(coverFile, "image"))))) {
    redirect("/admin/articles?status=invalid");
  }

  const { data: existing, error: existingError } = await supabase.from("articles")
    .select("cover_storage_path,cover_url").eq("id", id).maybeSingle();
  if (existingError?.code === "42703") {
    if (description || authorName !== "AuraVault" || coverFile) {
      redirect("/admin/articles?status=metadata-migration-required");
    }
    const legacyUpdate = await supabase.from("articles")
      .update({ title, category, content, published, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (legacyUpdate.error) redirect("/admin/articles?status=save-error");
    revalidatePath("/admin/articles");
    revalidatePath("/journal");
    revalidatePath(`/journal/${id}`);
    redirect("/admin/articles?status=saved");
  }
  if (existingError || !existing) redirect("/admin/articles?status=save-error");

  let newCoverPath: string | null = null;
  let newCoverUrl: string | null = null;
  if (coverFile) {
    const safeName = coverFile.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100) || "cover";
    newCoverPath = `article-covers/${crypto.randomUUID()}-${safeName}`;
    const { error: coverError } = await supabase.storage.from(bucketName).upload(newCoverPath, coverFile, {
      cacheControl: "3600",
      contentType: coverFile.type,
      upsert: false,
    });
    if (coverError) {
      console.error("[journal] Cover replacement failed", { name: coverError.name });
      redirect("/admin/articles?status=cover-upload-error");
    }
    newCoverUrl = supabase.storage.from(bucketName).getPublicUrl(newCoverPath).data.publicUrl;
  }

  const { data, error } = await supabase.from("articles")
    .update({
      title, category, content, description, author_name: authorName, published,
      cover_url: newCoverUrl ?? existing.cover_url,
      cover_storage_path: newCoverPath ?? existing.cover_storage_path,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (newCoverPath) await supabase.storage.from(bucketName).remove([newCoverPath]);
    redirect("/admin/articles?status=save-error");
  }
  if (newCoverPath && existing.cover_storage_path) await supabase.storage.from(bucketName).remove([existing.cover_storage_path]);

  revalidatePath("/admin/articles");
  revalidatePath("/journal");
  revalidatePath(`/journal/${id}`);
  redirect("/admin/articles?status=saved");
}

export async function deleteArticle(formData: FormData) {
  const { supabase } = await requireAdminForAction("/admin/articles");
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) redirect("/admin/articles?status=invalid");
  const { data: article } = await supabase.from("articles").select("cover_storage_path").eq("id", id).maybeSingle();
  const { error } = await supabase.from("articles").delete().eq("id", id);
  if (error) redirect("/admin/articles?status=delete-error");
  if (article?.cover_storage_path) await supabase.storage.from(bucketName).remove([article.cover_storage_path]);
  revalidatePath("/admin/articles");
  revalidatePath("/journal");
  revalidatePath(`/journal/${id}`);
  redirect("/admin/articles?status=deleted");
}

export async function setFeedbackApproval(formData: FormData) {
  const { supabase } = await requireAdminForAction("/admin/articles");
  const id = String(formData.get("id") ?? "");
  const approvedValue = String(formData.get("approved") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
      !["true", "false"].includes(approvedValue)) {
    redirect("/admin/articles?status=feedback-error");
  }

  const { data: item, error: lookupError } = await supabase.from("article_feedback")
    .select("article_id").eq("id", id).maybeSingle();
  if (lookupError || !item) redirect("/admin/articles?status=feedback-error");

  const { error } = await supabase.from("article_feedback")
    .update({ approved: approvedValue === "true" }).eq("id", id);
  if (error) redirect("/admin/articles?status=feedback-error");

  revalidatePath("/admin/articles");
  if (item.article_id) revalidatePath(`/journal/${item.article_id}`);
  redirect("/admin/articles?status=feedback-saved");
}

export async function deleteArticleFeedback(formData: FormData) {
  const { supabase } = await requireAdminForAction("/admin/articles");
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    redirect("/admin/articles?status=feedback-error");
  }

  const { data: item, error: lookupError } = await supabase.from("article_feedback")
    .select("article_id").eq("id", id).maybeSingle();
  if (lookupError || !item) redirect("/admin/articles?status=feedback-error");

  const { error } = await supabase.from("article_feedback").delete().eq("id", id);
  if (error) redirect("/admin/articles?status=feedback-error");

  revalidatePath("/admin/articles");
  if (item.article_id) revalidatePath(`/journal/${item.article_id}`);
  redirect("/admin/articles?status=feedback-deleted");
}