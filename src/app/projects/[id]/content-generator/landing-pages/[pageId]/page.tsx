"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, useProject, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { Button, PageTitle, Spinner } from "@/components/common";
import {
  ContentTypeBadge,
  MetricPill,
  PreviewShell,
  StudioBreadcrumb,
  PreviewerScheduler,
} from "@/components/content-generator/shared";
import { LandingPagePreview } from "@/components/landing-page/LandingPagePreview";
import { blogsApi } from "@/frontend/api/blogs";
import { calendarApi } from "@/frontend/api/calendar";
import type { Blog, LandingPageContentData, Project } from "@/lib/types";
import { Dialog } from "@/components/common/dialogs/Dialog";
import { triggerDownload } from "@/lib/export";
import { exportLandingPageToHtml, exportLandingPageToReact } from "@/lib/landing-page-export-utils";

export default function LandingPageViewerPage() {
  const { id: projectId, pageId } = useParams<{ id: string; pageId: string }>();
  const queryClient = useQueryClient();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [scheduling, setScheduling] = useState(false);

  // Studio manual & AI editor states
  const [activeTab, setActiveTab] = useState<"preview" | "editor">("preview");
  const [editableSections, setEditableSections] = useState<any[]>([]);
  const [expandedSectionIndex, setExpandedSectionIndex] = useState<number | null>(0);
  const [aiPrompts, setAiPrompts] = useState<Record<number, string>>({});
  const [aiRewritingIndex, setAiRewritingIndex] = useState<number | null>(null);
  const [savingManualChanges, setSavingManualChanges] = useState(false);
  const [generatingImageIndex, setGeneratingImageIndex] = useState<number | null>(null);

  const { data: blogRes, isLoading: blogLoading } = useQuery({
    queryKey: qk.blog(pageId),
    queryFn: () => blogsApi.getById(pageId),
    enabled: !!pageId,
    ...DEFAULT_QUERY_OPTIONS,
  });

  const { data: projectRes, isLoading: projectLoading } = useProject(projectId);

  const loading = (!blog || !project) && (blogLoading || projectLoading);

  useEffect(() => {
    if (blogRes?.success && blogRes.data) {
      setBlog(blogRes.data);
      const contentData = blogRes.data.content_data as LandingPageContentData | undefined;
      if (contentData?.sections) {
        setEditableSections(contentData.sections);
      }
    }
  }, [blogRes]);

  useEffect(() => {
    if (projectRes?.success && projectRes.data) setProject(projectRes.data);
  }, [projectRes]);

  const studioBase = `/projects/${projectId}/content-generator`;

  const data = useMemo(
    () => (blog?.content_data ?? {}) as LandingPageContentData,
    [blog?.content_data],
  );

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"html" | "react">("html");

  const exportedCode = useMemo(() => {
    if (!blog || !project) return "";
    if (exportFormat === "html") {
      return exportLandingPageToHtml(data, project);
    } else {
      return exportLandingPageToReact(data, project);
    }
  }, [blog, project, exportFormat, data]);

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(exportedCode);
    toast.success("Code copied to clipboard!");
  };

  const handleDownloadFile = () => {
    if (!blog) return;
    const extension = exportFormat === "html" ? "html" : "tsx";
    const filename = `${blog.slug || "landing-page"}.${extension}`;
    const blob = new Blob([exportedCode], { type: "text/plain;charset=utf-8" });
    triggerDownload(blob, filename);
    toast.success(`${filename} downloaded successfully!`);
  };

  const handleDirectSchedule = async () => {
    if (!projectId || !blog || scheduling) return;
    setScheduling(true);
    try {
      const entriesRes = await calendarApi.entries(projectId);
      if (!entriesRes.success || !entriesRes.data) {
        toast.error("Could not fetch calendar dates");
        return;
      }
      const taken = new Set(entriesRes.data.map(e => String(e.scheduled_date).slice(0, 10)));
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      let targetDate = "";
      for (let i = 0; i < 500; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (!taken.has(key)) { targetDate = key; break; }
      }
      if (!targetDate) { toast.error("No free calendar dates found"); return; }
      const res = await calendarApi.scheduleExistingBlog(projectId, { blogId: blog.id, targetDate });
      if (res.success) {
        const niceDate = new Date(`${res.scheduled_date}T00:00:00`).toLocaleDateString("en-US", {
          month: "long", day: "numeric", year: "numeric",
        });
        toast.success(`Scheduled for ${niceDate}`);
        const updatedBlog = { ...blog, entry_id: res.data.id };
        setBlog(updatedBlog);
        queryClient.setQueryData(qk.blog(blog.id), { success: true, data: updatedBlog });
        void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.contentGeneratorHistory(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) });
      } else {
        toast.error(res.error || "Failed to schedule");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to schedule");
    } finally {
      setScheduling(false);
    }
  };

  const updateSectionField = (secIndex: number, field: string, value: any) => {
    setEditableSections((prev) => {
      const next = [...prev];
      next[secIndex] = { ...next[secIndex], [field]: value };
      return next;
    });
  };

  const updateItemField = (secIndex: number, itemIndex: number, field: string, value: any) => {
    setEditableSections((prev) => {
      const next = [...prev];
      const sec = { ...next[secIndex] } as any;
      if (sec.items) {
        const newItems = [...sec.items];
        newItems[itemIndex] = { ...newItems[itemIndex], [field]: value };
        next[secIndex] = { ...sec, items: newItems };
      } else if (sec.steps) {
        const newSteps = [...sec.steps];
        newSteps[itemIndex] = { ...newSteps[itemIndex], [field]: value };
        next[secIndex] = { ...sec, steps: newSteps };
      }
      return next;
    });
  };

  const handleSaveAllManualChanges = async () => {
    if (!blog || savingManualChanges) return;
    setSavingManualChanges(true);
    const loadingToast = toast.loading("Saving manual adjustments...");
    try {
      const updatedContentData: LandingPageContentData = {
        ...data,
        sections: editableSections,
      };

      const res = await blogsApi.updateContent(blog.id, {
        content: blog.content,
        contentData: updatedContentData,
      });

      if (res.success && res.data) {
        setBlog(res.data);
        const contentData = res.data.content_data as LandingPageContentData | undefined;
        setEditableSections(contentData?.sections ?? []);
        queryClient.setQueryData(qk.blog(blog.id), { success: true, data: res.data });
        toast.success("All manual copy changes saved!", { id: loadingToast });
      } else {
        toast.error(res.error || "Failed to save changes", { id: loadingToast });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save changes", { id: loadingToast });
    } finally {
      setSavingManualChanges(false);
    }
  };

  const handleAiRewrite = async (idx: number) => {
    const promptText = aiPrompts[idx]?.trim();
    if (!blog || !promptText || aiRewritingIndex !== null) return;
    setAiRewritingIndex(idx);
    const loadingToast = toast.loading("Invoking Claude Sonnet 4.6 for section edit...");
    try {
      const res = await fetch(`/api/v1/blogs/${blog.id}/landing-page/ai-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionIndex: idx, instruction: promptText }),
      });
      const result = await res.json();
      if (result.success && result.data) {
        setBlog(result.data);
        const contentData = result.data.content_data as LandingPageContentData | undefined;
        setEditableSections(contentData?.sections ?? []);
        queryClient.setQueryData(qk.blog(blog.id), { success: true, data: result.data });
        setAiPrompts(prev => ({ ...prev, [idx]: "" }));
        toast.success("Section rewritten successfully!", { id: loadingToast });
      } else {
        toast.error(result.error || "AI rewrite failed", { id: loadingToast });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rewrite", { id: loadingToast });
    } finally {
      setAiRewritingIndex(null);
    }
  };

  const handleGenerateImage = async (sectionIndex: number, imageAlt: string) => {
    if (!blog || generatingImageIndex !== null) return;
    setGeneratingImageIndex(sectionIndex);
    const loadingToast = toast.loading("Generating brand graphic using AI...");
    try {
      const res = await blogsApi.regenerateImage(blog.id, {
        imageAlt,
        contextBefore: `Section text: ${imageAlt}`,
        contextAfter: `Landing page keyword: ${blog.target_keyword || ""}`,
      });
      if (res.success && res.data?.url) {
        toast.success("Image generated successfully!", { id: loadingToast });
        const updatedSections = [...editableSections];
        const sec = { ...updatedSections[sectionIndex] } as any;
        sec.image_url = res.data.url;
        updatedSections[sectionIndex] = sec;

        const updatedContentData: LandingPageContentData = {
          ...data,
          sections: updatedSections,
        };

        const updateRes = await blogsApi.updateContent(blog.id, {
          content: blog.content,
          contentData: updatedContentData,
        });

        if (updateRes.success && updateRes.data) {
          setBlog(updateRes.data);
          const contentData = updateRes.data.content_data as LandingPageContentData | undefined;
          setEditableSections(contentData?.sections ?? []);
          queryClient.setQueryData(qk.blog(blog.id), { success: true, data: updateRes.data });
        } else {
          toast.error("Failed to save updated image URL to database");
        }
      } else {
        toast.error(res.error || "Failed to generate image", { id: loadingToast });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate image", { id: loadingToast });
    } finally {
      setGeneratingImageIndex(null);
    }
  };

  const renderManualSectionFields = (section: any, idx: number) => {
    switch (section.type) {
      case "hero":
        return (
          <>
            <div>
              <label className="text-[11px] font-semibold text-text-secondary block mb-1">Headline</label>
              <input
                type="text"
                value={section.headline || ""}
                onChange={(e) => updateSectionField(idx, "headline", e.target.value)}
                className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-text-secondary block mb-1">Subheadline</label>
              <textarea
                value={section.subheadline || ""}
                onChange={(e) => updateSectionField(idx, "subheadline", e.target.value)}
                className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none min-h-[60px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-text-secondary block mb-1">Primary CTA Button</label>
                <input
                  type="text"
                  value={section.cta_primary || ""}
                  onChange={(e) => updateSectionField(idx, "cta_primary", e.target.value)}
                  className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-text-secondary block mb-1">Secondary CTA Button</label>
                <input
                  type="text"
                  value={section.cta_secondary || ""}
                  onChange={(e) => updateSectionField(idx, "cta_secondary", e.target.value)}
                  className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-text-secondary block mb-1">Badge</label>
                <input
                  type="text"
                  value={section.badge || ""}
                  onChange={(e) => updateSectionField(idx, "badge", e.target.value)}
                  className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-text-secondary block mb-1">Image URL</label>
                <input
                  type="text"
                  value={section.image_url || ""}
                  onChange={(e) => updateSectionField(idx, "image_url", e.target.value)}
                  className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-text-secondary block mb-1">Trust Signals (comma-separated)</label>
              <input
                type="text"
                value={(section.trust_signals || []).join(", ")}
                onChange={(e) => updateSectionField(idx, "trust_signals", e.target.value.split(",").map((s: string) => s.trim()))}
                className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none"
              />
            </div>
          </>
        );
      case "stats":
        return (
          <>
            <div>
              <label className="text-[11px] font-semibold text-text-secondary block mb-1">Heading</label>
              <input
                type="text"
                value={section.heading || ""}
                onChange={(e) => updateSectionField(idx, "heading", e.target.value)}
                className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[11px] font-semibold text-text-secondary block">Stat Items</label>
              {(section.items || []).map((item: any, itemIdx: number) => (
                <div key={itemIdx} className="flex gap-2 items-center bg-surface-secondary p-2.5 rounded-lg border border-border-subtle">
                  <div className="w-1/3">
                    <input
                      type="text"
                      placeholder="Value"
                      value={item.value || ""}
                      onChange={(e) => updateItemField(idx, itemIdx, "value", e.target.value)}
                      className="w-full text-[12px] p-1.5 border border-border-subtle rounded bg-surface-primary text-text-primary"
                    />
                  </div>
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="Label"
                      value={item.label || ""}
                      onChange={(e) => updateItemField(idx, itemIdx, "label", e.target.value)}
                      className="w-full text-[12px] p-1.5 border border-border-subtle rounded bg-surface-primary text-text-primary"
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        );
      case "features":
        return (
          <>
            <div>
              <label className="text-[11px] font-semibold text-text-secondary block mb-1">Heading</label>
              <input
                type="text"
                value={section.heading || ""}
                onChange={(e) => updateSectionField(idx, "heading", e.target.value)}
                className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-text-secondary block mb-1">Subheading</label>
              <textarea
                value={section.subheading || ""}
                onChange={(e) => updateSectionField(idx, "subheading", e.target.value)}
                className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none min-h-[60px]"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-text-secondary block mb-1">Image URL (Optional)</label>
              <input
                type="text"
                value={section.image_url || ""}
                onChange={(e) => updateSectionField(idx, "image_url", e.target.value)}
                className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[11px] font-semibold text-text-secondary block">Features Items</label>
              {(section.items || []).map((item: any, itemIdx: number) => (
                <div key={itemIdx} className="bg-surface-secondary p-3 rounded-lg border border-border-subtle space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Icon"
                      value={item.icon || ""}
                      onChange={(e) => updateItemField(idx, itemIdx, "icon", e.target.value)}
                      className="w-12 text-[12px] p-1.5 border border-border-subtle rounded bg-surface-primary text-text-primary text-center"
                    />
                    <input
                      type="text"
                      placeholder="Feature Title"
                      value={item.title || ""}
                      onChange={(e) => updateItemField(idx, itemIdx, "title", e.target.value)}
                      className="flex-1 text-[12px] p-1.5 border border-border-subtle rounded bg-surface-primary text-text-primary"
                    />
                  </div>
                  <textarea
                    placeholder="Description"
                    value={item.description || ""}
                    onChange={(e) => updateItemField(idx, itemIdx, "description", e.target.value)}
                    className="w-full text-[12px] p-1.5 border border-border-subtle rounded bg-surface-primary text-text-primary min-h-[40px] resize-none"
                  />
                </div>
              ))}
            </div>
          </>
        );
      case "benefits":
        return (
          <>
            <div>
              <label className="text-[11px] font-semibold text-text-secondary block mb-1">Heading</label>
              <input
                type="text"
                value={section.heading || ""}
                onChange={(e) => updateSectionField(idx, "heading", e.target.value)}
                className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-text-secondary block mb-1">Subheading</label>
              <textarea
                value={section.subheading || ""}
                onChange={(e) => updateSectionField(idx, "subheading", e.target.value)}
                className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none min-h-[60px]"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-text-secondary block mb-1">Image URL (Optional)</label>
              <input
                type="text"
                value={section.image_url || ""}
                onChange={(e) => updateSectionField(idx, "image_url", e.target.value)}
                className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[11px] font-semibold text-text-secondary block">Benefits Items</label>
              {(section.items || []).map((item: any, itemIdx: number) => (
                <div key={itemIdx} className="bg-surface-secondary p-3 rounded-lg border border-border-subtle space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Icon"
                      value={item.icon || ""}
                      onChange={(e) => updateItemField(idx, itemIdx, "icon", e.target.value)}
                      className="w-12 text-[12px] p-1.5 border border-border-subtle rounded bg-surface-primary text-text-primary text-center"
                    />
                    <input
                      type="text"
                      placeholder="Benefit Title"
                      value={item.title || ""}
                      onChange={(e) => updateItemField(idx, itemIdx, "title", e.target.value)}
                      className="flex-1 text-[12px] p-1.5 border border-border-subtle rounded bg-surface-primary text-text-primary"
                    />
                  </div>
                  <textarea
                    placeholder="Description"
                    value={item.description || ""}
                    onChange={(e) => updateItemField(idx, itemIdx, "description", e.target.value)}
                    className="w-full text-[12px] p-1.5 border border-border-subtle rounded bg-surface-primary text-text-primary min-h-[40px] resize-none"
                  />
                </div>
              ))}
            </div>
          </>
        );
      case "how-it-works":
        return (
          <>
            <div>
              <label className="text-[11px] font-semibold text-text-secondary block mb-1">Heading</label>
              <input
                type="text"
                value={section.heading || ""}
                onChange={(e) => updateSectionField(idx, "heading", e.target.value)}
                className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-text-secondary block mb-1">Subheading</label>
              <textarea
                value={section.subheading || ""}
                onChange={(e) => updateSectionField(idx, "subheading", e.target.value)}
                className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none min-h-[60px]"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[11px] font-semibold text-text-secondary block">Steps</label>
              {(section.steps || []).map((step: any, stepIdx: number) => (
                <div key={stepIdx} className="bg-surface-secondary p-3 rounded-lg border border-border-subtle space-y-2">
                  <input
                    type="text"
                    placeholder="Step Title"
                    value={step.title || ""}
                    onChange={(e) => updateItemField(idx, stepIdx, "title", e.target.value)}
                    className="w-full text-[12px] p-1.5 border border-border-subtle rounded bg-surface-primary text-text-primary"
                  />
                  <textarea
                    placeholder="Step Description"
                    value={step.description || ""}
                    onChange={(e) => updateItemField(idx, stepIdx, "description", e.target.value)}
                    className="w-full text-[12px] p-1.5 border border-border-subtle rounded bg-surface-primary text-text-primary min-h-[40px] resize-none"
                  />
                </div>
              ))}
            </div>
          </>
        );
      case "testimonials":
        return (
          <>
            <div>
              <label className="text-[11px] font-semibold text-text-secondary block mb-1">Heading</label>
              <input
                type="text"
                value={section.heading || ""}
                onChange={(e) => updateSectionField(idx, "heading", e.target.value)}
                className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[11px] font-semibold text-text-secondary block">Testimonials</label>
              {(section.items || []).map((item: any, itemIdx: number) => (
                <div key={itemIdx} className="bg-surface-secondary p-3 rounded-lg border border-border-subtle space-y-2">
                  <textarea
                    placeholder="Quote"
                    value={item.quote || ""}
                    onChange={(e) => updateItemField(idx, itemIdx, "quote", e.target.value)}
                    className="w-full text-[12px] p-1.5 border border-border-subtle rounded bg-surface-primary text-text-primary min-h-[40px] resize-none"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Author"
                      value={item.author || ""}
                      onChange={(e) => updateItemField(idx, itemIdx, "author", e.target.value)}
                      className="text-[12px] p-1.5 border border-border-subtle rounded bg-surface-primary text-text-primary"
                    />
                    <input
                      type="text"
                      placeholder="Role"
                      value={item.role || ""}
                      onChange={(e) => updateItemField(idx, itemIdx, "role", e.target.value)}
                      className="text-[12px] p-1.5 border border-border-subtle rounded bg-surface-primary text-text-primary"
                    />
                    <input
                      type="text"
                      placeholder="Company"
                      value={item.company || ""}
                      onChange={(e) => updateItemField(idx, itemIdx, "company", e.target.value)}
                      className="text-[12px] p-1.5 border border-border-subtle rounded bg-surface-primary text-text-primary"
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        );
      case "faq":
        return (
          <>
            <div>
              <label className="text-[11px] font-semibold text-text-secondary block mb-1">Heading</label>
              <input
                type="text"
                value={section.heading || ""}
                onChange={(e) => updateSectionField(idx, "heading", e.target.value)}
                className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[11px] font-semibold text-text-secondary block">FAQ Items</label>
              {(section.items || []).map((item: any, itemIdx: number) => (
                <div key={itemIdx} className="bg-surface-secondary p-3 rounded-lg border border-border-subtle space-y-2">
                  <input
                    type="text"
                    placeholder="Question"
                    value={item.question || ""}
                    onChange={(e) => updateItemField(idx, itemIdx, "question", e.target.value)}
                    className="w-full text-[12px] p-1.5 border border-border-subtle rounded bg-surface-primary text-text-primary"
                  />
                  <textarea
                    placeholder="Answer"
                    value={item.answer || ""}
                    onChange={(e) => updateItemField(idx, itemIdx, "answer", e.target.value)}
                    className="w-full text-[12px] p-1.5 border border-border-subtle rounded bg-surface-primary text-text-primary min-h-[45px] resize-none"
                  />
                </div>
              ))}
            </div>
          </>
        );
      case "cta":
        return (
          <>
            <div>
              <label className="text-[11px] font-semibold text-text-secondary block mb-1">Heading</label>
              <input
                type="text"
                value={section.heading || ""}
                onChange={(e) => updateSectionField(idx, "heading", e.target.value)}
                className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-text-secondary block mb-1">Subheading</label>
              <textarea
                value={section.subheading || ""}
                onChange={(e) => updateSectionField(idx, "subheading", e.target.value)}
                className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none min-h-[60px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-text-secondary block mb-1">Primary CTA Button</label>
                <input
                  type="text"
                  value={section.cta_primary || ""}
                  onChange={(e) => updateSectionField(idx, "cta_primary", e.target.value)}
                  className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-text-secondary block mb-1">Secondary CTA Button</label>
                <input
                  type="text"
                  value={section.cta_secondary || ""}
                  onChange={(e) => updateSectionField(idx, "cta_secondary", e.target.value)}
                  className="w-full text-[12px] p-2 border border-border-subtle rounded-lg bg-surface-secondary text-text-primary focus:outline-none"
                />
              </div>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Spinner size={28} />
          <p className="text-[12px] text-text-tertiary">Loading landing page…</p>
        </div>
      </div>
    );
  }

  if (!blog) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="mb-4 text-[14px] text-text-tertiary">Landing page not found.</p>
        <ProjectNavLink
          href={`/projects/${projectId}/content-generator/landing-pages`}
          className="text-[14px] font-medium underline underline-offset-2 text-brand-action"
        >
          ← Back to Landing pages
        </ProjectNavLink>
      </div>
    );
  }

  const breadcrumb = (
    <div className="shrink-0 space-y-2">
      <StudioBreadcrumb
        parentHref={`${studioBase}/landing-pages`}
        parentLabel="Landing pages"
        current={blog.title}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <PageTitle>Landing page</PageTitle>
          <p className="mt-2 text-[13px] leading-relaxed text-text-tertiary">
            Brand-styled, SEO landing page with real conversion copy. Preview below, then schedule or publish.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ContentTypeBadge type="Landing Page" />
        {blog.target_keyword ? (
          <MetricPill label="primary keyword" value={blog.target_keyword} />
        ) : null}
        {data.page_type ? (
          <MetricPill label="page type" value={data.page_type} />
        ) : null}
        {data.sections?.length ? (
          <MetricPill label="sections" value={data.sections.length} />
        ) : null}
      </div>
    </div>
  );


  const sidebar = (
    <>
      {/* Meta */}
      <div className="px-4 pt-4 pb-3 border-b border-border-subtle">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1" style={{ fontFamily: "CohereMono, monospace" }}>
          Page title
        </p>
        <p className="text-[14px] font-semibold text-text-primary leading-snug">{blog.title}</p>
        {data.meta_description && (
          <p className="mt-2 text-[11px] text-text-tertiary leading-relaxed">{data.meta_description}</p>
        )}
      </div>

      {/* Section list */}
      {data.sections?.length ? (
        <div className="border-b border-border-subtle px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-2" style={{ fontFamily: "CohereMono, monospace" }}>
            Sections ({data.sections.length})
          </p>
          <ol className="space-y-1.5">
            {data.sections.map((s, i) => (
              <li key={i} className="flex gap-2 text-[12px] text-text-secondary">
                <span className="font-mono text-[10px] tabular-nums text-text-tertiary shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="capitalize leading-snug">{s.type.replace(/-/g, " ")}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {/* Brand palette */}
      {project?.brand_primary_color && (
        <div className="border-b border-border-subtle px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-2" style={{ fontFamily: "CohereMono, monospace" }}>
            Brand colours
          </p>
          <div className="flex gap-2">
            {[project.brand_primary_color, project.brand_secondary_color, project.brand_accent_color].filter(Boolean).map((c, i) => (
              <span
                key={i}
                className="h-5 w-5 rounded-full border border-white/20 shadow-sm"
                style={{ background: c! }}
                title={c!}
              />
            ))}
          </div>
        </div>
      )}

      {/* Scheduling */}
      <div className="border-b border-border-subtle px-4 py-4">
        <PreviewerScheduler
          projectId={projectId}
          blogId={blog.id}
          entryId={blog.entry_id}
          onScheduleUpdated={(newId) => {
            setBlog(prev => (prev ? { ...prev, entry_id: newId } : prev));
            void queryClient.invalidateQueries({ queryKey: qk.blog(blog.id) });
          }}
        />
      </div>

      {/* Export & Integration */}
      <div className="px-4 py-4 space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-2 font-mono">
          Export & Integration
        </p>

        {/* Format Select */}
        <div>
          <label className="text-[10px] text-text-secondary font-medium block mb-1">Format</label>
          <div className="flex rounded-lg border border-border-subtle p-0.5 bg-surface-secondary">
            <button
              onClick={() => setExportFormat("html")}
              className={`flex-1 py-1 px-2 text-[11px] font-semibold rounded-md transition-all ${
                exportFormat === "html"
                  ? "bg-brand-action/10 text-brand-action font-bold"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              HTML
            </button>
            <button
              onClick={() => setExportFormat("react")}
              className={`flex-1 py-1 px-2 text-[11px] font-semibold rounded-md transition-all ${
                exportFormat === "react"
                  ? "bg-brand-action/10 text-brand-action font-bold"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              React
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleDownloadFile}
            className="flex-1 py-1.5 px-3 rounded-md bg-brand-action text-white text-[11px] font-bold hover:bg-brand-action/90 active:scale-[0.98] transition-all text-center"
          >
            Download
          </button>
          <button
            onClick={handleCopyCode}
            className="flex-1 py-1.5 px-3 rounded-md border border-border-subtle bg-surface-secondary text-text-primary text-[11px] font-bold hover:bg-surface-hover active:scale-[0.98] transition-all text-center"
          >
            Copy Code
          </button>
        </div>

        {/* Integration guides */}
        <div className="text-[10.5px] leading-relaxed text-text-tertiary bg-surface-secondary/40 p-2.5 rounded-lg border border-border-subtle/50 space-y-2">
          <p className="font-bold text-text-secondary">Integration Guide:</p>
          {exportFormat === "html" ? (
            <ul className="list-disc pl-3.5 space-y-1">
              <li>Upload as <code>index.html</code> to your server.</li>
              <li>Or embed via an <code>&lt;iframe&gt;</code> element.</li>
              <li>Drop directly into static builders like WordPress.</li>
            </ul>
          ) : (
            <ul className="list-disc pl-3.5 space-y-1">
              <li>Create a React component file and paste the code.</li>
              <li>Make sure Tailwind is configured in your project.</li>
              <li>Adapt routing/links to map your React frameworks.</li>
            </ul>
          )}
        </div>
      </div>
    </>
  );

  const toolbarLeft = (
    <div className="flex items-center gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary px-2 py-0.5 rounded border border-border-subtle bg-surface-secondary">
        Landing Page
      </span>
      <div className="flex rounded-md border border-border-subtle p-0.5 bg-surface-secondary">
        <button
          onClick={() => setActiveTab("preview")}
          className={`py-1 px-3 text-[11px] font-semibold rounded-md transition-all ${
            activeTab === "preview"
              ? "bg-brand-action text-white font-bold"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Preview
        </button>
        <button
          onClick={() => setActiveTab("editor")}
          className={`py-1 px-3 text-[11px] font-semibold rounded-md transition-all ${
            activeTab === "editor"
              ? "bg-brand-action text-white font-bold"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Editor
        </button>
      </div>
    </div>
  );

  const toolbarRight = (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        shape="pill"
        size="sm"
        onClick={() => setExportModalOpen(true)}
      >
        Export Page
      </Button>
      {!blog.entry_id && (
        <Button
          variant="primary"
          shape="pill"
          size="sm"
          onClick={() => void handleDirectSchedule()}
          loading={scheduling}
        >
          Schedule
        </Button>
      )}
    </div>
  );

  return (
    <>
      <PreviewShell
        header={breadcrumb}
        toolbarLeft={toolbarLeft}
        toolbarRight={toolbarRight}
        sidebar={sidebar}
        sidebarWidthPx={300}
        framedCanvas={false}
        toolbarInsideCanvas
        immersiveFullscreen
      >
        <div className="p-6 overflow-auto h-full">
          {activeTab === "preview" ? (
            <LandingPagePreview
              data={data}
              project={project}
              className="mx-auto max-w-5xl"
              onGenerateImage={handleGenerateImage}
              generatingImageIndex={generatingImageIndex}
            />
          ) : (
            <div className="mx-auto max-w-4xl bg-surface-primary border border-border-subtle rounded-xl p-6 shadow-md space-y-6">
              <div className="flex items-center justify-between border-b border-border-subtle pb-4">
                <div>
                  <h3 className="text-[16px] font-bold text-text-primary">Landing Page Editor</h3>
                  <p className="text-[12px] text-text-tertiary">Manually adjust sections copy or rewrite them instantly with Claude AI.</p>
                </div>
                <Button
                  variant="primary"
                  shape="pill"
                  size="sm"
                  onClick={handleSaveAllManualChanges}
                  loading={savingManualChanges}
                >
                  Save All Changes
                </Button>
              </div>

              <div className="space-y-4">
                {editableSections.map((section, idx) => {
                  const isExpanded = expandedSectionIndex === idx;
                  return (
                    <div
                      key={idx}
                      className="border border-border-subtle rounded-xl bg-surface-secondary/40 overflow-hidden transition-all"
                    >
                      {/* Section Accordion Header */}
                      <button
                        type="button"
                        onClick={() => setExpandedSectionIndex(isExpanded ? null : idx)}
                        className="w-full px-5 py-4 flex items-center justify-between hover:bg-surface-secondary/80 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-action/10 text-brand-action font-mono text-[11px] font-bold">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="text-[14px] font-bold text-text-primary capitalize">
                              {section.type.replace(/-/g, " ")} Section
                            </span>
                            <span className="ml-2 text-[10px] text-text-tertiary font-mono">
                              ({Object.keys(section).filter(k => k !== 'type' && k !== 'items' && k !== 'steps').length} fields)
                            </span>
                          </div>
                        </div>
                        <span className="text-text-secondary text-[12px]">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </button>

                      {/* Section Body */}
                      {isExpanded && (
                        <div className="p-5 border-t border-border-subtle bg-surface-primary space-y-6">
                          
                          {/* Manual Form Editor */}
                          <div className="space-y-4">
                            <h4 className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">Manual Copy Settings</h4>
                            <div className="grid grid-cols-1 gap-4">
                              {renderManualSectionFields(section, idx)}
                            </div>
                          </div>

                          {/* AI Edit block */}
                          <div className="pt-5 border-t border-border-subtle/60 space-y-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-base">✨</span>
                              <h4 className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">Rewrite Section with Claude AI</h4>
                            </div>
                            <p className="text-[11px] text-text-tertiary">
                              Describe how you'd like Claude to change this section. Deducts 1 AI credit.
                            </p>
                            <div className="flex gap-2">
                              <textarea
                                value={aiPrompts[idx] || ""}
                                onChange={(e) => setAiPrompts(prev => ({ ...prev, [idx]: e.target.value }))}
                                placeholder="E.g., rewrite this to sound more benefit-driven and focus on startups..."
                                className="flex-1 min-h-[64px] text-[12px] p-2.5 rounded-lg border border-border-subtle bg-surface-secondary text-text-primary focus:outline-none focus:border-brand-action resize-none"
                              />
                              <Button
                                variant="secondary"
                                shape="pill"
                                size="sm"
                                className="self-end"
                                onClick={() => handleAiRewrite(idx)}
                                loading={aiRewritingIndex === idx}
                                disabled={!aiPrompts[idx]?.trim()}
                              >
                                Wand Rewrite
                              </Button>
                            </div>
                          </div>

                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </PreviewShell>

      <Dialog
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        size="xl"
        title="Export Landing Page"
        description="Choose a format to deploy this landing page to your website. Fully responsive and pre-styled with brand colors."
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[500px]">
          {/* Format selection and guide */}
          <div className="lg:col-span-5 flex flex-col justify-between h-full overflow-y-auto pr-2 space-y-5">
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider block mb-2 font-mono">
                  Export Format
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setExportFormat("html")}
                    className={`flex-1 py-3 px-4 rounded-xl border text-[13px] font-bold text-center transition-all ${
                      exportFormat === "html"
                        ? "border-brand-action bg-brand-action/10 text-brand-action"
                        : "border-border-subtle bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    }`}
                  >
                    Standalone HTML / CSS
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportFormat("react")}
                    className={`flex-1 py-3 px-4 rounded-xl border text-[13px] font-bold text-center transition-all ${
                      exportFormat === "react"
                        ? "border-brand-action bg-brand-action/10 text-brand-action"
                        : "border-border-subtle bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    }`}
                  >
                    React + Tailwind
                  </button>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-[11px] font-bold text-text-primary uppercase tracking-wide font-mono">
                  Ways to use on your website
                </h4>
                {exportFormat === "html" ? (
                  <ul className="text-[11.5px] text-text-secondary space-y-2.5 list-disc pl-4 leading-relaxed">
                    <li>
                      <strong>Upload to your server:</strong> Save as <code>index.html</code> inside a folder (e.g. <code>/landing-page/</code>) on your web server or hosting platform.
                    </li>
                    <li>
                      <strong>Use an iframe:</strong> Host the page independently, then embed it inside your main website using an <code>&lt;iframe&gt;</code> element.
                    </li>
                    <li>
                      <strong>Static site builders:</strong> Drop it into platforms like Webflow, Framer, WordPress (via HTML blocks), or Shopify.
                    </li>
                  </ul>
                ) : (
                  <ul className="text-[11.5px] text-text-secondary space-y-2.5 list-disc pl-4 leading-relaxed">
                    <li>
                      <strong>Next.js / Remix / React:</strong> Create a new file <code>LandingPage.tsx</code> in your components folder and paste this code directly.
                    </li>
                    <li>
                      <strong>Tailwind CSS required:</strong> Make sure Tailwind is installed and configured in your React project, as this component relies on standard utility classes.
                    </li>
                    <li>
                      <strong>Customizable:</strong> Edit the text copy, colors, or section order directly in React code to match your bespoke app routing requirements.
                    </li>
                  </ul>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t border-border-subtle">
              <Button variant="primary" shape="pill" className="flex-1" onClick={handleDownloadFile}>
                Download File
              </Button>
              <Button variant="secondary" shape="pill" className="flex-1" onClick={handleCopyCode}>
                Copy Code
              </Button>
            </div>
          </div>

          {/* Code preview block */}
          <div className="lg:col-span-7 flex flex-col h-full bg-slate-950 dark:bg-black rounded-card border border-border-subtle overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-slate-900/60">
              <span className="text-[10px] font-mono text-white/50 uppercase tracking-widest">
                {exportFormat === "html" ? "index.html" : "LandingPage.tsx"}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="text-[11px] font-semibold text-white/70 hover:text-white transition-colors"
              >
                Copy
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-[11px] font-mono text-slate-300 leading-relaxed select-text">
              <code>{exportedCode}</code>
            </pre>
          </div>
        </div>
      </Dialog>
    </>
  );
}
