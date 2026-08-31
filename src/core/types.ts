export type UserRole = "owner" | "admin" | "editor" | "author" | "viewer" | "ai_agent";
export type EditorialWorkflowState = "draft" | "in_review" | "changes_requested" | "approved";
export type ContentLocale = "en" | "ja" | "zh";

export type SessionUser = {
  id: number;
  sessionId: number;
  email: string;
  displayName: string;
  roles: UserRole[];
  csrfToken: string;
};

export type PostRecord = {
  id: number;
  locale: ContentLocale;
  translationGroup: string;
  title: string;
  slug: string;
  excerpt: string | null;
  bodyMd: string | null;
  bodyHtml: string;
  status: "draft" | "published" | "scheduled";
  seoTitle: string | null;
  seoDescription: string | null;
  seoCanonicalUrl: string | null;
  seoOgImage: string | null;
  seoKeywords: string | null;
  seoNoindex: boolean;
  seoNofollow: boolean;
  publishedAt: string | null;
  updatedAt: string;
  authorId: number | null;
  authorName: string | null;
  categories: string[];
  categoryStylesheets: string[];
  tags: string[];
  commentsPolicy: "inherit" | "enabled" | "disabled";
  commentsEnabled: boolean;
  workflowState: EditorialWorkflowState;
  workflowContentHash: string | null;
  workflowNote: string | null;
  reviewRequestedAt: string | null;
  reviewRequestedBy: number | null;
  reviewedAt: string | null;
  reviewedBy: number | null;
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
  seoCanonicalUrl?: string;
  seoOgImage?: string;
  seoKeywords?: string;
  seoNoindex?: boolean;
  seoNofollow?: boolean;
  publishedAt?: string | null;
  categorySlugs?: string[];
  tagSlugs?: string[];
  seriesId?: number | null;
  locale?: ContentLocale;
  translationGroup?: string;
};

export type PageRecord = {
  id: number;
  locale: ContentLocale;
  translationGroup: string;
  title: string;
  slug: string;
  excerpt: string | null;
  bodyMd: string | null;
  bodyHtml: string;
  status: "draft" | "published" | "scheduled";
  seoTitle: string | null;
  seoDescription: string | null;
  seoCanonicalUrl: string | null;
  seoOgImage: string | null;
  seoKeywords: string | null;
  seoNoindex: boolean;
  seoNofollow: boolean;
  publishedAt: string | null;
  updatedAt: string;
  authorId: number | null;
  authorName: string | null;
  stylesheetPath: string | null;
  workflowState: EditorialWorkflowState;
  workflowContentHash: string | null;
  workflowNote: string | null;
  reviewRequestedAt: string | null;
  reviewRequestedBy: number | null;
  reviewedAt: string | null;
  reviewedBy: number | null;
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
  seoCanonicalUrl?: string;
  seoOgImage?: string;
  seoKeywords?: string;
  seoNoindex?: boolean;
  seoNofollow?: boolean;
  publishedAt?: string | null;
  pageGroupId?: number | null;
  stylesheetPath?: string | null;
  locale?: ContentLocale;
  translationGroup?: string;
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
