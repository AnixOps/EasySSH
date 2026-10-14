# macOS 签名与公证

发布流程（`.github/workflows/release.yml`）在仓库里有下面 6 个 Secrets 时，会自动给
macOS 安装包签名并提交 Apple 公证；没有时照常打出未签名的安装包。证书和密钥只放在
GitHub Secrets 里，不进仓库。

## 1. 加入 Apple Developer Program

在 <https://developer.apple.com/programs/> 以个人或组织身份加入（99 美元/年）。

## 2. 创建 Developer ID Application 证书

在 Mac 上打开 Xcode → Settings → Accounts → 选中团队 → Manage Certificates →
左下角 + → **Developer ID Application**。然后在“钥匙串访问”里找到这张证书，
右键导出为 `.p12`，设置一个导出密码。

把 `.p12` 转成一行 base64：

```bash
base64 -i DeveloperID.p12 -o DeveloperID.b64
```

证书的完整名称（形如 `Developer ID Application: Your Name (TEAMID1234)`）可以这样查：

```bash
security find-identity -v -p codesigning
```

## 3. 创建 App Store Connect API 密钥（用于公证）

<https://appstoreconnect.apple.com/access/integrations/api> → Team Keys →
生成一个角色为 **Developer** 的密钥，下载 `AuthKey_XXXXXXXXXX.p8`（只能下载一次），
记下页面上的 **Key ID** 和 **Issuer ID**。

## 4. 填入 GitHub Secrets

仓库 Settings → Secrets and variables → Actions → New repository secret，或者用 gh：

| Secret | 内容 |
|---|---|
| `APPLE_CERTIFICATE` | 第 2 步 `DeveloperID.b64` 的内容 |
| `APPLE_CERTIFICATE_PASSWORD` | 导出 `.p12` 时设置的密码 |
| `APPLE_SIGNING_IDENTITY` | 证书完整名称 |
| `APPLE_API_ISSUER` | Issuer ID |
| `APPLE_API_KEY` | Key ID |
| `APPLE_API_KEY_P8` | `AuthKey_XXXXXXXXXX.p8` 文件的全部内容 |

```bash
gh secret set APPLE_CERTIFICATE --repo AnixOps/EasySSH < DeveloperID.b64
gh secret set APPLE_CERTIFICATE_PASSWORD --repo AnixOps/EasySSH
gh secret set APPLE_SIGNING_IDENTITY --repo AnixOps/EasySSH
gh secret set APPLE_API_ISSUER --repo AnixOps/EasySSH
gh secret set APPLE_API_KEY --repo AnixOps/EasySSH
gh secret set APPLE_API_KEY_P8 --repo AnixOps/EasySSH < AuthKey_XXXXXXXXXX.p8
```

不带 `<` 的命令会提示你粘贴值，不会出现在命令历史里。

## 5. 发布

之后打的每个 `vX.Y.Z` 标签都会签名并公证 macOS 安装包；发布说明会自动去掉
“右键打开”的提示。公证通常需要几分钟，macOS 构建会因此变慢一些。
