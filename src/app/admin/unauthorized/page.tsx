import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/common";

export default async function AdminUnauthorizedPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="min-h-screen bg-surface-primary flex items-center justify-center p-8">
      <Card className="max-w-md w-full p-8 space-y-6 text-center border border-border-subtle">
        <div className="space-y-2">
          <h1 className="text-[22px] font-semibold text-text-primary font-display">
            Access denied
          </h1>
          <p className="text-[14px] text-text-secondary leading-relaxed">
            Your account does not have platform admin access. Contact an owner if
            you believe this is a mistake.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/projects"
            className="inline-flex h-9 items-center justify-center rounded-md bg-text-primary px-5 text-[13px] font-medium text-surface-primary hover:opacity-90"
          >
            Back to projects
          </Link>
        </div>
      </Card>
    </div>
  );
}
