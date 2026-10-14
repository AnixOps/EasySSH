const zh = {
  navHosts: "主机",
  navForwards: "端口转发",
  navSnippets: "命令片段",
  navSettings: "设置",
  searchHosts: "搜索主机",
  favorites: "收藏",
  ungrouped: "未分组",
  fromSshConfig: "来自 ~/.ssh/config",
  noHosts: "还没有主机",
  noHostsHint: "在 ~/.ssh/config 里添加 Host，或在这里新建主机（即将推出）。",
  noMatches: "没有匹配的主机",
  emptyTitle: "选择一台主机开始连接",
  emptyHint: "从左侧列表打开主机，每台主机会在新标签页中打开。",
  terminalSoon: "内置终端将在 v0.6 提供，现在可以先在系统终端中打开。",
  openExternal: "在系统终端中打开",
  copyCommand: "复制 SSH 命令",
  copied: "已复制",
  closeTab: "关闭标签页",
  newTab: "新建标签页",
  comingSoon: "即将推出",
  forwardsSoon: "端口转发管理将在 v0.8 提供：一个开关启动或停止隧道。",
  snippetsSoon: "命令片段将在 v0.8 提供：一键发送常用命令到终端。",
  settingsSoon: "设置将在后续版本提供。主题目前跟随系统。",
  loadFailed: "无法读取主机配置",
  openFailed: "无法打开系统终端",
  previewData: "预览数据",
};

const en: typeof zh = {
  navHosts: "Hosts",
  navForwards: "Port forwarding",
  navSnippets: "Snippets",
  navSettings: "Settings",
  searchHosts: "Search hosts",
  favorites: "Favorites",
  ungrouped: "Ungrouped",
  fromSshConfig: "From ~/.ssh/config",
  noHosts: "No hosts yet",
  noHostsHint: "Add a Host to ~/.ssh/config, or create one here (coming soon).",
  noMatches: "No matching hosts",
  emptyTitle: "Choose a host to connect",
  emptyHint: "Open a host from the list. Each host opens in its own tab.",
  terminalSoon: "The built-in terminal arrives in v0.6. For now, open it in the system terminal.",
  openExternal: "Open in system terminal",
  copyCommand: "Copy SSH command",
  copied: "Copied",
  closeTab: "Close tab",
  newTab: "New tab",
  comingSoon: "Coming soon",
  forwardsSoon: "Port forwarding arrives in v0.8: start and stop tunnels with one switch.",
  snippetsSoon: "Snippets arrive in v0.8: send common commands to a terminal in one click.",
  settingsSoon: "Settings arrive in a later version. The theme follows the system for now.",
  loadFailed: "Could not read the host configuration",
  openFailed: "Could not open the system terminal",
  previewData: "Preview data",
};

export type Strings = typeof zh;

const language =
  new URLSearchParams(window.location.search).get("lang") ?? navigator.language;

export const t: Strings = language.toLowerCase().startsWith("zh") ? zh : en;
