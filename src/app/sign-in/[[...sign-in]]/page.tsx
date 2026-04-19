import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-surface-primary flex items-center justify-center relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[10%] left-[20%] w-[400px] h-[400px] rounded-full bg-brand-500/10 blur-[100px] animate-pulse-glow" />
        <div className="absolute bottom-[20%] right-[15%] w-[350px] h-[350px] rounded-full bg-accent-500/8 blur-[100px] animate-pulse-glow [animation-delay:4s]" />
      </div>

      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
        }}
      />

      <div className="relative z-10 w-full max-w-md mx-auto px-4">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-in-up">
          <a href="/" className="inline-flex items-center gap-3 text-xl font-bold text-text-primary">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-lg shadow-[0_0_20px_rgba(99,102,241,0.3)]">
              ⚡
            </span>
            SerpCraft
          </a>
          <p className="text-text-tertiary text-sm mt-3">Welcome back! Sign in to continue.</p>
        </div>

        {/* Clerk Sign In */}
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
      </div>
    </div>
  );
}
