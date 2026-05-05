import { currentUser } from "@clerk/nextjs/server";
import { deleteProject, getProject, updateProject } from "@/app/actions/project-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated", data: null }, { status: 401 });
  const { projectId } = await params;
  const result = await getProject(projectId);
  return apiJson(result, { status: result.success ? 200 : result.error === "Project not found" ? 404 : 500 });
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId } = await params;
  let body: Parameters<typeof updateProject>[1];
  try {
    body = (await req.json()) as Parameters<typeof updateProject>[1];
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const result = await updateProject(projectId, body);
  return apiJson(result, { status: result.success ? 200 : 404 });
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId } = await params;
  const result = await deleteProject(projectId);
  return apiJson(result, { status: result.success ? 200 : 500 });
}
