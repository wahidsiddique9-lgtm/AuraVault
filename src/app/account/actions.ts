"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function logoutAccount() {
  const supabase = await createSupabaseServerClient({ requireCookieWrites: true });
  if (supabase) await supabase.auth.signOut();
  redirect("/account");
}