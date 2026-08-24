/* 门诊药库网络核验主数据显示增强 */
(() => {
  "use strict";

  const escText = value => String(value ?? "");
  const safeUrl = value => {
    try {
      const url = new URL(String(value || ""), location.href);
      return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  };

  const currentDrug = () => {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (parts[0] !== "detail" || !parts[1]) return null;
    const id = decodeURIComponent(parts.slice(1).join("/"));
    return (window.OUTPATIENT_DRUG_CATALOG || []).find(item => item.id === id) || null;
  };

  const makeItem = (label, value) => {
    const wrap = document.createElement("div");
    wrap.className = "detail-item outpatient-verified-metadata";
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = escText(value || "待核验");
    wrap.append(dt, dd);
    return wrap;
  };

  const makeSources = sources => {
    const wrap = document.createElement("div");
    wrap.className = "detail-item outpatient-verified-metadata";
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = "主数据核验来源";
    const usable = (Array.isArray(sources) ? sources : []).map(safeUrl).filter(Boolean);
    if (!usable.length) {
      dd.textContent = "待补充";
    } else {
      usable.forEach((url, index) => {
        if (index) dd.append(document.createTextNode(" · "));
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `来源${index + 1}`;
        dd.append(link);
      });
    }
    wrap.append(dt, dd);
    return wrap;
  };

  const render = () => {
    document.querySelectorAll(".outpatient-verified-metadata").forEach(node => node.remove());
    document.querySelectorAll(".outpatient-metadata-notice").forEach(node => node.remove());

    const drug = currentDrug();
    if (!drug?.metadataVerification && !drug?.outpatientClinicalReference) return;
    const grid = document.querySelector(".detail-grid");
    if (!grid) return;

    if (drug.outpatientClinicalReference) grid.append(makeItem("说明书资料匹配", `${drug.outpatientClinicalReference.scope} · ${drug.outpatientClinicalReference.hydratedAt || ""}`));
    if (drug.metadataVerification) {
      grid.append(makeItem("主数据核验", `${drug.metadataVerification.status === "verified" ? "已核验" : "已核验，包装待确认"} · ${drug.metadataVerification.checkedAt || ""}`));
      grid.append(makeSources(drug.metadataVerification.sources));
    }

    const heading = grid.previousElementSibling;
    const notice = document.createElement("div");
    notice.className = "notice outpatient-metadata-notice";
    notice.style.marginTop = "14px";
    notice.textContent = drug.metadataVerification
      ? "药品主数据已通过公开注册/政府目录/生产企业资料核验；适应症、用法用量、不良反应等临床字段仍以对应厂家现行说明书为准。"
      : drug.outpatientClinicalReference?.status === "matched-supplemental-verified-source"
        ? "临床摘要来自按门诊通用名与剂型核对的公开说明书；具体厂家、批准文号、包装和完整禁忌仍以院内实物现行说明书为准。"
        : "临床摘要来自同药品名称（含剂型）及同成分规格的已核验资料；包装数量和生产企业仍以门诊药库主数据为准。";
    if (heading?.parentNode) heading.parentNode.insertBefore(notice, grid);
    else grid.parentNode?.insertBefore(notice, grid);
  };

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      render();
    });
  };

  window.addEventListener("primary-medication-rendered", schedule);
  window.addEventListener("DOMContentLoaded", schedule);
  schedule();
})();
