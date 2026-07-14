"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { integrationsApi } from "@/frontend/api/integrations";
import { Dialog, Spinner } from "@/components/common";

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
  const [showModal, setShowModal] = useState(false);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [loadingCategories, setLoadingCategories] = useState(false);
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
          Connect a CMS in Settings →
        </button>
      </div>
    );
  }

  const executePublish = async (catId?: number) => {
    setLoading(true);
    try {
      const res = await integrationsApi.publishToCms(blogId, {
        categoryId: catId,
      });
      if (res.success) {
        toast.success(`Published to your ${res.cmsType || "CMS"}!`);
        onPublished?.(res.slug ?? "");
        setShowModal(false);
      } else {
        toast.error(res.error ?? "Could not publish to your CMS");
      }
    } catch {
      toast.error("Failed to publish. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClick = async () => {
    setLoading(true);
    try {
      // 1. Resolve active CMS type
      const cmsRes = await integrationsApi.getUserCms();
      if (!cmsRes.success || !cmsRes.data) {
        toast.error("No active CMS integration found.");
        setLoading(false);
        return;
      }

      const cmsType = cmsRes.data.cms_type;

      // 2. If WordPress, fetch categories and show modal if there are categories
      if (cmsType === "wordpress") {
        setLoadingCategories(true);
        const catRes = await integrationsApi.getWordPressCategories();
        setLoadingCategories(false);

        if (catRes.success && catRes.categories && catRes.categories.length > 0) {
          setCategories(catRes.categories);
          // Pre-select the first category
          setSelectedCategoryId(catRes.categories[0].id);
          setShowModal(true);
          setLoading(false);
          return;
        }
      }

      // 3. Otherwise (or if WP has no categories), publish directly
      await executePublish();
    } catch (err) {
      toast.error("Failed to publish. Please try again.");
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading || loadingCategories}
        className="w-full flex items-center justify-center gap-2 rounded-[32px] py-2.5 text-[13px] font-semibold transition-all disabled:opacity-40"
        style={{ background: "var(--brand-action)", color: "#ffffff" }}
      >
        {loading || loadingCategories ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3M3 12h3m12 0h3" />
            </svg>
            {loadingCategories ? "Loading categories…" : "Publishing…"}
          </>
        ) : (
          <>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.338-2.32 5.75 5.75 0 0 1 1.166 11.095H6.75Z" />
            </svg>
            Publish
          </>
        )}
      </button>

      <Dialog
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Select WordPress Category"
        description="Choose which category to post this blog under on your WordPress site."
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="rounded-full border border-border-subtle bg-surface-primary px-4 py-2 text-[13px] font-semibold text-text-secondary hover:bg-surface-hover transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => executePublish(selectedCategoryId ?? undefined)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-action px-5 py-2 text-[13px] font-semibold text-white hover:opacity-90 transition-all disabled:opacity-40"
            >
              {loading ? (
                <>
                  <Spinner size={14} />
                  Publishing…
                </>
              ) : (
                "Confirm & Publish"
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-2.5">
          {categories.map((cat) => (
            <label
              key={cat.id}
              className={`flex items-center justify-between rounded-xl border p-4 cursor-pointer transition-all ${selectedCategoryId === cat.id
                  ? "border-text-primary bg-text-primary/5"
                  : "border-border-subtle hover:border-border-strong bg-surface-elevated"
                }`}
            >
              <span className="text-[14px] font-medium text-text-primary">{cat.name}</span>
              <input
                type="radio"
                name="wp-category"
                checked={selectedCategoryId === cat.id}
                onChange={() => setSelectedCategoryId(cat.id)}
                className="h-4 w-4 accent-brand-action cursor-pointer"
              />
            </label>
          ))}
        </div>
      </Dialog>
    </>
  );
}
