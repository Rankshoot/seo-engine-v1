"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createProject } from "@/app/actions/project-actions";
import { TARGET_REGIONS } from "@/lib/types";

export default function NewProjectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [competitors, setCompetitors] = useState(["", "", ""]);
  const [rankTrackerId, setRankTrackerId] = useState("");

  const addCompetitor = () => setCompetitors(prev => [...prev, ""]);
  const updateCompetitor = (i: number, val: string) =>
    setCompetitors(prev => prev.map((c, idx) => idx === i ? val : c));
  const removeCompetitor = (i: number) =>
    setCompetitors(prev => prev.filter((_, idx) => idx !== i));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const rtId = rankTrackerId.trim() ? Number(rankTrackerId.trim()) : null;
    const result = await createProject({
      name: fd.get("name") as string,
      domain: fd.get("domain") as string,
      company: fd.get("company") as string,
      niche: fd.get("niche") as string,
      target_audience: fd.get("target_audience") as string,
      target_region: fd.get("target_region") as string,
      target_language: "en",
      description: fd.get("description") as string,
      competitors: competitors.filter(c => c.trim()),
      ahrefs_rank_tracker_project_id: rtId,
    });

    if (result.success && result.data) {
      router.push(`/projects/${result.data.id}/keywords`);
    } else {
      setError(result.error ?? "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-primary flex items-start justify-center py-16 px-6">
      <div className="w-full max-w-2xl">
        {/* Back */}
        <Link href="/projects" className="inline-flex items-center gap-2 text-sm text-text-tertiary hover:text-text-secondary mb-8 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m12 19-7-7 7-7M19 12H5"/></svg>
          Back to Projects
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-black text-text-primary mb-2">Create New Project</h1>
          <p className="text-text-tertiary">Set up your SEO campaign. We'll use these details to find the best keywords for your niche.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section: Basics */}
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-brand-500/15 text-brand-400 flex items-center justify-center text-xs">1</span>
              Basic Info
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">Project Name *</label>
                <input name="name" required placeholder="e.g. Main SEO Campaign" className="input-field w-full" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">Company Name *</label>
                <input name="company" required placeholder="e.g. Acme Corp" className="input-field w-full" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">Website Domain *</label>
              <input name="domain" required placeholder="e.g. yourwebsite.com" className="input-field w-full" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">Description (optional)</label>
              <textarea name="description" rows={2} placeholder="Brief project notes..." className="input-field w-full resize-none" />
            </div>
          </div>

          {/* Section: Targeting */}
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-brand-500/15 text-brand-400 flex items-center justify-center text-xs">2</span>
              Targeting
            </h2>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">Niche / Industry *</label>
              <input
                name="niche"
                required
                placeholder="e.g. HR Software, Digital Marketing, Fitness Apps"
                className="input-field w-full"
              />
              <p className="text-[10px] text-text-tertiary mt-1">This drives keyword discovery — be specific.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">Target Audience *</label>
              <input
                name="target_audience"
                required
                placeholder="e.g. HR managers at mid-size companies, beginner developers"
                className="input-field w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">Target Region *</label>
              <select name="target_region" className="input-field w-full" defaultValue="us">
                {TARGET_REGIONS.map(r => (
                  <option key={r.code} value={r.code}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Section: Competitors */}
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-brand-500/15 text-brand-400 flex items-center justify-center text-xs">3</span>
                Competitors <span className="text-[10px] font-normal text-text-tertiary ml-1">(optional)</span>
              </h2>
              <button type="button" onClick={addCompetitor} className="text-xs text-brand-400 hover:text-brand-300 font-bold transition-colors">
                + Add
              </button>
            </div>

            <p className="text-xs text-text-tertiary">Adding competitors helps us find content gaps and relevant keywords.</p>

            <div className="space-y-2">
              {competitors.map((comp, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={comp}
                    onChange={e => updateCompetitor(i, e.target.value)}
                    placeholder={`competitor${i + 1}.com`}
                    className="input-field flex-1"
                  />
                  {competitors.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCompetitor(i)}
                      className="w-8 h-8 rounded-lg hover:bg-rose-500/10 text-text-tertiary hover:text-rose-400 flex items-center justify-center transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-border-subtle">
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                Ahrefs Rank Tracker Project ID
                <span className="ml-1 text-[10px] font-normal text-text-tertiary">(optional)</span>
              </label>
              <input
                value={rankTrackerId}
                onChange={e => setRankTrackerId(e.target.value)}
                placeholder="e.g. 8024646"
                className="input-field w-full"
                inputMode="numeric"
              />
              <p className="text-[10px] text-text-tertiary mt-1">
                Found in Ahrefs → Rank Tracker → your project URL. Enables richer competitor data from your tracked keywords.
              </p>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-base shadow-lg shadow-brand-500/20 hover:from-brand-400 hover:to-brand-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating project...
              </>
            ) : (
              <>
                Create Project & Discover Keywords
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/></svg>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
