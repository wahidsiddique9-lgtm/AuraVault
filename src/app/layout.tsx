import type { Metadata } from "next";
import { CartProvider } from "@/components/CartProvider";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: "AuraVault | Discover. Create. Inspire.",
  description: "A considered collection of photographs for the stories you want to tell.",
  verification: {
    google: "r5IbGugCRoyWmWL7q0xC3Ttb4dOT87BCFYGW8DRMyc4",
  },
  ...(siteUrl ? { metadataBase: siteUrl, alternates: { canonical: "/" } } : {}),
  openGraph: {
    type: "website",
    siteName: "AuraVault",
    title: "AuraVault | Discover. Create. Inspire.",
    description: "A considered collection of photographs for the stories you want to tell.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body><CartProvider>{children}</CartProvider></body>
    </html>
  );
}

// Force Vercel rebuild for Supabase keys
