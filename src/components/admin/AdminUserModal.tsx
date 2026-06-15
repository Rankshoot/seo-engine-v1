"use client";

import { useEffect, useState, useTransition } from "react";
import { Dialog } from "@/components/common/dialogs/Dialog";
import { toast } from "react-hot-toast";
import {
  getAdminUserQuotaStatus,
  updateAdminUserQuota,
  getAdminUserCostAndUsage,
} from "@/app/actions/admin-users-actions";
import { getSubscriptionPlans } from "@/app/actions/admin-plans-actions";
import { formatAdminUsd, formatAdminInt, formatAdminDate } from "@/lib/admin/format";
import { cn } from "@/lib/cn";
import { Calendar, DollarSign, Activity, Shield, Zap } from "lucide-react";

interface AdminUserModalProps {
  open: boolean;
  userId: string | null;
  onClose: () => void;
  onSaveSuccess?: () => void;
  userEmail?: string | null;
  userDisplayName?: string | null;
}

interface PlanOption {
  id: string;
  name: string;
}

interface QuotaState {
  planId: string;
  subscriptionStatus: string;
  override_projects: string;
  override_keywords_fetched: string;
  override_keywords_explored: string;
  // Granular per-content-type overrides
  override_blogs: string;
  override_ebooks: string;
  override_whitepapers: string;
  override_linkedin: string;
  // Legacy (kept for backwards compat)
  override_standard_content: string;
  override_premium_content: string;
  override_ai_credits: string;
}

interface CostingSummary {
  totalAiCost: number;
  totalApiCost: number;
  totalCost: number;
  aiCount: number;
  apiCount: number;
  chartData: { date: string; aiCost: number; apiCost: number; aiCalls: number; apiCalls: number }[];
}

