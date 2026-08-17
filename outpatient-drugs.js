/*
 * 门诊药库目录
 *
 * 门诊品规将在后续批量导入。每条记录必须使用唯一 ID，并明确设置
 * pharmacyScopes: ["outpatient"]；与病房完全相同的品规可使用
 * pharmacyScopes: ["ward", "outpatient"] 复用同一条资料。
 */

window.OUTPATIENT_DRUG_CATALOG = [];
