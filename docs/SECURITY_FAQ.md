# goshare 安全 FAQ / Security FAQ

针对反诈语境下最常见的一个质疑：“一个能发布任意 HTML 的分享工具，会不会被人拿去做钓鱼页？”

## 中文

### Q: goshare 能发布任意网页，会不会被人用来做钓鱼/诈骗页面？

这是个好问题，也是我做这个工具时优先考虑的事。几点说明：

- **默认就开内容安全扫描。** 创建分享页前会扫描明显的钓鱼、凭据采集、Cookie 外传、自动跳转和高混淆脚本并拦截。它不是杀毒引擎、不能保证识别所有恶意页面，但把常见钓鱼模式挡在门外。
- **默认需要登录、且有每日额度。** 生产默认 `AUTH_ENABLED=true`，并对网页创建、Agent 创建、AI 调用都设了每日上限，防止被批量滥用。
- **它是自托管的，责任和数据都归部署者。** 每个人部署在自己的 Cloudflare 账号上，内容、用量、合规都由部署者自己掌控——这和“一个集中托管、谁都能匿名发页”的平台有本质区别。
- **建议独立子域名 + 谨慎打开陌生分享页。** README 里也明确提示：用独立子域名部署、陌生 HTML/ZIP 用无痕窗口查看，降低风险面。

一句话：任何能托管内容的工具理论上都可能被滥用，goshare 的取舍是“默认收紧、风险可见、责任归己”，而不是默认放开。

## English

### Q: goshare can publish arbitrary web pages — couldn't someone abuse it to host phishing pages?

Fair question, and one I prioritized while building it:

- **Content security scan is on by default.** Before a share page is created, goshare scans for and blocks obvious phishing, credential harvesting, cookie exfiltration, auto-redirects, and heavily obfuscated scripts. It's not an antivirus and won't catch everything, but it keeps common phishing patterns out.
- **Auth required by default, with daily limits.** Production defaults to `AUTH_ENABLED=true`, plus per-day caps on web creation, agent creation, and AI calls to prevent bulk abuse.
- **It's self-hosted — data and responsibility stay with the deployer.** Everyone runs it on their own Cloudflare account, so content, usage, and compliance are theirs to control. That's fundamentally different from a centralized service where anyone can post anonymously.
- **Use a dedicated subdomain & open unknown pages cautiously.** The README recommends deploying on a separate subdomain and viewing unfamiliar HTML/ZIP in an incognito window.

In short: any content-hosting tool can theoretically be misused. goshare's choice is “locked down by default, risks visible, responsibility on the deployer” — not open by default.
