export interface AdminContentRow {
  id: string;
  projectId: string;
  projectName: string;
  projectDomain: string;
  userId: string | null;
  title: string;
  contentType: string;
  status: string;
  wordCount: number;
  targetKeyword: string;
  articleType: string;
  slug: string;
  sourceUrl: string;
  deepAnalysisScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminContentListResult {
  items: AdminContentRow[];
  total: number;
  page: number;
  pageSize: number;
}
