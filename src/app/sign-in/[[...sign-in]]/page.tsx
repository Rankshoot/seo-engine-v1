import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { Logo } from "@/components/brand/Logo";

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-primary">
      <BackgroundFx />

      <div className="relative z-10 mx-auto w-full max-w-md px-4">
        <div className="animate-fade-in-up mb-8 text-center">
          <Link href="/" className="inline-flex justify-center">
            <Logo size="lg" />
          </Link>
          <p className="mt-3 text-[13.5px] text-text-tertiary">
            Welcome back. Sign in to your workspace.
          </p>
        </div>

        <div className="animate-fade-in-up delay-200">
          <SignIn
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "w-full shadow-2xl !bg-surface-secondary !border !border-border-default rounded-2xl",
              },
            }}
          />
        </div>

        <p className="animate-fade-in-up delay-300 mt-8 text-center text-[12px] text-text-tertiary">
          By signing in you agree to our{" "}
          <Link href="#" className="text-text-secondary underline-offset-2 hover:underline">
            terms
          </Link>{" "}
          and{" "}
          <Link href="#" className="text-text-secondary underline-offset-2 hover:underline">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function BackgroundFx() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(124,126,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(124,126,255,0.06) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
        }}
      />
      <div className="absolute -top-32 left-1/4 h-[420px] w-[420px] rounded-full bg-brand-violet/15 blur-[120px] animate-pulse-glow" />
      <div className="absolute bottom-[10%] right-[18%] h-[360px] w-[360px] rounded-full bg-brand-aqua/10 blur-[120px] animate-pulse-glow delay-500" />
    </div>
  );
}
