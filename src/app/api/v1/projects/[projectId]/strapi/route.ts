import { currentUser } from '@clerk/nextjs/server';
import { saveStrapiConnection, disconnectStrapi, getStrapiConnection } from '@/app/actions/strapi-actions';
import { apiJson } from '@/server/http/json';

export const runtime = 'nodejs';

type Params = { params: Promise<{ projectId: string }> };

/** GET — return connection status (never returns the token) */
export async function GET(_req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: 'Not authenticated' }, { status: 401 });
  const { projectId } = await params;
  const result = await getStrapiConnection(projectId);
  return apiJson({ success: true, ...result }, { status: 200 });
}

/** PATCH — save Strapi base URL + API token for a project */
export async function PATCH(req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: 'Not authenticated' }, { status: 401 });
  const { projectId } = await params;

  let body: { strapiBaseUrl?: string; strapiApiToken?: string };
  try {
    body = await req.json() as { strapiBaseUrl?: string; strapiApiToken?: string };
  } catch {
    return apiJson({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.strapiBaseUrl || !body.strapiApiToken) {
    return apiJson({ success: false, error: 'strapiBaseUrl and strapiApiToken are required' }, { status: 400 });
  }

  const result = await saveStrapiConnection(projectId, {
    strapiBaseUrl: body.strapiBaseUrl,
    strapiApiToken: body.strapiApiToken,
  });
  return apiJson(result, { status: result.success ? 200 : 400 });
}

/** DELETE — remove Strapi credentials from a project */
export async function DELETE(_req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: 'Not authenticated' }, { status: 401 });
  const { projectId } = await params;
  const result = await disconnectStrapi(projectId);
  return apiJson(result, { status: result.success ? 200 : 400 });
}
