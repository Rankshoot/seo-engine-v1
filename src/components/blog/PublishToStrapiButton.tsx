"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { integrationsApi } from "@/frontend/api/integrations";

const STRAPI_CONFIGURED = process.env.NEXT_PUBLIC_STRAPI_CONFIGURED === "true";

// ─── Publish to Rankshoot's own blog ─────────────────────────────────────────

interface OwnBlogProps {
  blogId: string;
  disabled?: boolean;
  onPublished?: (slug: string) => void;
}

export function PublishToOwnBlogButton({ blogId, disabled, onPublished }: OwnBlogProps) {
  const [loading, setLoading] = useState(false);

  if (!STRAPI_CONFIGURED) return null;

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await integrationsApi.publishToOwnStrapi(blogId);
      if (res.success) {
        toast.success("Published to Rankshoot Blog!");
        onPublished?.(res.slug ?? "");
      } else {
        toast.error(res.error ?? "Could not publish to blog");
      }
    } catch {
      toast.error("Failed to publish. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className="w-full flex items-center justify-center gap-2 rounded-[32px] py-2.5 text-[13px] font-semibold transition-all disabled:opacity-40"
      style={{ background: "var(--brand-action)", color: "#ffffff" }}
    >
      {loading ? (
        <>
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3M3 12h3m12 0h3" />
          </svg>
          Publishing…
        </>
      ) : (
        <>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.338-2.32 5.75 5.75 0 0 1 1.166 11.095H6.75Z" />
          </svg>
          Publish to Our Blog
        </>
      )}
    </button>
  );
}

// ─── Publish to user's own CMS ────────────────────────────────────────────────

interface CmsProps {
  blogId: string;
  hasCmsIntegration: boolean;
  projectId: string;
  disabled?: boolean;
  onPublished?: (slug: string) => void;
}

export function PublishToCmsButton({ blogId, hasCmsIntegration, projectId, disabled, onPublished }: CmsProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (!hasCmsIntegration) {
    return (
      <div className="w-full rounded-[12px] border border-dashed border-border-strong bg-surface-secondary/50 px-4 py-3.5 flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
          </svg>
          <span className="text-[11px] font-medium text-text-tertiary">No CMS connected</span>
        </div>
        <button
          type="button"
          onClick={() => router.push(`/projects/${projectId}/settings`)}
          className="text-[11px] font-semibold text-brand-action hover:underline underline-offset-2 transition-colors"
        >
          Connect Strapi in Settings →
        </button>
      </div>
    );
  }

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await integrationsApi.publishToCms(blogId);
      if (res.success) {
        toast.success("Published to your Strapi CMS!");
        onPublished?.(res.slug ?? "");
      } else {
        toast.error(res.error ?? "Could not publish to your CMS");
      }
    } catch {
      toast.error("Failed to publish. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className="w-full flex items-center justify-center gap-2 rounded-[32px] py-2.5 text-[13px] font-semibold transition-all disabled:opacity-40 border"
      style={{ borderColor: "var(--border-default)", color: "var(--text-primary)", background: "transparent" }}
    >
      {loading ? (
        <>
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3M3 12h3m12 0h3" />
          </svg>
          Publishing…
        </>
      ) : (
        <>
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
          </svg>
          Publish to My CMS
        </>
      )}
    </button>
  );
}
