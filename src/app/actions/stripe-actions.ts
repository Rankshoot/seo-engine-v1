"use server";

import { stripe } from "@/lib/stripe";
import { currentUser } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { headers } from "next/headers";

/**
 * Creates a Stripe Checkout Session for a user subscribing to a specific plan.
 */
export async function createCheckoutSession(planId: string): Promise<{ url: string }> {
  const user = await currentUser();
  if (!user) {
    throw new Error("You must be signed in to subscribe.");
  }

  const email = user.emailAddresses[0]?.emailAddress;
  if (!email) {
    throw new Error("User account does not have a primary email address.");
  }

  const db = getSupabaseAdmin();
  
  // 1. Get plan details
  const { data: plan, error: planErr } = await db
    .from("subscription_plans")
    .select("*")
    .eq("id", planId)
    .single();

  if (planErr || !plan) {
    throw new Error(`Subscription plan "${planId}" not found.`);
  }

  if (planId === "free" || !plan.stripe_price_id) {
    throw new Error("Free plan does not require payment checkout.");
  }

  // 2. Find or create Stripe customer ID
  let { data: dbUser } = await db
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  let stripeCustomerId = dbUser?.stripe_customer_id;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { clerkUserId: user.id },
    });
    stripeCustomerId = customer.id;

    // Save Customer ID in users table
    await db.from("users").upsert({
      id: user.id,
      email,
      stripe_customer_id: stripeCustomerId,
      plan_id: "free",
      subscription_status: "inactive",
    });
  }

  // 3. Create Checkout Session
  const headersList = await headers();
  const origin = headersList.get("origin") || "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    line_items: [
      {
        price: plan.stripe_price_id,
        quantity: 1,
      },
    ],
    mode: "subscription",
    subscription_data: {
      metadata: {
        clerkUserId: user.id,
        planId,
      },
    },
    success_url: `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}&subscribed=true`,
    cancel_url: `${origin}/pricing?cancelled=true`,
    metadata: {
      clerkUserId: user.id,
      planId,
    },
  });

  if (!session.url) {
    throw new Error("Failed to create Stripe checkout session URL.");
  }

  return { url: session.url };
}

/**
 * Creates a Stripe Customer Portal Session for managing current billing settings.
 */
export async function createPortalSession(): Promise<{ url: string }> {
  const user = await currentUser();
  if (!user) {
    throw new Error("You must be signed in to manage your subscription.");
  }

  const db = getSupabaseAdmin();
  const { data: dbUser } = await db
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const stripeCustomerId = dbUser?.stripe_customer_id;
  if (!stripeCustomerId) {
    throw new Error("No billing history found. Subscribe first!");
  }

  const headersList = await headers();
  const origin = headersList.get("origin") || "http://localhost:3000";

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${origin}/pricing`,
  });

  if (!session.url) {
    throw new Error("Failed to create Stripe billing portal URL.");
  }

  return { url: session.url };
}

/**
 * Fetches all subscription plans and active pricing/subscription details for the current user.
 * Public access (no admin check).
 */
export async function getPublicPricingData() {
  const db = getSupabaseAdmin();

  // 1. Fetch plans
  const { data: plans, error } = await db
    .from("subscription_plans")
    .select("*")
    .order("monthly_price", { ascending: true });

  if (error || !plans) {
    throw new Error("Could not load pricing plans.");
  }

  // 2. Fetch logged-in user subscription state
  const user = await currentUser();
  let userActivePlanId = "free";
  let isUserSubscribed = false;

  if (user) {
    const { data: dbUser } = await db
      .from("users")
      .select("plan_id, subscription_status")
      .eq("id", user.id)
      .maybeSingle();

    if (dbUser) {
      userActivePlanId = dbUser.plan_id || "free";
      isUserSubscribed = dbUser.subscription_status === "active";
    }
  }

  return {
    plans,
    userActivePlanId,
    isUserSubscribed,
    isLoggedIn: !!user,
  };
}

