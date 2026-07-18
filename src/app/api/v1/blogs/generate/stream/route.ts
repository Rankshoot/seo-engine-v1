import { currentUser } from "@clerk/nextjs/server";
import { runBlogGeneration, type BlogGenerationParams } from "@/lib/blog-generation/generate-blog";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * SSE streaming endpoint for blog generation with real Claude thinking tokens.
 * Thin wrapper over the shared `runBlogGeneration` core (also used by the
 * durable `blog_generate` background job) — this route just forwards progress
 * as SSE events and translates the resolved id / thrown error into done/error.
 *
 * Event types:
 *   { event: "stage",        stage: string, detail?: string }
 *   { event: "thinking",     chunk: string }
 *   { event: "thinking_done"              }
 *   { event: "done",         blogId: string }
 *   { event: "error",        message: string }
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return new Response(
      `data: ${JSON.stringify({ event: "error", message: "Not authenticated" })}\n\n`,
      { status: 401, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const body = (await req.json()) as Omit<BlogGenerationParams, "userId">;

  if (!body.entryId && (!body.projectId || !body.keyword)) {
    return new Response(
      `data: ${JSON.stringify({ event: "error", message: "Expected entryId OR { projectId, keyword }" })}\n\n`,
      { status: 400, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (payload: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      try {
        const { blogId } = await runBlogGeneration(
          { ...body, userId: user.id },
          { onProgress: emit, signal: req.signal },
        );
        emit({ event: "done", blogId });
      } catch (err) {
        emit({ event: "error", message: err instanceof Error ? err.message : "Generation failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
