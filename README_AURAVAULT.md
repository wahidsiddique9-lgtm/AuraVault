# AuraVault

Discover. Create. Inspire.

AuraVault is a Next.js App Router marketplace and editorial application. Browsing, admin publishing, public article reading, moderated feedback, secure Stripe checkout, purchase history, and private signed delivery use Supabase. Checkout fails closed until its migration and server credentials are configured.

## Run locally

Install the declared dependencies and start the development server:

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Available in this build

- Browse published Supabase images and documents with search, category, price, sorting, and detail routes.
- Save favorites in the current browser session and manage a browser-local basket.
- Sign in through Supabase Auth; trusted admin claims protect the inventory and article dashboard and all write actions.
- Upload, edit, publish/unpublish, and remove image/document inventory from `/admin`.
- New paid originals use private Storage; separate previews remain public. Authenticated Stripe checkout, verified webhook order updates, purchase history, and short-lived downloads are implemented but require migration and provider configuration.
- Write, edit, preview, publish/unpublish, and remove Markdown articles with summaries, author names, and cover images in `/admin/articles`.
- Read published articles at `/journal` and submit reader notes for admin moderation.
- Switch between light and dark themes.

Without Supabase environment variables, database-backed pages show empty or setup states. The basket and saved favorites are browser-local. No payment is simulated or recorded.

## Supabase setup

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` using the project URL and public anon/publishable key. For the verified existing AuraVault project, review and apply only `supabase/migrations/202611040009_marketplace_database_integration.sql`. Do not rerun migration 001 or apply migrations 007/008 separately. No migration-history table is required. The final migration adds the missing preview path, order tables/policies, and the private originals bucket only when absent; it does not modify `marketplace-assets`, existing originals-bucket settings, or existing policies. It stops before DDL if it finds an unexpected order schema, public originals bucket, incompatible bucket limits, or potentially conflicting Storage policies. If it stops, review the live schema/policies and prepare an explicitly approved follow-up rather than weakening the checks. For a brand-new Supabase project, apply migrations 001 through 006 in order, then review and apply 009; do not apply the superseded 007/008 files. Enable email/password sign-in and account creation, and provision admin accounts through a trusted server-side Supabase Admin API process with `app_metadata.role = "admin"` (or `app_metadata.is_admin = true`). Never set admin claims through user-editable metadata or expose a service-role key to browser code or a `NEXT_PUBLIC_` variable. Admin pages and mutations verify the trusted admin claim.

For checkout, configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` as server-only deployment secrets, plus `NEXT_PUBLIC_SITE_URL` as the existing production origin. Register the webhook endpoint `<existing-production-origin>/api/stripe/webhook` in Stripe for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.expired`. Do not add these secrets with a `NEXT_PUBLIC_` prefix. Supabase email/password sign-up and confirmation settings must allow customer accounts. Checkout verifies the live catalog price and private-original path server-side; only a verified Stripe webhook can mark an order paid.

Set `NEXT_PUBLIC_SITE_URL` in the deployment environment to the existing production origin (for example, the site's current `https://` origin). It is used for canonical metadata and the generated `sitemap.xml`; when it is absent or invalid, the sitemap does not emit guessed hostnames. The robots route excludes `/admin` and `/cart` and advertises the sitemap when this setting is valid.

Admin uploads accept JPEG, PNG, WebP, or AVIF originals and PDF, TXT, Markdown, DOCX, XLSX, or PPTX documents up to 25 MB. New originals go into the private `marketplace-originals` bucket after migration `202611040009`; previews and article covers remain in `marketplace-assets`. The existing `marketplace-assets` bucket and already-uploaded objects remain public for compatibility. Re-upload legacy product originals through the admin form with a separate preview before enabling checkout for those items; the app deliberately rejects legacy paths from checkout. Migration 009 does not move or delete existing files.

If Supabase is not configured, `/admin` redirects to an explanatory login screen. The homepage, image/document catalogs, and journal query published Supabase records when configured.

## Remaining production work

Stripe test/live transactions, Supabase migration application, real admin upload/publishing, legacy-file migration, deployment, and Google Search Console submission still require account credentials and external access. The production URL is intentionally not guessed. Set `NEXT_PUBLIC_SITE_URL` to the current site origin to populate canonical URLs and the sitemap. Replace the remaining editorial Unsplash hero imagery with owned or properly licensed assets before launch.

## Commands

```bash
npm run lint
npm run build
```
