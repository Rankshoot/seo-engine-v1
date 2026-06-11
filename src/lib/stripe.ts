import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.warn("[stripe] WARNING: STRIPE_SECRET_KEY is not configured in environment variables.");
}

export const stripe = new Stripe(stripeSecretKey || "", {
  apiVersion: "2026-05-27.dahlia", // Standard stable API version matching types
  typescript: true,
});
