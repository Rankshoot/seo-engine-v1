import Link from "next/link";

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const body =
    message?.trim() ||
    "SerpCraft is undergoing scheduled maintenance. Please check back shortly.";

  return (
    <div className="min-h-screen bg-surface-primary flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-[10px] bg-brand-primary flex items-center justify-center text-brand-on-primary text-xl">
          ⚡
        </div>
        <h1 className="text-[22px] font-semibold text-text-primary font-display">
          We&apos;ll be right back
        </h1>
        <p className="text-[14px] text-text-secondary leading-relaxed">{body}</p>
        <Link
          href="/dashboard"
          className="inline-flex text-[13px] font-medium text-brand-action hover:underline"
        >
          Return to dashboard
        </Link>
      </div>
    </div>
  );
}
