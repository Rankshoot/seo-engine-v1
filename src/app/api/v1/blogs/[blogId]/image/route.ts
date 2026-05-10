import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateContextualBlogImage } from "@/services/stabilityImages";

export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ blogId: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Not authenticated", { status: 401 });

  const { blogId } = await params;

  let body: { imageAlt: string; contextBefore: string; contextAfter: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { data: blog, error: blogErr } = await supabaseAdmin
    .from("blogs")
    .select("*, projects(niche, target_audience, company)")
    .eq("id", blogId)
    .single();

  if (blogErr || !blog) {
    return new Response("Blog not found", { status: 404 });
  }

  const project = blog.projects as { niche: string; target_audience: string; company: string };

  try {
    const image = await generateContextualBlogImage({
      title: blog.title,
      targetKeyword: blog.target_keyword,
      articleType: blog.article_type,
      niche: project.niche,
      audience: project.target_audience,
      company: project.company,
      imageAlt: body.imageAlt,
      contextBefore: body.contextBefore,
      contextAfter: body.contextAfter,
    });

    if (!image) {
      return new Response(JSON.stringify({ success: false, error: "Image generation failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, data: image }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Image generation failed";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
