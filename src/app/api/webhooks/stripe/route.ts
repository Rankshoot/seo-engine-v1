import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { QuotaService } from "@/services/quota";
import { getSupabaseAdmin } from "@/lib/supabase";
import Stripe from "stripe";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured.");
    return new NextResponse("Webhook secret missing.", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new NextResponse("Missing Stripe signature.", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error(`[stripe-webhook] Signature verification failed: ${err.message}`);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // Enforce idempotency using processed_stripe_events table
  const { error: logEventError } = await db
    .from("processed_stripe_events")
    .insert({
      id: event.id,
      type: event.type,
      created_at: new Date().toISOString(),
    });

  if (logEventError) {
    if (logEventError.code === "23505") { // Unique violation
      console.warn(`[stripe-webhook] Warning: Event ${event.id} already processed.`);
      return new NextResponse("Event already processed.", { status: 200 });
    }
    console.error(`[stripe-webhook] Error tracking event ID: ${logEventError.message}`);
    return new NextResponse("Database logging failure.", { status: 500 });
  }

  console.log(`[stripe-webhook] Processing event: ${event.id} (Type: ${event.type})`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.clerkUserId;
        const planId = session.metadata?.planId;
        const stripeCustomerId = session.customer as string;
        const stripeSubscriptionId = session.subscription as string;

        if (userId && planId) {
          const status = "active";
          await QuotaService.updateUserSubscription(
            userId,
            planId,
            stripeCustomerId,
            stripeSubscriptionId,
            status
          );
          console.log(`[stripe-webhook] Checkout completed successfully for user ${userId} to plan ${planId}`);
        } else {
          console.warn("[stripe-webhook] Checkout session completed without metadata details.", session.id);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        let userId = subscription.metadata?.clerkUserId;
        let planId = subscription.metadata?.planId;

        // Fallback: look up user by stripe_customer_id
        if (!userId) {
          const { data: dbUser } = await db
            .from("users")
            .select("id, plan_id")
            .eq("stripe_customer_id", subscription.customer as string)
            .maybeSingle();
          userId = dbUser?.id;
          if (!planId) planId = dbUser?.plan_id;
        }

        if (userId) {
          // Resolve plan ID by active price ID if possible
          const priceId = subscription.items.data[0]?.price.id;
          if (priceId) {
            const { data: matchedPlan } = await db
              .from("subscription_plans")
              .select("id")
              .eq("stripe_price_id", priceId)
              .maybeSingle();
            if (matchedPlan) {
              planId = matchedPlan.id;
            }
          }

          const isActive = subscription.status === "active" || subscription.status === "trialing";
          const status = isActive ? "active" : "inactive";

          await QuotaService.updateUserSubscription(
            userId,
            planId || "free",
            subscription.customer as string,
            subscription.id,
            status
          );
          console.log(`[stripe-webhook] Subscription updated for user ${userId}: plan ${planId}, status ${status}`);
        } else {
          console.warn("[stripe-webhook] customer.subscription.updated received for unknown user:", subscription.customer);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        let userId = subscription.metadata?.clerkUserId;

        // Fallback: look up user by stripe_customer_id
        if (!userId) {
          const { data: dbUser } = await db
            .from("users")
            .select("id")
            .eq("stripe_customer_id", subscription.customer as string)
            .maybeSingle();
          userId = dbUser?.id;
        }

        if (userId) {
          // Downgrade to free tier limits
          await QuotaService.updateUserSubscription(
            userId,
            "free",
            subscription.customer as string,
            null,
            "inactive"
          );
          console.log(`[stripe-webhook] Downgraded user ${userId} to free plan due to subscription deletion.`);
        } else {
          console.warn("[stripe-webhook] customer.subscription.deleted received for unknown user:", subscription.customer);
        }
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    return new NextResponse("Webhook processed successfully.", { status: 200 });
  } catch (err: any) {
    console.error(`[stripe-webhook] Error processing event ${event.id}: ${err.message}`);
    return new NextResponse(`Error processing webhook: ${err.message}`, { status: 500 });
  }
}
