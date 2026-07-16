export const adminTranslations = {
  ja: {
    Dashboard: "ダッシュボード", Posts: "投稿一覧", Pages: "固定ページ一覧", Forms: "フォーム", Menus: "メニュー", Blocks: "ブロック",
    "AI proposals": "AI提案", Media: "メディア", Users: "ユーザー", Logs: "監査ログ", Snapshots: "スナップショット",
    "New post": "投稿を作成", "New page": "固定ページを作成", API: "API", Logout: "ログアウト", "control panel": "コントロールパネル",
    "Signed in as": "ログイン中:", "Sign in to manage posts and generated fragments.": "ログインして投稿と生成ページを管理してください。",
    "Switch language": "言語", English: "英語", Japanese: "日本語", "Simplified Chinese": "簡体字中国語",
    Overview: "概要", Content: "コンテンツ", Manage: "管理", Create: "作成", Articles: "投稿コンテンツ", "Fixed pages": "固定ページコンテンツ", "Forms and media": "フォーム・メディア", Series: "シリーズ管理", "Page groups": "ページグループ管理", "Site structure": "サイト構成", Operations: "運用・管理",
    Search: "検索", Save: "保存", Delete: "削除", Edit: "編集",
    Title: "タイトル", Slug: "スラッグ", Description: "説明", Status: "状態", Draft: "下書き", Published: "公開済み", Scheduled: "予約公開",
    "Save post": "投稿を保存", "Save page": "固定ページを保存", "Save series": "シリーズを保存", "Save page group": "ページグループを保存", Filter: "絞り込み", "No submissions yet.": "送信データはありません。",
    "SEO keywords": "SEOキーワード", "Prevent search indexing (noindex)": "検索エンジンへの登録を防止（noindex）", "Prevent link following (nofollow)": "リンクの追跡を防止（nofollow）",
  },
  zh: {
    Dashboard: "仪表盘", Posts: "文章列表", Pages: "页面列表", Forms: "表单", Menus: "菜单", Blocks: "区块",
    "AI proposals": "AI提案", Media: "媒体", Users: "用户", Logs: "审计日志", Snapshots: "快照",
    "New post": "创建文章", "New page": "创建页面", API: "API", Logout: "退出登录", "control panel": "控制面板",
    "Signed in as": "当前登录:", "Sign in to manage posts and generated fragments.": "请登录以管理文章和生成页面。",
    "Switch language": "语言", English: "英语", Japanese: "日语", "Simplified Chinese": "简体中文",
    Overview: "概览", Content: "内容", Manage: "管理", Create: "创建", Articles: "文章内容", "Fixed pages": "固定页面内容", "Forms and media": "表单与媒体", Series: "系列管理", "Page groups": "页面分组管理", "Site structure": "网站结构", Operations: "运营与管理",
    Search: "搜索", Save: "保存", Delete: "删除", Edit: "编辑",
    Title: "标题", Slug: "别名", Description: "描述", Status: "状态", Draft: "草稿", Published: "已发布", Scheduled: "定时发布",
    "Save post": "保存文章", "Save page": "保存页面", "Save series": "保存系列", "Save page group": "保存页面分组", Filter: "筛选", "No submissions yet.": "暂无提交数据。",
    "SEO keywords": "SEO关键词", "Prevent search indexing (noindex)": "禁止搜索引擎收录（noindex）", "Prevent link following (nofollow)": "禁止跟踪链接（nofollow）",
  },
} as const;

export type AdminLocale = keyof typeof adminTranslations;