function getPresetDates(preset: string): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  if (preset === "7d") {
    start.setDate(end.getDate() - 7);
  } else if (preset === "90d") {
    start.setDate(end.getDate() - 90);
  } else if (preset === "month") {
    start.setDate(1); // 1st of this month
  } else if (preset === "all") {
    start.setFullYear(2025, 0, 1);
  } else {
    // 30d
    start.setDate(end.getDate() - 30);
  }
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function AdminUserModal({
  open,
  userId,
  onClose,
  onSaveSuccess,
  userEmail,
  userDisplayName,
}: AdminUserModalProps) {
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [quotaStatus, setQuotaStatus] = useState<any>(null);
  const [costing, setCosting] = useState<CostingSummary | null>(null);

  // Form states
  const [form, setForm] = useState<QuotaState>({
    planId: "free",
    subscriptionStatus: "inactive",
    override_projects: "",
    override_keywords_fetched: "",
    override_keywords_explored: "",
    override_blogs: "",
    override_ebooks: "",
    override_whitepapers: "",
    override_linkedin: "",
    override_standard_content: "",
    override_premium_content: "",
    override_ai_credits: "",
  });

  // Date filters
  const [datePreset, setDatePreset] = useState<string>("30d");
  const [customDates, setCustomDates] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isCostLoading, setIsCostLoading] = useState(false);
  const [isSaving, startSaveTransition] = useTransition();

  // 1. Initial Load of Plans & Quota Status
  useEffect(() => {
    if (!open || !userId) return;

    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        const [plansList, userQuota] = await Promise.all([
          getSubscriptionPlans(),
          getAdminUserQuotaStatus(userId),
        ]);

        setPlans(plansList || []);
        setQuotaStatus(userQuota);

        // Map user details to form inputs
        setForm({
          planId: userQuota.planId,
          subscriptionStatus: userQuota.subscriptionStatus,
          override_projects: userQuota.projects.override !== null ? String(userQuota.projects.override) : "",
          override_keywords_fetched:
            userQuota.keywords_fetched.override !== null ? String(userQuota.keywords_fetched.override) : "",
          override_keywords_explored:
            userQuota.keywords_explored.override !== null ? String(userQuota.keywords_explored.override) : "",
          override_blogs:
            userQuota.blogs?.override !== null && userQuota.blogs?.override !== undefined ? String(userQuota.blogs.override) : "",
          override_ebooks:
            userQuota.ebooks?.override !== null && userQuota.ebooks?.override !== undefined ? String(userQuota.ebooks.override) : "",
          override_whitepapers:
            userQuota.whitepapers?.override !== null && userQuota.whitepapers?.override !== undefined ? String(userQuota.whitepapers.override) : "",
          override_linkedin:
            userQuota.linkedin?.override !== null && userQuota.linkedin?.override !== undefined ? String(userQuota.linkedin.override) : "",
          override_standard_content:
            userQuota.standard_content?.override !== null && userQuota.standard_content?.override !== undefined ? String(userQuota.standard_content.override) : "",
          override_premium_content:
            userQuota.premium_content?.override !== null && userQuota.premium_content?.override !== undefined ? String(userQuota.premium_content.override) : "",
          override_ai_credits:
            userQuota.ai_credits.override !== null ? String(userQuota.ai_credits.override) : "",
        });

        // Initialize date preset ranges
        const dates = getPresetDates("30d");
        setCustomDates(dates);
      } catch (err: any) {
        toast.error(err.message || "Failed to load user quota settings.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadInitialData();
  }, [open, userId]);

  // 2. Costing Data Query (triggers on user/date selection change)
  useEffect(() => {
    if (!open || !userId || !customDates.start || !customDates.end) return;

    const loadCosting = async () => {
      setIsCostLoading(true);
      try {
        const costData = await getAdminUserCostAndUsage(userId, customDates.start, customDates.end);
        setCosting(costData);
      } catch (err: any) {
        toast.error(err.message || "Failed to calculate user costing.");
      } finally {
        setIsCostLoading(false);
      }
    };

    void loadCosting();
  }, [open, userId, customDates]);

  const handlePresetChange = (preset: string) => {
    setDatePreset(preset);
    if (preset !== "custom") {
      const dates = getPresetDates(preset);
      setCustomDates(dates);
    }
  };

  const handleCustomDateChange = (type: "start" | "end", val: string) => {
    setCustomDates((prev) => ({
      ...prev,
      [type]: val,
    }));
  };

  const handleSave = () => {
    if (!userId) return;

    startSaveTransition(async () => {
      try {
        const parseOverride = (val: string) => (val.trim() === "" ? null : Number(val));

        const updates = {
          planId: form.planId,
          subscriptionStatus: form.subscriptionStatus,
          override_projects: parseOverride(form.override_projects),
          override_keywords_fetched: parseOverride(form.override_keywords_fetched),
          override_keywords_explored: parseOverride(form.override_keywords_explored),
          override_blogs: parseOverride(form.override_blogs),
          override_ebooks: parseOverride(form.override_ebooks),
          override_whitepapers: parseOverride(form.override_whitepapers),
          override_linkedin: parseOverride(form.override_linkedin),
          override_standard_content: parseOverride(form.override_standard_content),
          override_premium_content: parseOverride(form.override_premium_content),
          override_ai_credits: parseOverride(form.override_ai_credits),
        };

        const res = await updateAdminUserQuota(userId, updates);
        if (res.success) {
          toast.success("User access quotas updated successfully!");
          onSaveSuccess?.();
          // Reload status to reflect effective limits correctly
          const freshStatus = await getAdminUserQuotaStatus(userId);
          setQuotaStatus(freshStatus);
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to update quotas.");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title={userDisplayName ?? userEmail ?? "User Settings"}
      description={`User ID: ${userId}`}
      footer={
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-border-subtle hover:bg-surface-hover text-text-secondary text-[13px] font-semibold rounded-[8px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="px-5 py-2 bg-brand-action hover:bg-brand-action-hover text-white text-[13px] font-semibold rounded-[8px] disabled:opacity-50 transition-all cursor-pointer"
          >
            {isSaving ? "Saving overrides..." : "Save Configuration"}
          </button>
        </div>
      }
    >
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-10 h-10 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-text-tertiary font-medium animate-pulse">Loading quota limits & logs...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-[13px]">
          
          {/* Left Grid: Limits, Tier & Settings */}
          <div className="lg:col-span-6 space-y-6">
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4 text-brand-primary" />
              Access controls
            </h3>

            {/* Plan and status dropdowns */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary">Subscription Plan</label>
                <select
                  value={form.planId}
                  onChange={(e) => setForm((prev) => ({ ...prev, planId: e.target.value }))}
                  className="h-9 rounded-md border border-border-subtle bg-surface-elevated px-3 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-action transition-all"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary">Subscription Status</label>
                <select
                  value={form.subscriptionStatus}
                  onChange={(e) => setForm((prev) => ({ ...prev, subscriptionStatus: e.target.value }))}
                  className="h-9 rounded-md border border-border-subtle bg-surface-elevated px-3 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-action transition-all"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="trialing">Trialing</option>
                  <option value="canceled">Canceled</option>
                </select>
              </div>
            </div>

            {/* Resource Limit Editor */}
            <div className="space-y-4 pt-2">
              <div className="flex justify-between border-b border-border-subtle pb-2">
                <span className="text-xs font-bold text-text-secondary uppercase">Resource Limit overrides</span>
                <span className="text-xs text-text-tertiary">Blank = plan limits</span>
              </div>

              <div className="space-y-0">
                {/* Section: Access */}
                {[
                  { key: "override_projects", label: "Projects", quotaKey: "projects", section: "Access" },
                  { key: "override_keywords_fetched", label: "Keywords Fetched", quotaKey: "keywords_fetched", section: null },
                  { key: "override_keywords_explored", label: "Keywords Explored (AI)", quotaKey: "keywords_explored", section: null },
                  { key: "override_ai_credits", label: "AI Helper Credits", quotaKey: "ai_credits", section: "AI" },
                  { key: "override_blogs", label: "Blog Articles", quotaKey: "blogs", section: "Content" },
                  { key: "override_linkedin", label: "LinkedIn Posts", quotaKey: "linkedin", section: null },
                  { key: "override_ebooks", label: "Ebooks", quotaKey: "ebooks", section: null },
                  { key: "override_whitepapers", label: "Whitepapers", quotaKey: "whitepapers", section: null },
                ].map((item, idx, arr) => {
                  const quota = quotaStatus?.[item.quotaKey];
                  if (!quota) return null;
                  const showSection = item.section !== null;
                  return (
                    <div key={item.key}>
                      {showSection && (
                        <div className={`text-[9.5px] font-bold uppercase tracking-[0.12em] text-text-tertiary pb-1 pt-3 ${idx > 0 ? "border-t border-border-subtle/40" : ""}`}>
                          {item.section}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-4 py-1.5">
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-text-primary block">{item.label}</span>
                          <span className="text-[10.5px] text-text-tertiary">
                            Plan: {formatAdminInt(quota.limit)} &middot; Used: {formatAdminInt(quota.used)} &middot; Effective: {formatAdminInt(quota.effectiveLimit)}
                          </span>
                        </div>
                        <input
                          type="number"
                          min={0}
                          placeholder={String(quota.limit)}
                          value={form[item.key as keyof QuotaState]}
                          onChange={(e) => setForm((prev) => ({ ...prev, [item.key]: e.target.value }))}
                          className="w-20 h-8 px-2 text-right rounded-md border border-border-subtle bg-surface-elevated font-mono text-xs focus:outline-none focus:ring-1 focus:ring-brand-action transition-all"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Grid: Costing, Date Filters & Usage Chart */}
          <div className="lg:col-span-6 space-y-6 lg:border-l lg:border-border-subtle lg:pl-8">
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-brand-primary" />
                Costing & Activity
              </span>
              {isCostLoading && <span className="w-3.5 h-3.5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />}
            </h3>

            {/* Date Filters Selectors */}
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "7d", label: "7D" },
                  { id: "30d", label: "30D" },
                  { id: "90d", label: "90D" },
                  { id: "month", label: "Month" },
                  { id: "all", label: "All" },
                  { id: "custom", label: "Custom" },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetChange(preset.id)}
                    className={cn(
                      "px-2.5 py-1 text-[11px] font-bold tracking-wider rounded-md border transition-all cursor-pointer",
                      datePreset === preset.id
                        ? "bg-brand-action text-white border-brand-action"
                        : "bg-surface-elevated text-text-secondary border-border-subtle hover:bg-surface-hover"
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {datePreset === "custom" && (
                <div className="grid grid-cols-2 gap-3 animate-fade-in pt-1">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold text-text-tertiary tracking-wider">Start Date</span>
                    <input
                      type="date"
                      value={customDates.start}
                      onChange={(e) => handleCustomDateChange("start", e.target.value)}
                      className="h-8 rounded-md border border-border-subtle bg-surface-elevated px-2 text-xs font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold text-text-tertiary tracking-wider">End Date</span>
                    <input
                      type="date"
                      value={customDates.end}
                      onChange={(e) => handleCustomDateChange("end", e.target.value)}
                      className="h-8 rounded-md border border-border-subtle bg-surface-elevated px-2 text-xs font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Costing Summary Grid */}
            {costing && (
              <div className="grid grid-cols-3 gap-3 bg-surface-secondary/70 border border-border-subtle rounded-[12px] p-3.5">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    Overall Cost
                  </span>
                  <span className="text-[16px] font-bold text-text-primary mt-1 font-mono">
                    {formatAdminUsd(costing.totalCost)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">AI Costs</span>
                  <span className="text-[13px] font-semibold text-text-secondary mt-1 font-mono">
                    {formatAdminUsd(costing.totalAiCost)}
                  </span>
                  <span className="text-[10px] text-text-tertiary mt-0.5">{costing.aiCount} requests</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">SEO API Costs</span>
                  <span className="text-[13px] font-semibold text-text-secondary mt-1 font-mono">
                    {formatAdminUsd(costing.totalApiCost)}
                  </span>
                  <span className="text-[10px] text-text-tertiary mt-0.5">{costing.apiCount} calls</span>
                </div>
              </div>
            )}

            {/* Daily Usage Chart */}
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-text-secondary uppercase">Usage over Time</span>
                <span className="text-[10px] text-text-tertiary font-mono">
                  {customDates.start} to {customDates.end}
                </span>
              </div>
              {costing ? (
                <UsageChart data={costing.chartData} />
              ) : (
                <div className="h-48 flex items-center justify-center text-text-tertiary text-xs border border-dashed border-border-subtle rounded-lg bg-surface-secondary">
                  Calculating activity log statistics...
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function UsageChart({
  data,
}: {
  data: { date: string; aiCost: number; apiCost: number; aiCalls: number; apiCalls: number }[];
}) {
  if (!data || data.length === 0) {
    return (
      <div className="h-44 flex items-center justify-center text-text-tertiary text-xs border border-dashed border-border-subtle rounded-lg bg-surface-secondary">
        No usage logs recorded in this period.
      </div>
    );
  }

  // Calculate maximum values for Y-axis scaling
  const maxCalls = Math.max(...data.map((d) => d.aiCalls + d.apiCalls), 8);
  const maxCost = Math.max(...data.map((d) => d.aiCost + d.apiCost), 0.05);

  const height = 150;
  const paddingBottom = 20;
  const paddingTop = 10;
  const paddingLeft = 10;
  const paddingRight = 10;
  const chartHeight = height - paddingTop - paddingBottom;
  const width = 500;

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex justify-between items-center text-[10px] text-text-tertiary">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-brand-violet" /> AI Helper calls</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-brand-primary" /> SEO API calls</span>
        </div>
        <span className="font-semibold font-mono">Max Daily: {maxCalls} calls</span>
      </div>
      
      <div className="relative w-full h-[150px] bg-surface-elevated border border-border-subtle rounded-[12px] p-2 overflow-hidden shadow-inner">
        <svg className="w-full h-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          {/* Y Axis Gridlines */}
          {[0, 0.5, 1].map((ratio, idx) => {
            const y = paddingTop + chartHeight * (1 - ratio);
            return (
              <line
                key={idx}
                x1={paddingLeft}
                y1={y}
                x2={width - paddingRight}
                y2={y}
                stroke="var(--color-border-subtle)"
                strokeWidth={0.5}
                strokeDasharray="2 4"
              />
            );
          })}

          {/* Render Stacked Bars */}
          {data.map((d, idx) => {
            const n = data.length;
            const availableWidth = width - paddingLeft - paddingRight;
            const barWidth = Math.max(3, (availableWidth / n) * 0.75);
            const gap = (availableWidth / n) * 0.25;
            const x = paddingLeft + idx * (barWidth + gap);

            const totalCalls = d.aiCalls + d.apiCalls;
            const barHeight = totalCalls > 0 ? (totalCalls / maxCalls) * chartHeight : 0;
            const y = paddingTop + chartHeight - barHeight;

            const aiHeight = totalCalls > 0 ? (d.aiCalls / totalCalls) * barHeight : 0;
            const apiHeight = totalCalls > 0 ? (d.apiCalls / totalCalls) * barHeight : 0;

            const tooltipText = `${d.date}\nAI Helper: ${d.aiCalls} calls ($${d.aiCost.toFixed(4)})\nSEO API: ${d.apiCalls} calls ($${d.apiCost.toFixed(4)})\nCost: $${(d.aiCost + d.apiCost).toFixed(4)}`;

            return (
              <g key={idx} className="group cursor-pointer">
                <title>{tooltipText}</title>
                {/* API Calls (Bottom portion of stacked bar) */}
                {apiHeight > 0 && (
                  <rect
                    x={x}
                    y={y + aiHeight}
                    width={barWidth}
                    height={apiHeight}
                    fill="var(--color-brand-primary)"
                    className="opacity-80 hover:opacity-100 transition-opacity"
                    rx={1.5}
                  />
                )}
                {/* AI Calls (Top portion of stacked bar) */}
                {aiHeight > 0 && (
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={aiHeight}
                    fill="var(--color-brand-violet)"
                    className="opacity-80 hover:opacity-100 transition-opacity"
                    rx={1.5}
                  />
                )}
                
                {/* Wide invisible rectangle overlay for tooltip trigger hover targeting */}
                <rect
                  x={x - gap / 2}
                  y={paddingTop}
                  width={barWidth + gap}
                  height={chartHeight}
                  fill="transparent"
                  className="hover:fill-text-primary/5 transition-colors"
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex justify-between text-[9px] text-text-tertiary px-1 font-mono">
        <span>{data[0]?.date}</span>
        <span>{data[Math.floor(data.length / 2)]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}
