import { currentUser } from '@clerk/nextjs/server';
import { testProjectStrapiConnection } from '@/app/actions/strapi-actions';
import { apiJson } from '@/server/http/json';

export const runtime = 'nodejs';

type Params = { params: Promise<{ projectId: string }> };

/** POST — test the Strapi connection using the saved credentials (token never returned to client) */
export async function POST(_req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: 'Not authenticated' }, { status: 401 });
  const { projectId } = await params;
  const result = await testProjectStrapiConnection(projectId);
  return apiJson(result, { status: 200 });
}
