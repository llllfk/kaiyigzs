# 安卓套壳（Capacitor WebView）

用手机安装包打开**已部署**的凯艺销售 CRM 网页。  
APK **不包含** Node / PostgreSQL；网站必须先上线。

```text
手机 APK（壳）
    ↓ HTTPS
已部署的 Next.js CRM
    ↓
PostgreSQL + 对象存储
```

## 前置条件

1. CRM 已有公网 **HTTPS** 地址  
2. 本机：Node.js 20+、[Android Studio](https://developer.android.com/studio)

## 快速开始

### 1. 改打开地址

编辑 `capacitor.config.json`：

```json
"server": {
  "url": "https://你的真实域名",
  "cleartext": false
}
```

### 2. 一键初始化 Android 工程

双击或在命令行运行：

```bat
setup-android.bat
```

或手动：

```bat
cd mobile
npm install
npx cap add android
npx cap sync android
npx cap open android
```

### 3. 打 APK

在 Android Studio：

**Build → Build Bundle(s) / APK(s) → Build APK(s)**

产物大致在：

```text
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

改过 `server.url` 后记得再执行：

```bat
npx cap sync android
```

然后重新打包。

## 说明

| 项 | 说明 |
|----|------|
| 套壳本质 | 内嵌浏览器打开你们的网站 |
| 业务更新 | 重新部署网站即可，通常不用重打 APK |
| 换域名 | 改 `capacitor.config.json` → sync → 重打包 |
| 录音/上传 | 若权限不够，再在 Android 清单补权限 |

正式上架应用商店需要签名版 APK/AAB（Generate Signed Bundle / APK）。
