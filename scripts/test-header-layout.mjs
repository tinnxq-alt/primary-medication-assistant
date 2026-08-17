import fs from "node:fs";

const index = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("header-layout.css", "utf8");
const brandScript = fs.readFileSync("header-brand.js", "utf8");
const manifest = fs.readFileSync("manifest.webmanifest", "utf8");
const worker = fs.readFileSync("service-worker.js", "utf8");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(index.includes("<title>基层用药助手</title>"), "浏览器标题必须移除 Pro");
assert(index.includes('<h1 id="pageTitle">基层用药助手</h1>'), "首页初始大标题必须为基层用药助手");
assert(index.includes('href="header-layout.css"'), "首页必须加载横向标题布局样式");
assert(index.includes('src="header-brand.js"'), "首页必须加载品牌标题兼容脚本");
assert(/white-space:\s*nowrap/.test(css), "标题必须禁止逐字换行");
assert(/word-break:\s*keep-all/.test(css), "中文标题必须保持横向词组显示");
assert(/writing-mode:\s*horizontal-tb/.test(css), "标题必须明确使用横向书写模式");
assert(brandScript.includes("基层用药助手"), "品牌兼容脚本必须统一标题");
assert(!JSON.parse(manifest).name.match(/pro/i), "PWA 应用名称不得包含 Pro");
assert(worker.includes('primary-medication-v29'), "PWA 缓存必须升级到 v29");
assert(worker.includes('header-layout.css') && worker.includes('header-brand.js'), "离线缓存必须包含标题布局资源");

console.log("Header layout checks passed");
