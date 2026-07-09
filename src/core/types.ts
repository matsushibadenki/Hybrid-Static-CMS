export type UserRole = "owner" | "admin" | "editor" | "author" | "viewer" | "ai_agent";

export type SessionUser = {
  id: number;
  email: string;
  displayName: string;
  roles: UserRole[];
};

export type PostRecord = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  bodyMd: string | null;
  bodyHtml: string;
  status: "draft" | "published" | "scheduled";
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  updatedAt: string;
  authorId: number | null;
  authorName: string | null;
  categories: string[];
  tags: string[];
};

export type PostInput = {
  title: string;
  slug: string;
  excerpt?: string;
  bodyMd?: string;
  bodyHtml?: string;
  status: "draft" | "published" | "scheduled";
  seoTitle?: string;
  seoDescription?: string;
  publishedAt?: string | null;
  categorySlugs?: string[];
  tagSlugs?: string[];
};

export type PageRecord = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  bodyMd: string | null;
  bodyHtml: string;
  status: "draft" | "published" | "scheduled";
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  updatedAt: string;
  authorId: number | null;
  authorName: string | null;
};

export type PageInput = {
  title: string;
  slug: string;
  excerpt?: string;
  bodyMd?: string;
  bodyHtml?: string;
  status: "draft" | "published" | "scheduled";
  seoTitle?: string;
  seoDescription?: string;
  publishedAt?: string | null;
};
