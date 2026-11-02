# Orange Cloud — Android

原生 Kotlin + Jetpack Compose 客户端。设计与价值同源于 iOS 版，功能与交互以 Android 原生为先（不追求与 iOS 一一对应）。
最低 Android 8.0（API 26），目标 / 编译 API 36。

## 先决条件

- **JDK 21**（Gradle toolchain 与 AGP 要求）
- **Android SDK**（platform `android-36` + 对应 build-tools）

用 Android Studio 打开 `apps/android/` 会自动配齐 SDK；或手动安装命令行工具：

```bash
# JDK 21（Homebrew 示例）
brew install --cask temurin@21
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"

# Android SDK（命令行工具，无需 Android Studio）
brew install --cask android-commandlinetools
export ANDROID_HOME="$HOME/Library/Android/sdk"
sdkmanager "platforms;android-36" "build-tools;36.0.0" "platform-tools"
```

`local.properties` 不入库，首次需写入 SDK 路径（Android Studio 会自动生成）：

```properties
sdk.dir=/path/to/Android/sdk
```

## 构建

仓库已包含 Gradle Wrapper（`./gradlew`，Gradle 9.5.0），直接用即可：

```bash
cd apps/android
./gradlew :app:assemblePlayDebug      # 官方 Play 版（带 Billing）
./gradlew :app:assembleOssDebug       # 开源自编译版（无 Billing，isPro 恒真）
./gradlew :app:testPlayDebugUnitTest  # 单测
```

三个产品风味：

| 风味 | applicationId | 说明 |
|---|---|---|
| `play` | `jiamin.chen.orangecloud` | 官方版，Play Billing，内置官方 OAuth Client |
| `oss` | `jiamin.chen.orangecloud.oss` | 自编译全解锁，无 Billing 依赖，需自填 OAuth Client |
| `direct` | `jiamin.chen.orangecloud.direct` | 官方直发渠道，无 Play Billing，使用激活码兑换 |

Windows 使用 `cd apps\android` 后执行 `.\gradlew.bat :app:assembleOssDebug`。
Debug APK 位于 `app/build/outputs/apk/oss/debug/app-oss-debug.apk`，包名在上述风味包名后追加 `.debug`。

## OAuth Client 注入

`OAUTH_CLIENT_ID` 和 `OAUTH_REDIRECT_URI` 经 Gradle 注入到 `BuildConfig`：

- `play` 风味内置官方 Client ID——OAuth PKCE 下它是公开标识符而非机密，与 iOS `OAuthConfig.swift` 同值。
- `oss` 风味默认空串。自编译者须在 `apps/android/local.properties` 填入自建的 Client ID：
  ```properties
  OAUTH_CLIENT_ID=你自建的_client_id
  OAUTH_REDIRECT_URI=https://你的回调域名/oauth/callback
  # 以下两项保持默认即可；若修改，relay 必须跳转到相同的 scheme/host
  OAUTH_CALLBACK_SCHEME=orangecloud
  OAUTH_CALLBACK_HOST=oauth
  ```
  `OAUTH_REDIRECT_URI` 必须与 Cloudflare OAuth Client 中登记的 redirect URI 完全一致。
  relay 只需把 `code` 与 `state` 302 到 `${OAUTH_CALLBACK_SCHEME}://${OAUTH_CALLBACK_HOST}/callback`，
  不存 code、不换 Token；官方 Client 与 `o-c.do` 中转不向第三方构建开放，详见根目录 [`CONTRIBUTING.md`](../../CONTRIBUTING.md)。

`local.properties` 已被 Git 忽略。不要把 Client Secret、Access Token、Refresh Token、Wrangler 登录凭证或签名密钥写入仓库；本项目的 OAuth PKCE Client ID 是公开标识符，但个人构建仍只保存在该本地文件中。

## Fork 同步与覆盖升级

本 fork 的 `origin` 是 `https://github.com/xiwei26/orange-cloud.git`，
原作者的 `upstream` 是 `https://github.com/chen2he/orange-cloud.git`。
本 fork 的 `main` 已合入 `android-oss-selfbuild-upstream-20261102`，包含上游 `37fa62b`
和自建 OAuth Client / callback 配置注入。原来的 `android-oss-selfbuild` 保留为 2.1.2 自编译代码备份；
迁移分支保留为已在手机验证的 2.2.0 自编译代码快照。
此次合并保留旧 `main` 的提交历史，文件内容采用已验证的 2.2.0 分支（另更新本说明），未强推改写历史。

后续在干净工作树中同步 `main`（在仓库根目录执行）：

```bash
git fetch upstream main
git fetch origin
git switch main
git merge --ff-only origin/main
git merge upstream/main
```

若合并出现冲突，检查并保留 OAuth 配置注入，解决后重新构建、验证，再提交和执行 `git push origin main`。
也可以先在更新分支上完成合并和验证，再合入 `main`。`main` 含 fork 自编译改动，
GitHub 显示领先上游属于正常现象；不要为了消除领先数量而丢弃这些提交。
需要取消未完成的合并时用 `git merge --abort`。不要直接用 GitHub 的丢弃提交操作同步定制分支。
若上游再次更改历史导致大量无关冲突，保留旧分支，从最新 `upstream/main` 新建分支，
仅移植本 fork 的 OAuth 配置提交；不要重放旧上游的整段历史。

每次升级还需检查：

- 比较 `core/auth/Scopes.kt` 和 `PermissionModels.kt`；新权限需要在自己的 Cloudflare OAuth Client 中登记并保存。
  2.2.0 新增 `precursor.read`、`precursor.write` 和 `workers-observability.write`。
  若授权返回 `invalid_scope`，先补齐 Client 权限；老会话要使用新增权限需重新授权。
- 使用相同 applicationId 和签名证书才能覆盖安装并保留应用数据。跨电脑构建时需妥善保留原签名密钥，
  不要提交到 Git；`.debug` 构建也依赖原电脑的 debug keystore。
- 旧 APK 备份应放在构建输出目录之外，避免下次打包清理；只有 APK 备份并不包含应用数据。

## 架构

Google 官方 App Architecture，分层无环：

```
ui/        Compose 屏 + ViewModel（每屏一个 UiState: StateFlow）
data/      Repository（单一可信源）
  ├─ remote/  CfApiClient(OkHttp) + DTO(@Serializable)
  └─ local/   Room(@Entity/@Dao) + DataStore
core/      auth / network / design（晨昏天景）/ di（Hilt）
```

- Composable 不直接发网络，只读 ViewModel 暴露的 `UiState`；ViewModel 不持有 OkHttp，只调 Repository。
- Token 只入 Keystore 包裹的加密 DataStore，绝不写明文。
- 数据模型为 `@Serializable` data class，`@SerialName` 映射 snake_case。
- 错误统一 `ApiError`（sealed class），在 ViewModel `catch` 后赋给 `UiState.error`。
- 用户可见文案一律入 `res/values/strings.xml`，禁止硬编码字面量。
