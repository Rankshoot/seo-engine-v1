import { currentUser } from "@clerk/nextjs/server";
import { createProject, getProjects } from "@/app/actions/project-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const result = await getProjects();
  return apiJson(result, { status: result.success ? 200 : 500 });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  let body: Parameters<typeof createProject>[0];
  try {
    body = (await req.json()) as Parameters<typeof createProject>[0];
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const result = await createProject(body);
  return apiJson(result, { status: result.success ? 201 : 400 });
}
