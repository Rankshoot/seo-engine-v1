import type { Metadata } from "next";
import { BlogChrome } from "@/app/_components/BlogChrome";

export const metadata: Metadata = {
  title: {
    template: "%s | Rankshoot",
    default: "Blog | Rankshoot",
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <BlogChrome>{children}</BlogChrome>;
}
