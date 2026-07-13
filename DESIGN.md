# DESIGN.md

## 气质与意象
- 深夜工作室中，一盏冷白台灯照亮屏幕，代码在黑色终端上流淌——这是凯艺软件的品牌底色：专注、精密、低调
- 关键词：克制、精密、呼吸感、暗调高级感
- 参考气质：Linear 的冷峻流畅 + Vercel 的极简对比 + Stripe 的渐变点缀

## 配色方案
- 背景主色：`#0a0a0a`（近纯黑，非纯黑以保留层次）
- 背景次色：`#111111`（卡片/区块底色）
- 边框/分隔：`rgba(255,255,255,0.08)`（极淡白线）
- 文字主色：`#fafafa`（近白）
- 文字次色：`#a1a1aa`（锌灰 400）
- 强调渐变：`linear-gradient(135deg, #6366f1, #8b5cf6)`（靛蓝→紫罗兰，用于 CTA 按钮和标题高亮）
- 光晕点缀：`radial-gradient(600px circle at 50% 0%, rgba(99,102,241,0.08), transparent)`

## 字体排版
- 字体族：Inter（英文/数字）+ 系统默认中文（PingFang SC / Microsoft YaHei）
- Hero 标题：clamp(2.5rem, 5vw, 4.5rem) / font-weight 700 / tracking-tight
- 区块标题：2rem ~ 2.5rem / font-weight 600
- 正文：1rem / line-height 1.75 / color zinc-400
- 数字展示：font-weight 700 / tabular-nums

## 动效与交互
- 滚动淡入：framer-motion `whileInView` + `opacity: [0,1]` + `y: [20,0]`
- 卡片悬停：`translateY(-4px)` + `box-shadow` 增强 + `border-color` 微亮
- 导航栏：`backdrop-blur-xl` + 半透明背景
- 按钮悬停：背景色/渐变微亮 + 轻微 scale(1.02)
- 数字计数：framer-motion `useInView` + 数字递增动效
- 缓动曲线：`ease-out` 为主，过渡时长 300~600ms

## 设计禁忌
- 不要使用彩色图标/emoji 作为产品图标，统一使用 Lucide 线性图标
- 不要使用大面积高饱和度色块
- 不要使用圆角过大的卡片（统一 rounded-xl 或 rounded-2xl）
- 不要添加多余的装饰性插画或 3D 元素
- 不要使用纯白背景或亮色主题
- 不要使用超过两种渐变方向
