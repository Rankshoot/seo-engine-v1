import { Webhook } from "svix";
import { headers } from "next/headers";
import { clerkClient } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { QuotaService } from "@/services/quota";

export async function POST(req: Request) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[clerk-webhook] CLERK_WEBHOOK_SECRET is not set");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const body = await req.text();
  const wh = new Webhook(webhookSecret);

  let event: { type: string; data: Record<string, unknown> };
  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof event;
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }

  const db = getSupabaseAdmin();

  if (event.type === "user.created") {
    const userId = event.data.id as string;
    const emailAddresses = event.data.email_addresses as Array<{
      email_address: string;
      id: string;
    }>;
    const primaryEmailId = event.data.primary_email_address_id as string;
    const primaryEmail =
      emailAddresses.find((e) => e.id === primaryEmailId)?.email_address ??
      emailAddresses[0]?.email_address ??
      "";
    const createdAt = event.data.created_at as number;
    const createdAtIso = new Date(createdAt).toISOString();

    await db.from("user_approvals").upsert(
      {
        clerk_user_id: userId,
        email: primaryEmail,
        status: "pending",
        requested_at: createdAtIso,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clerk_user_id" }
    );

    await QuotaService.ensureUserRecords(userId, primaryEmail);

    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: { approved: false },
    });
  }

  if (event.type === "user.deleted") {
    const userId = event.data.id as string;
    await db.from("user_approvals").delete().eq("clerk_user_id", userId);
  }

  return new Response("OK", { status: 200 });
}
