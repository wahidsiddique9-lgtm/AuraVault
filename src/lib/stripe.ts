import "server-only";
import Stripe from "stripe";

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  return secretKey ? new Stripe(secretKey) : null;
}