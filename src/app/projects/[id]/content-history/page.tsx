"use client";

import { PageHeader } from "@/components/common";
import { HistoryTab } from "./HistoryTab";
import { motion } from "framer-motion";

const pageAnim = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const } };

export default function UnifiedContentHistoryPage() {
  return (
    <div className="space-y-8 pb-16 max-w-full px-4 mx-auto">
      <PageHeader
        title="Content History"
        description="Track all generated content assets. Monitor status, details, and metrics for blogs, ebooks, whitepapers, and social posts."
      />

      <motion.div {...pageAnim} className="mt-4">
        <HistoryTab />
      </motion.div>
    </div>
  );
}
