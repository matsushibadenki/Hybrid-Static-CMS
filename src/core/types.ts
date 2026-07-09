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
  seoNoindex: boolean;
  seoNofollow: boolean;
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
  seoNoindex?: boolean;
  seoNofollow?: boolean;
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
  seoNoindex: boolean;
  seoNofollow: boolean;
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
  seoNoindex?: boolean;
  seoNofollow?: boolean;
  publishedAt?: string | null;
};

export type FormFieldType = "text" | "email" | "textarea" | "select" | "checkbox";

export type FormFieldRecord = {
  id: number;
  formId: number;
  name: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options: string[];
  sortOrder: number;
};

export type FormRecord = {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  status: "draft" | "published";
  submitLabel: string;
  successMessage: string;
  createdAt: string;
  updatedAt: string;
  authorId: number | null;
  authorName: string | null;
  fields: FormFieldRecord[];
};

export type FormInput = {
  title: string;
  slug: string;
  description?: string;
  status: "draft" | "published";
  submitLabel?: string;
  successMessage?: string;
  fields: Array<{
    name: string;
    label: string;
    type: FormFieldType;
    required?: boolean;
    options?: string[];
  }>;
};
