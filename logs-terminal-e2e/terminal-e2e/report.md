| 方面 | 检查 | 主流终端 | 结果 |
|---|---|---|---|
| 连接 | `connect` | 打开主机即得到远端 shell 提示符 | ✅ TERM=xterm-256color COLORTERM= LANG=C.UTF-8 |
| 显示 | `cjk-emoji-width` | 中文、emoji 各占两格，后面的字符和光标对齐（wcwidth / Unicode 11+） | ✅ 中/文/😀 各占 2 格，竖线与下一行第 9 列对齐 |
| 显示 | `truecolor` | 24 位真彩色（38;2;r;g;b）按原色显示 | ✅ 前景色 #ff6400 按 RGB 保存 |
| 显示 | `ansi-black-contrast` | ANSI 黑色是深色，htop 表头、tmux 状态栏这类“彩色底黑字”清楚可读 | ✅ 黑色 #1c1c1e，彩色底上最低对比度 8.3:1，最低对比度保护 4.5 |
| 窗口 | `sidebar-toggle` | 侧栏可收起，让终端占满窗口（Termius、MobaXterm、VS Code） | ✅ 76 列 → 117 列，再次点击展开 |
| 窗口 | `focus-mode` | 突出终端：侧栏底部有收起按钮，终端里 Ctrl+Shift+S 收起/展开；专注模式（F11，macOS ⌃⌘Z）只留标签和终端，重开后记住 | ✅ 76 列 → 收起侧栏 117 列 → 专注模式 126 列；快捷键和“退出专注模式”按钮可用，重开后记住 |
| 复制粘贴 | `copy-shortcut` | 选中后 Ctrl+Shift+C（macOS ⌘C）复制 | ✅ 双击选中整词，快捷键复制 |
| 复制粘贴 | `ctrl-c-copies-selection` | Windows Terminal：有选中时 Ctrl+C 复制（并清除选中），无选中时发送 ^C | ✅ 有选中复制，无选中中断 |
| 复制粘贴 | `ctrl-v-pastes` | Windows Terminal：Ctrl+V 粘贴；Ctrl+Shift+V 也粘贴 | ✅ 两种快捷键都把剪贴板内容送进远端 |
| 复制粘贴 | `multiline-paste` | 多行粘贴：shell 开了括号粘贴（bash 5.1+）时直接粘贴不执行；否则先确认 | ✅ bash 括号粘贴：两行一起放进命令行，按回车才执行 |
| 复制粘贴 | `osc52` | 远端程序（tmux、vim、nvim）用 OSC 52 写本机剪贴板 | ✅ 剪贴板得到 from-osc52 |
| 复制粘贴 | `right-click-menu` | 右键：应用自己的菜单（复制/粘贴/清屏…），不是浏览器默认菜单 | ✅ 菜单项：复制、粘贴、全选、在终端中查找、清屏 |
| 选择 | `triple-click-line` | 三击选中整行 | ✅ 整行选中 |
| 选择 | `shift-click-extend` | Shift+单击扩展选区 | ✅ 选区扩展到点击处 |
| 选择 | `select-in-mouse-app` | 程序开了鼠标（tmux/htop）时，Shift+拖动（macOS ⌥+拖动）仍可选文字 | ✅ Shift+拖动选中 "mouse-mod" |
| 滚动 | `wheel-scrollback` | 滚轮翻看历史输出 | ✅ 向上滚动 167 行 |
| 滚动 | `shift-pageup` | Shift+PageUp / Shift+PageDown 按页翻历史 | ✅ 翻上一页（37 行） |
| 滚动 | `wheel-in-less` | less/man（备用屏、未开鼠标）中滚轮翻页而不是翻命令历史 | ✅ 滚动后首行为 51 |
| 搜索 | `find` | Ctrl+Shift+F（⌘F）在输出中查找，显示匹配数，回车跳下一个 | ✅ 匹配计数 2/4 |
| 链接 | `url-click` | 普通 URL：Ctrl+单击（⌘+单击）用系统浏览器打开 | ✅ 打开 https://example.com/plain-link |
| 链接 | `osc8-hyperlink` | OSC 8 超链接（ls --hyperlink、gcc、systemd）：Ctrl+单击打开，不弹浏览器确认框 | ✅ 打开 https://example.com/osc8 |
| 标题与提醒 | `title` | 远端用 OSC 0/2 设置标题，标签上能看到 | ✅ 标签显示主机名，远端标题在悬停提示里（同 Termius；Windows Terminal 直接显示标题） |
| 输入 | `ime-insert` | 输入法上屏的中文直接进入远端 | ✅ 组字后上屏的“你好世界”被远端回显 |
| 输入 | `keys` | 方向键、Home/End、Ctrl+←/→ 按词移动、Alt+. 取上一个参数 | ✅ 编辑结果正确 |
| 全屏程序 | `vim` | vim：备用屏、颜色、退出后恢复原屏幕 | ✅ 进出 vim 正常，原屏幕恢复 |
| 全屏程序 | `tmux` | tmux：状态栏、Ctrl+B % 分屏、窗口大小随终端变化 | ✅ 状态栏显示，分出两个窗格 |
| 全屏程序 | `htop` | htop/btop：全屏 TUI 正确绘制（鼠标点击见另一线程） | ✅ htop 正常绘制 |
| 窗口 | `resize` | 窗口变化后远端 stty size 跟着变 | ✅ stty size = 27 67 |
| 字体 | `zoom` | Ctrl+=/Ctrl+-/Ctrl+0（⌘+/⌘-/⌘0）放大、缩小、复位字号 | ✅ 字号 13 → 14 → 12 → 13 |
| 字体 | `ctrl-wheel-zoom` | Ctrl+滚轮缩放字号（Windows Terminal、WezTerm） | ✅ 字号 13 → 14 |
| 字体 | `ligatures` | 连字：Fira Code、Cascadia Code 等字体把 => != 显示成连字（Windows Terminal、WezTerm、iTerm2） | ✅ DOM 渲染，font-variant-ligatures: common-ligatures contextual |
| 标签与分屏 | `split` | Ctrl+Shift+D 分屏后新窗格也连上同一主机 | ✅ 两个窗格各有一个会话 |
| 标签与分屏 | `tab-switch` | Ctrl+Tab / Ctrl+Shift+Tab 切换标签 | ✅ staging-api ⇄ prod-web-01 |
| 标签与分屏 | `duplicate-tab` | 标签右键“复制标签”再开一个同主机会话（Windows Terminal、Termius、MobaXterm） | ✅ 两个标签，各自一个会话 |
| 标签与分屏 | `open-host-new-tab` | 同一主机再开一个标签（主机右键“在新标签中打开”） | ✅ 同一主机两个标签 |
| 标签与分屏 | `tab-drag` | 拖动标签调整顺序 | ✅ prod-web-01 \| staging-api → staging-api \| prod-web-01 |
| 标签与分屏 | `tab-rename` | 给标签改名：双击标签名或右键“重命名标签”（Windows Terminal、iTerm2、MobaXterm） | ✅ 右键或双击改名，回车确认，Esc 取消 |
| 会话 | `exit-reconnect` | 会话结束后显示原因，按回车重新连接 | ✅ 回车后重新连上，屏幕干净 |
| 会话 | `reconnect-divider` | 重新连接后出现一行淡色分隔线，说明这是新的 shell；首次连接没有 | ✅ 重连后有分隔线 |
| 会话 | `keep-session-tmux` | 保留会话（tmux）：断开后重连回到同一屏幕，之前的输出还在 | ✅ 重连回到同一个 tmux 会话，之前的输出还在 |
| 性能 | `bulk-output` | 大量输出（20 万行）不卡死，几秒内结束 | ❌ timed out waiting for /done-9f8cm5/ on screen: |
| 文件 | `sftp-browse` | 打开文件面板列出远端目录：文件夹在前，显示大小、时间、权限（Termius、FinalShell、MobaXterm） | ❌ timed out waiting for /keyuser@/ on screen: |
| 文件 | `sftp-navigate` | 双击文件夹进入，“上级目录”和 Backspace 返回（FinalShell、MobaXterm、WinSCP） | ❌ timed out waiting for /keyuser@/ on screen: |
| 文件 | `sftp-upload` | 上传本地文件到当前目录，完成后列表里出现，内容一致 | ❌ timed out waiting for /keyuser@/ on screen: |
| 文件 | `sftp-download` | 下载文件到本地“下载”文件夹，传输列表显示进度和完成 | ❌ timed out waiting for /keyuser@/ on screen: |
| 文件 | `sftp-mkdir-rename-delete` | 新建文件夹、F2 重命名、Delete 删除（带确认），远端随之改变 | ❌ timed out waiting for /keyuser@/ on screen: |
| 文件 | `sftp-chmod` | 属性里改权限（八进制或勾选），远端 ls -l 随之改变 | ❌ timed out waiting for /keyuser@/ on screen: |
| 文件 | `sftp-multi-select` | Ctrl+点击多选、Shift+点击连选，批量下载 | ❌ timed out waiting for /keyuser@/ on screen: |
| 文件 | `sftp-path` | 路径栏输入 ~、绝对路径、文件路径都能打开（FinalShell、WinSCP） | ❌ timed out waiting for /keyuser@/ on screen: |
| 文件 | `sftp-follow-osc7` | 终端报告当前目录（OSC 7，fish、Fedora/Ubuntu 的 VTE 配置会发）时，文件面板可以跟随（Windows Terminal、WezTerm、iTerm2 都读 OSC 7） | ❌ timed out waiting for /keyuser@/ on screen: |
| 文件 | `sftp-follow-integration` | 没开 Shell 集成时点“跟随终端目录”，可以直接为这台主机开启；重连后跟随（FinalShell 默认就跟随） | ❌ timed out waiting for /keyuser@/ on screen: |
| 文件 | `sftp-many-tabs` | 同一台服务器开 12 个标签后，文件面板和下载照常可用（OpenSSH 每个连接最多 10 个会话；Termius、FinalShell 不受影响） | ❌ timed out waiting for /keyuser@/ on screen: |
| 文件 | `sftp-double-click` | 双击文件用编辑器打开，保存后传回（FinalShell、MobaXterm、WinSCP；设置里可改成下载） | ❌ timed out waiting for /keyuser@/ on screen: |
| 文件 | `sftp-double-click-binary` | 双击二进制文件（压缩包、程序、图片）直接下载，不用编辑器打开，免得卡住 | ❌ timed out waiting for /keyuser@/ on screen: |
| 文件 | `sftp-cancel` | 大文件传输可以取消，状态显示已取消 | ❌ timed out waiting for /keyuser@/ on screen: |
| 文件 | `sftp-resume` | 传输中途取消后点“继续”，从断点接着传，最终文件与服务器一致 | ❌ timed out waiting for /keyuser@/ on screen: |
| 文件 | `sftp-verify` | 传输完成后可点“校验”比较本地与服务器的 SHA-256，显示一致 | ❌ timed out waiting for /keyuser@/ on screen: |
| 文件 | `sftp-context-menu` | 在文件上右键弹出菜单：下载、重命名、属性、删除、复制路径（FinalShell、MobaXterm） | ❌ timed out waiting for /keyuser@/ on screen: |
| 文件 | `sftp-sort` | 点列头按名称、大小、修改时间排序（FinalShell、MobaXterm、WinSCP） | ❌ timed out waiting for /keyuser@/ on screen: |
| 文件 | `sftp-hidden` | 可以隐藏或显示以 . 开头的文件（Termius、MobaXterm、WinSCP） | ❌ timed out waiting for /keyuser@/ on screen: |
| 连接管理 | `quick-connect` | 在主机搜索框输入 user@host:port 回车直接连接（Termius、MobaXterm、Tabby 的快速连接） | ❌ timed out waiting for /keyuser@/ on screen: |
| 连接管理 | `search-enter` | 搜索主机后回车连接第一个结果（Termius、Royal TSX） | ✅ 回车打开 staging-api |
| 连接管理 | `duplicate-host` | 主机右键“复制主机”，得到设置相同的新主机（Termius、MobaXterm、FinalShell） | ✅ 新主机“prod-web-02 副本”，地址相同 |
| 端口转发 | `forward-local` | 本地转发（-L）：打开后本机端口直通服务器那边的目标，关掉后端口释放 | ❌ timed out waiting for /keyuser@/ on screen: |
| 端口转发 | `forward-socks` | 动态转发（-D，SOCKS5）：浏览器或工具经它访问服务器那边 | ❌ timed out waiting for /keyuser@/ on screen: |
| 端口转发 | `forward-remote` | 远程转发（-R）：服务器上的端口直通本机的服务 | ❌ timed out waiting for /keyuser@/ on screen: |
| 设置 | `settings-search` | 设置可以搜索，只留下匹配的项（Windows Terminal、VS Code、Termius） | ✅ 搜“连字”只剩连字；搜“终端”显示终端组 18 项；搜不到时提示 |
| 设置 | `settings-live` | 改字号立刻作用到已打开的终端，不用重连（Windows Terminal、iTerm2） | ❌ timed out waiting for /keyuser@/ on screen: |
