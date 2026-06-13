import { currentUser } from "@clerk/nextjs/server";
import { resolveBlogEditorLinkAlternates, rewriteBlogEditorSelection } from "@/app/actions/blog-actions";
import { isDisallowedRewriteUrl } from "@/lib/blog-editor-rewrite-selection";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ blogId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { blogId } = await params;
  try {
    const body = (await req.json()) as {
      intent?: string;
      selectedText?: string;
      instruction?: string;
      plainText?: string;
      htmlFragment?: string;
      links?: Array<{ id?: string; anchorText?: string; href?: string; type?: string }>;
      prefValidatedInternalUrl?: string;
      prefValidatedReplacementUrl?: string;
      prefValidatedReplacements?: Array<{ linkId?: string; newHref?: string }>;
      contentType?: string;
      contentPart?: string;
      surroundingContext?: string;
    };
    const selectedText = typeof body.selectedText === "string" ? body.selectedText : "";
    const instruction = typeof body.instruction === "string" ? body.instruction : "";
    const plainText = typeof body.plainText === "string" ? body.plainText : "";
    const htmlFragment = typeof body.htmlFragment === "string" ? body.htmlFragment : "";
    const prefValidatedInternalUrl =
      typeof body.prefValidatedInternalUrl === "string" ? body.prefValidatedInternalUrl.trim() : "";
    const prefValidatedReplacementUrl =
      typeof body.prefValidatedReplacementUrl === "string"
        ? body.prefValidatedReplacementUrl.trim()
        : "";
    const links = Array.isArray(body.links)
      ? body.links
          .map((l) => {
            if (!l || typeof l.href !== "string") return null;
            const href = l.href.trim();
            const anchorText = typeof l.anchorText === "string" ? l.anchorText.trim() : "";
            if (!href || isDisallowedRewriteUrl(href)) return null;
            const out: {
              anchorText: string;
              href: string;
              id?: string;
              type?: "internal" | "external";
            } = { anchorText, href };
            if (typeof l.id === "string" && l.id.trim()) out.id = l.id.trim();
            if (l.type === "internal" || l.type === "external") out.type = l.type;
            return out;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
      : undefined;

    const prefValidatedReplacements = Array.isArray(body.prefValidatedReplacements)
      ? body.prefValidatedReplacements
          .map((p) => {
            if (!p || typeof p.linkId !== "string" || typeof p.newHref !== "string") return null;
            const linkId = p.linkId.trim();
            const newHref = p.newHref.trim();
            if (!linkId || !newHref || isDisallowedRewriteUrl(newHref)) return null;
            return { linkId, newHref };
          })
          .filter((x): x is { linkId: string; newHref: string } => x !== null)
      : undefined;

    const meta = {
      plainText: plainText || undefined,
      htmlFragment: htmlFragment || undefined,
      links: links?.length ? links : undefined,
      prefValidatedInternalUrl: prefValidatedInternalUrl || undefined,
      prefValidatedReplacementUrl: prefValidatedReplacementUrl || undefined,
      prefValidatedReplacements: prefValidatedReplacements?.length
        ? prefValidatedReplacements
        : undefined,
      contentType: typeof body.contentType === "string" ? body.contentType : undefined,
      contentPart: typeof body.contentPart === "string" ? body.contentPart : undefined,
      surroundingContext: typeof body.surroundingContext === "string" ? body.surroundingContext : undefined,
    };

    if (body.intent === "resolve_link") {
      const result = await resolveBlogEditorLinkAlternates(
        blogId,
        selectedText,
        meta,
        instruction.trim() || "find a relevant replacement link"
      );
      return apiJson(result, { status: result.success ? 200 : 400 });
    }

    const result = await rewriteBlogEditorSelection(blogId, selectedText, instruction, meta);
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
}
