"use client";

import { PageHeader } from "@/components/common";
import { HistoryTab } from "./HistoryTab";
import { motion } from "framer-motion";

const pageAnim = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const } };

export default function UnifiedContentHistoryPage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Content History"
        description="Track all generated content assets — blogs, ebooks, whitepapers, and social posts."
        actions={null}
      />

      <motion.div {...pageAnim} className="flex-1 min-h-0 mt-6">
        <HistoryTab />
      </motion.div>
    </div>
  );
}
