export interface AdminProjectRow {
  id: string;
  name: string;
  domain: string;
  niche: string;
  targetRegion: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  keywordCount: number;
  competitorCount: number;
  contentCount: number;
  calendarCount: number;
  avgHealthScore: number | null;
  auditsRun: number;
}

export interface AdminProjectsListResult {
  items: AdminProjectRow[];
  total: number;
  page: number;
  pageSize: number;
}
