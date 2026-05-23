# 部署到 hechengdalvdian.xuanxuan.com

本游戏是纯静态网页（HTML + JS + 资源文件），部署后效果与本地一致。需要你自己有 **xuanxuan.com** 域名的解析权限。

## 一、准备文件

将整个 `合成大旅店` 文件夹上传到服务器或静态托管平台，**保持目录结构不变**（含 `assets/`、`matter.min.js`、`game.js` 等）。

本地自测：

```bash
cd "/Users/wangruoxuan/Downloads/合成大旅店"
python3 -m http.server 8080
```

浏览器打开 http://localhost:8080 确认无误后再上线。

## 二、域名解析（DNS）

在域名服务商（阿里云、腾讯云、Cloudflare 等）为 **xuanxuan.com** 添加记录：

| 类型 | 主机记录 | 记录值 |
|------|----------|--------|
| CNAME | `hechengdalvdian` | 你的托管平台给的地址（见下方方案） |

或使用 **A 记录** 指向你云服务器的公网 IP。

生效后访问：**https://hechengdalvdian.xuanxuan.com**

## 三、推荐部署方式

### 方案 A：Nginx（自有服务器 / 云主机）

1. 把项目拷到服务器，例如 `/var/www/hechengdalvdian/`
2. 使用仓库内 `deploy/nginx.conf.example` 配置站点
3. 用 Certbot 申请 HTTPS 证书：

```bash
sudo certbot --nginx -d hechengdalvdian.xuanxuan.com
```

### 方案 B：Cloudflare Pages / Vercel / Netlify（免费静态托管）

1. 将项目推送到 GitHub 仓库
2. 在平台新建 Static Site，根目录为项目根
3. 绑定自定义域名 `hechengdalvdian.xuanxuan.com`（按平台提示配置 CNAME）

### 方案 C：对象存储 + CDN（阿里云 OSS、腾讯云 COS）

开启「静态网站托管」，上传全部文件，CDN 回源并绑定子域名。

## 四、注意事项

- **必须用 HTTP 服务访问**，不要直接双击 `index.html`（否则部分资源/音频可能异常）。
- `assets/背景音乐/不万能的喜剧.m4a` 约 5MB，首次加载会稍慢，可考虑 CDN 加速。
- 新增 `assets/背景图片/` 后在本机执行 `python3 scripts/update-manifest.py` 再重新上传。

## 五、我（AI）无法代你完成的步骤

无法代替你登录域名控制台、购买服务器或绑定证书。按上文在服务商后台操作即可；若你提供具体平台（如阿里云 OSS），可再写该平台的分步截图级说明。
