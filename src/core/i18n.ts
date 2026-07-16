export const adminTranslations = {
  ja: {
    Dashboard: "ダッシュボード", Posts: "投稿一覧", Pages: "固定ページ一覧", Forms: "フォーム", Menus: "メニュー", Blocks: "ブロック",
    "AI proposals": "AI提案", Media: "メディア", Users: "ユーザー", Logs: "監査ログ", Snapshots: "スナップショット",
    "New post": "投稿を作成", "New page": "固定ページを作成", API: "API", Logout: "ログアウト", "control panel": "コントロールパネル",
    "Signed in as": "ログイン中:", "Sign in to manage posts and generated fragments.": "ログインして投稿と生成ページを管理してください。",
    "Switch language": "言語", English: "英語", Japanese: "日本語", "Simplified Chinese": "簡体字中国語",
    Overview: "概要", Content: "コンテンツ", Manage: "管理", Create: "作成", "Site structure": "サイト構成", Operations: "運用・管理",
    Search: "検索", Save: "保存", Delete: "削除", Edit: "編集",
  },
  zh: {
    Dashboard: "仪表盘", Posts: "文章列表", Pages: "页面列表", Forms: "表单", Menus: "菜单", Blocks: "区块",
    "AI proposals": "AI提案", Media: "媒体", Users: "用户", Logs: "审计日志", Snapshots: "快照",
    "New post": "创建文章", "New page": "创建页面", API: "API", Logout: "退出登录", "control panel": "控制面板",
    "Signed in as": "当前登录:", "Sign in to manage posts and generated fragments.": "请登录以管理文章和生成页面。",
    "Switch language": "语言", English: "英语", Japanese: "日语", "Simplified Chinese": "简体中文",
    Overview: "概览", Content: "内容", Manage: "管理", Create: "创建", "Site structure": "网站结构", Operations: "运营与管理",
    Search: "搜索", Save: "保存", Delete: "删除", Edit: "编辑",
  },
} as const;

export type AdminLocale = keyof typeof adminTranslations;
