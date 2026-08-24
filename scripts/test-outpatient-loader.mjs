import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loaderSource = fs.readFileSync(path.join(root, "outpatient-loader.js"), "utf8");
const verificationSource = fs.readFileSync(path.join(root, "outpatient-web-verification.js"), "utf8");

function makeContext() {
  const appended = [];
  const events = [];
  const window = {
    dispatchEvent(event) { events.push(event); }
  };
  const document = {
    createElement(tagName) {
      assert.equal(tagName, "script");
      return {
        remove() { this.removed = true; }
      };
    },
    head: {
      appendChild(script) { appended.push(script); }
    }
  };
  class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  const context = { window, document, CustomEvent, Promise };
  vm.createContext(context);
  return { context, window, appended, events };
}

const successful = makeContext();
vm.runInContext(verificationSource, successful.context);
assert.equal(successful.window.OUTPATIENT_DRUG_CATALOG, undefined, "核验补丁不得把尚未加载的门诊目录写成空数组");
assert.equal(typeof successful.window.applyOutpatientWebVerification, "function");
vm.runInContext(loaderSource, successful.context);

const firstLoad = successful.window.loadOutpatientDrugCatalog();
const concurrentLoad = successful.window.loadOutpatientDrugCatalog();
assert.equal(firstLoad, concurrentLoad, "并发请求必须复用同一个加载 Promise");
assert.equal(successful.appended.length, 1, "并发请求只能插入一个门诊目录脚本");
assert.equal(successful.appended[0].src, "outpatient-drugs.js");
assert.equal(successful.appended[0].async, true);

successful.window.OUTPATIENT_DRUG_CATALOG = [{
  id: "outpatient-FX0752",
  internalCode: "FX0752",
  drugName: "待核验名称",
  source: { status: "needs-review" }
}];
successful.appended[0].onload();
const loadedCatalog = await firstLoad;
assert.equal(loadedCatalog.length, 1);
assert.equal(loadedCatalog[0].drugName, "阿利沙坦酯吲达帕胺缓释片", "目录加载后必须应用网络主数据核验补丁");
assert.equal(loadedCatalog[0].metadataVerification?.status, "verified");
assert.equal(successful.events[0]?.type, "outpatient-catalog-loaded");
assert.equal(successful.events[0]?.detail?.count, 1);

const failed = makeContext();
vm.runInContext(loaderSource, failed.context);
const failedLoad = failed.window.loadOutpatientDrugCatalog();
failed.appended[0].onerror();
await assert.rejects(failedLoad, /门诊药库加载失败/);
assert.equal(failed.appended[0].removed, true, "失败脚本必须移除，避免阻塞重试");
const retryLoad = failed.window.loadOutpatientDrugCatalog();
assert.equal(failed.appended.length, 2, "加载失败后必须允许重新插入脚本重试");
failed.window.OUTPATIENT_DRUG_CATALOG = [];
failed.appended[1].onload();
assert.deepEqual(await retryLoad, []);

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
assert.ok(!html.includes('src="outpatient-drugs.js"'), "门诊目录必须保持按需加载");
assert.ok(html.indexOf('src="outpatient-loader.js"') < html.indexOf('src="outpatient-web-verification.js"'));
assert.ok(html.indexOf('src="outpatient-web-verification.js"') < html.indexOf('src="app.js"'));
assert.match(app, /pharmacyId === "outpatient"[\s\S]*?ensureOutpatientCatalogLoaded\(\)/, "点击门诊药库必须触发加载");
assert.match(app, /state\.activePharmacy === "outpatient"[\s\S]*?ensureOutpatientCatalogLoaded\(\)/, "启动时保存为门诊药库也必须触发加载");
for (const file of ["outpatient-loader.js", "outpatient-drugs.js", "outpatient-web-verification.js"]) {
  assert.ok(serviceWorker.includes(`"./${file}"`), `离线缓存必须包含 ${file}`);
}

console.log("门诊药库懒加载、核验补丁、并发复用和失败重试检查通过");
