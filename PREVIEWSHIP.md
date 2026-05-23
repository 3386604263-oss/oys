# 用 PreviewShip 一键获取在线链接

本项目是**纯静态网页**，可直接用 [PreviewShip](https://previewship.com) 部署，几秒到几十秒后得到可分享的预览地址（自动复制到剪贴板）。

> PreviewShip 给的是 **previewship 提供的预览域名**（如 `xxx.previewship...`）。若要固定使用 `hechengdalvdian.xuanxuan.com`，仍需按 `DEPLOY.md` 自己做域名解析。

## 在 Cursor 里用扩展（推荐）

### 1. 安装扩展

1. 打开扩展市场（`Cmd+Shift+X`）
2. 搜索 **PreviewShip**
3. 安装 **PreviewShip**（发布者一般为 previewship-BD）

或命令面板：`Extensions: Install Extensions` → 搜索 PreviewShip

### 2. 注册并获取 API Key

1. 打开 https://previewship.com 注册（有免费额度）
2. 控制台 → **API Keys** → 创建密钥

### 3. 在 Cursor 配置密钥

1. `Cmd+Shift+P`（Mac）或 `Ctrl+Shift+P`（Windows）
2. 运行：**`PreviewShip: Set API Key`**
3. 粘贴你的 API Key

### 4. 部署当前项目

1. 在 Cursor 中打开文件夹：`合成大旅店`（必须是项目根目录，能看到 `index.html`）
2. `Cmd+Shift+P` → **`PreviewShip: Deploy Current Workspace`**
3. 输入项目名（可填 `hechengdalvdian`，或直接用默认文件夹名）
4. 等待打包、上传、构建（状态栏会显示进度）
5. 成功后 **预览链接会自动复制到剪贴板**，浏览器打开即可玩

### 5. 其它命令

| 命令 | 作用 |
|------|------|
| `PreviewShip: Show Usage` | 查看今日剩余部署次数 |
| `PreviewShip: Set API Key` | 更换 API Key |

## 用命令行（可选）

已安装 Node.js 时，在项目根目录：

```bash
cd "/Users/wangruoxuan/Downloads/合成大旅店"
npx previewship login          # 首次：填入 API Key
npx previewship deploy . -n hechengdalvdian
```

`--json` 可输出结构化结果，方便脚本读取链接。

## 部署前检查

- 根目录有 `index.html`、`game.js`、`matter.min.js`、`assets/` 等
- 本地先测：`python3 -m http.server 8080` → http://localhost:8080
- 整个 `assets` 文件夹较大（含 BGM），首次上传可能稍慢，属正常

## 常见问题

**Q：部署后页面空白或没有音乐？**  
A：确认部署的是包含 `assets` 的完整目录，且用 HTTPS 预览链接打开，不要只上传单个 html。

**Q：能和 xuanxuan.com 子域名一样吗？**  
A：PreviewShip 预览链和自定义域名是两套方案；正式域名请用 `DEPLOY.md`。

**Q：Cursor 里找不到命令？**  
A：确认扩展已启用，并重载窗口（`Developer: Reload Window`）。
