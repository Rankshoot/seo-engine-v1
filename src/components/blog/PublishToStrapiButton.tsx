"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { integrationsApi } from "@/frontend/api/integrations";

const STRAPI_CONFIGURED = process.env.NEXT_PUBLIC_STRAPI_CONFIGURED === "true";

interface Props {
  blogId: string;
  disabled?: boolean;
  onPublished?: (slug: string) => void;
}

export function PublishToOwnBlogButton({ blogId, disabled, onPublished }: Props) {
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
      className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-semibold transition-all disabled:opacity-40 border"
      style={{
        background: "transparent",
        borderColor: "var(--brand-action)",
        color: "var(--brand-action)",
      }}
      title="Publish this post to the Rankshoot public blog via Strapi"
    >
      {loading ? (
        <>
          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1" />
          </svg>
          Publishing…
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.338-2.32 5.75 5.75 0 0 1 1.166 11.095H6.75Z" />
          </svg>
          Publish to Our Blog
        </>
      )}
    </button>
  );
}

interface CmsProps {
  blogId: string;
  hasCmsIntegration: boolean;
  disabled?: boolean;
  onPublished?: (slug: string) => void;
}

export function PublishToCmsButton({ blogId, hasCmsIntegration, disabled, onPublished }: CmsProps) {
  const [loading, setLoading] = useState(false);

  if (!hasCmsIntegration) return null;

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
      className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-semibold transition-all disabled:opacity-40 border"
      style={{
        background: "transparent",
        borderColor: "var(--border-default)",
        color: "var(--text-secondary)",
      }}
      title="Publish to your connected Strapi CMS"
    >
      {loading ? (
        <>
          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1" />
          </svg>
          Publishing…
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
          </svg>
          Publish to My CMS
        </>
      )}
    </button>
  );
}
