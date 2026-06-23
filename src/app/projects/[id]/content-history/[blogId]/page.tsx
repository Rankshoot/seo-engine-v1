// Re-export the blog viewer so /content-history/[blogId] renders the same
// content as /content-generator/blogs/[blogId].
// Both routes share the same parent [id] layout and dynamic params.
export { default } from "../../content-generator/blogs/[blogId]/page";
