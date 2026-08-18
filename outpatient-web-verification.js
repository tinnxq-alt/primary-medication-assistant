/*
 * 门诊药库：网络主数据逐条核验补丁（第一批）
 *
 * 核验日期：2026-08-19
 * 范围：此前仍标记 needs-review 的 22 个品规。
 * 原则：只补充可由公开药品注册、政府药品目录或生产企业资料确认的主数据；
 * 不因网络检索结果自动写入临床适应证、用法用量、不良反应等诊疗字段。
 */
(() => {
  "use strict";

  const VERIFIED_AT = "2026-08-19";
  const verifiedMetadata = {
    "FX0752":{"drugName":"阿利沙坦酯吲达帕胺缓释片","genericName":"阿利沙坦酯吲达帕胺缓释片","tradeName":"复立安","specification":"240mg:1.5mg*14片/盒","dosageForm":"片剂（缓释复方）","manufacturer":"深圳信立泰药业股份有限公司","marketingAuthorizationHolder":"深圳信立泰药业股份有限公司","approvalNumber":"国药准字H20250028","components":["阿利沙坦酯240mg","吲达帕胺1.5mg"],"therapeuticClass":"抗高血压药","sources":["https://www.salubris.com/DevelopmentPath/index_lcid_51.html","https://www.315jiage.cn/n596238"]},
    "FX3831":{"drugName":"瑞格列奈二甲双胍片(Ⅰ)","genericName":"瑞格列奈二甲双胍片(Ⅰ)","tradeName":"苑安适","specification":"1mg:500mg*10片/盒","dosageForm":"片剂","manufacturer":"成都苑东生物制药股份有限公司","marketingAuthorizationHolder":"成都苑东生物制药股份有限公司","approvalNumber":"国药准字H20213824","components":["瑞格列奈1mg","盐酸二甲双胍500mg"],"therapeuticClass":"降糖药","sources":["https://www.315jiage.cn/n487273"]},
    "FX6011":{"drugName":"沙格列汀二甲双胍缓释片(Ⅲ)","genericName":"沙格列汀二甲双胍缓释片(Ⅲ)","tradeName":"唯益同","specification":"2.5mg:1000mg*14片/盒","dosageForm":"缓释片","manufacturer":"北京福元医药股份有限公司","marketingAuthorizationHolder":"北京福元医药股份有限公司","approvalNumber":"国药准字H20233541","components":["沙格列汀2.5mg","盐酸二甲双胍1000mg"],"therapeuticClass":"降糖药","sources":["https://www.foyou.com.cn/product/product_inner/id/78","https://www.ahjx.gov.cn/OpennessContent/show/3520633.html"]},
    "FZ4181":{"drugName":"王氏保赤丸","genericName":"王氏保赤丸","tradeName":"南通","specification":"每120丸重0.3g；60丸/支*20支/盒","dosageForm":"丸剂","manufacturer":"精华制药集团股份有限公司","marketingAuthorizationHolder":"精华制药集团股份有限公司","approvalNumber":"国药准字Z32020645","therapeuticClass":"内科用药（中）","sources":["https://www.315jiage.cn/n91249"]},
    "GZ2511":{"drugName":"骨痛灵酊","genericName":"骨痛灵酊","tradeName":"","specification":"10ml/袋*3袋/盒","dosageForm":"酊剂","manufacturer":"云南圣科药业有限公司","marketingAuthorizationHolder":"云南圣科药业有限公司","approvalNumber":"国药准字Z53021244","therapeuticClass":"骨伤科用药","packagingNote":"批准规格为每袋10ml；院内库存包装为3袋/盒。","sources":["https://www.jining.gov.cn/art/2025/5/20/art_97925_2895400.html"]},
    "FX6111":{"drugName":"依折麦布阿托伐他汀钙片(Ⅱ)","genericName":"依折麦布阿托伐他汀钙片(Ⅱ)","tradeName":"伊恩泽","specification":"10mg:20mg*20片/盒","dosageForm":"片剂","manufacturer":"北京福元医药股份有限公司","marketingAuthorizationHolder":"北京福元医药股份有限公司","approvalNumber":"国药准字H20253380","components":["依折麦布10mg","阿托伐他汀20mg（以阿托伐他汀计）"],"therapeuticClass":"调脂药","sources":["https://www.foyou.com.cn/product/product_inner/id/71"]},
    "FX6141":{"drugName":"瑞舒伐他汀依折麦布片(Ⅰ)","genericName":"瑞舒伐他汀依折麦布片(Ⅰ)","tradeName":"佑知宁","specification":"10mg:10mg*20片/盒","dosageForm":"片剂","manufacturer":"北京福元医药股份有限公司","marketingAuthorizationHolder":"北京福元医药股份有限公司","approvalNumber":"国药准字H20253967","components":["瑞舒伐他汀10mg（按瑞舒伐他汀计）","依折麦布10mg"],"therapeuticClass":"调脂药","sources":["https://www.315jiage.cn/mn577594.aspx"]},
    "DL1644":{"drugName":"缬沙坦胶囊","genericName":"缬沙坦胶囊","tradeName":"穗悦","specification":"80mg*24粒/盒","dosageForm":"胶囊剂","manufacturer":"华润赛科药业有限责任公司","marketingAuthorizationHolder":"华润赛科药业有限责任公司","approvalNumber":"国药准字H20030638","therapeuticClass":"抗高血压药","sources":["https://www.jining.gov.cn/art/2025/5/20/art_97925_2895400.html"]},
    "FZ0302":{"drugName":"藤黄健骨丸","genericName":"藤黄健骨丸","tradeName":"天圣","specification":"每10丸重1.25g；360丸/盒","dosageForm":"浓缩水蜜丸","manufacturer":"天圣制药集团山西有限公司","marketingAuthorizationHolder":"天圣制药集团山西有限公司","approvalNumber":"国药准字Z20026564","therapeuticClass":"骨伤科用药","sources":["https://www.yantai.gov.cn/art/2025/3/29/art_83422_3246165.html"]},
    "GXD276":{"drugName":"精蛋白人胰岛素混合注射液(30R)","genericName":"精蛋白人胰岛素混合注射液(30R)","tradeName":"普秀霖30","specification":"3ml:300单位/支（笔芯）","dosageForm":"注射液（笔芯）","manufacturer":"甘李药业股份有限公司","marketingAuthorizationHolder":"甘李药业股份有限公司","approvalNumber":"国药准字S20210015","therapeuticClass":"胰岛素","sources":["https://www.ganlee.com/business_product.html"]},
    "DL1044":{"drugName":"硫酸特布他林雾化吸入用溶液","genericName":"硫酸特布他林雾化吸入用溶液","tradeName":"博利康尼","specification":"2ml:5mg*20支/盒","dosageForm":"雾化溶液剂","manufacturer":"AstraZeneca AB","marketingAuthorizationHolder":"AstraZeneca AB","approvalNumber":"国药准字HJ20140108","therapeuticClass":"平喘药","sources":["https://pharm.ncmi.cn/zysjk/ypjkyp/202312/t20231205_400897.html"]},
    "FX5895":{"drugName":"复方酚咖伪麻胶囊","genericName":"复方酚咖伪麻胶囊","tradeName":"力比得","specification":"20粒/盒","dosageForm":"胶囊剂","manufacturer":"四川杨天生物药业股份有限公司","marketingAuthorizationHolder":"四川杨天生物药业股份有限公司","approvalNumber":"国药准字H20013162","components":["对乙酰氨基酚150mg","马来酸氯苯那敏1.25mg","盐酸氯哌丁6mg","盐酸伪麻黄碱15mg","咖啡因12.5mg","菠萝蛋白酶16000单位"],"therapeuticClass":"感冒对症药","sources":["https://www.yangtian.com/","https://ypk.39.net/503180/manual"]},
    "GZ2403":{"drugName":"云南白药气雾剂","genericName":"云南白药气雾剂","tradeName":"云南白药","specification":"云南白药气雾剂85g+云南白药气雾剂保险液60g/盒","dosageForm":"气雾剂","manufacturer":"云南白药集团股份有限公司","marketingAuthorizationHolder":"云南白药集团股份有限公司","approvalNumber":"国药准字Z53021104","therapeuticClass":"骨伤科用药","sources":["https://www.yantai.gov.cn/art/2025/5/27/art_74173_3263943.html"]},
    "GZ0691":{"drugName":"归脾丸","genericName":"归脾丸","tradeName":"仲景","specification":"每8丸相当于饮片3g；240丸/瓶","dosageForm":"浓缩丸","manufacturer":"仲景宛西制药股份有限公司","marketingAuthorizationHolder":"仲景宛西制药股份有限公司","approvalNumber":"国药准字Z41021897","therapeuticClass":"内科用药（中）","sources":["https://www.zjjk365.com/Pr_d_gci_241_id_20.html"]},
    "GX1625":{"drugName":"马来酸依那普利叶酸片","genericName":"马来酸依那普利叶酸片","tradeName":"依叶","specification":"10mg:0.8mg*7片/盒","dosageForm":"片剂","manufacturer":"深圳奥萨制药有限公司","marketingAuthorizationHolder":"深圳奥萨制药有限公司","approvalNumber":"国药准字H20103723","components":["马来酸依那普利10mg","叶酸0.8mg"],"therapeuticClass":"血管紧张素系统药物","sources":["https://www.yantai.gov.cn/art/2025/5/27/art_74173_3263943.html"]},
    "GX2767":{"drugName":"精蛋白人胰岛素混合注射液(30R)","genericName":"精蛋白人胰岛素混合注射液(30R)","tradeName":"优泌林70/30","specification":"3ml:300单位(笔芯)/支","dosageForm":"注射液（笔芯）","manufacturer":"礼来苏州制药有限公司","marketingAuthorizationHolder":"礼来苏州制药有限公司","approvalNumber":"国药准字S20227016","therapeuticClass":"胰岛素","sources":["https://www.lillymedical.cn/zh-cn/diabetes/Humulin","https://www.yantai.gov.cn/art/2025/5/27/art_74173_3263943.html"]},
    "SX1122":{"drugName":"复方甲氧那明胶囊","genericName":"复方甲氧那明胶囊","tradeName":"诺尔彤","specification":"40粒/瓶","dosageForm":"胶囊剂","manufacturer":"上海上药信谊药厂有限公司","marketingAuthorizationHolder":"上海上药信谊药厂有限公司","approvalNumber":"国药准字H10980260","components":["盐酸甲氧那明12.5mg","那可丁7mg","氨茶碱25mg","马来酸氯苯那敏2mg"],"therapeuticClass":"止咳/平喘药","sources":["https://www.sphsine.com/mobile/productView/504"]},
    "SX1794":{"drugName":"维生素AD滴剂(胶囊型)","genericName":"维生素AD滴剂(胶囊型)","tradeName":"","specification":"维生素A1500IU:维生素D3 500IU*30粒/盒","dosageForm":"滴剂（胶囊型）","manufacturer":"国药控股星鲨制药（厦门）有限公司","marketingAuthorizationHolder":"国药控股星鲨制药（厦门）有限公司","approvalNumber":"国药准字H35021150","components":["维生素A1500IU","维生素D3 500IU"],"therapeuticClass":"维生素","sources":["https://rsqsyxxgk.weihai.gov.cn/art/2026/3/20/art_98545_2999365.html"]},
    "SX1854":{"drugName":"碳酸钙D3片(Ⅰ)","genericName":"碳酸钙D3片(Ⅰ)","tradeName":"钙尔奇D","specification":"钙600mg:维生素D3 125IU*30片/瓶","dosageForm":"片剂","manufacturer":"惠氏制药有限公司","marketingAuthorizationHolder":"赫力昂（苏州）制药有限公司","approvalNumber":"国药准字H10950029","components":["碳酸钙1.5g（相当于钙600mg）","维生素D3 125IU"],"therapeuticClass":"矿物质类","sources":["https://www.yantai.gov.cn/art/2024/11/18/art_90118_3228297.html","https://www.yaopinnet.com/H/H29/H10950029.htm"]},
    "FX3821":{"drugName":"吡格列酮二甲双胍片","genericName":"吡格列酮二甲双胍片","tradeName":"卡双平","specification":"15mg:500mg*30片/瓶","dosageForm":"片剂","manufacturer":"杭州中美华东制药有限公司","marketingAuthorizationHolder":"杭州中美华东制药有限公司","approvalNumber":"国药准字H20100180","components":["盐酸吡格列酮15mg（以吡格列酮计）","盐酸二甲双胍500mg"],"therapeuticClass":"降糖药","sources":["https://www.yantai.gov.cn/art/2025/5/27/art_74173_3263943.html"]},
    "FZ1172":{"drugName":"麝香海马追风膏","genericName":"麝香海马追风膏","tradeName":"希尔安/伍舒芳","specification":"8cm*13cm*6贴/盒","dosageForm":"贴膏剂","manufacturer":"重庆希尔安药业有限公司","marketingAuthorizationHolder":"重庆希尔安药业有限公司","approvalNumber":"国药准字Z50020097","therapeuticClass":"外科用药（中）","sources":["https://www.hilan.cn/html/content/25/10/1941.shtml","https://www.315jiage.cn/n265301"]},
    "FX5882":{"drugName":"二甲双胍格列吡嗪片","genericName":"二甲双胍格列吡嗪片","tradeName":"","specification":"250mg:2.5mg*24片/盒","dosageForm":"片剂","manufacturer":"北京四环科宝制药股份有限公司","marketingAuthorizationHolder":"北京四环科宝药业有限公司","approvalNumber":"国药准字H20140028","components":["盐酸二甲双胍250mg","格列吡嗪2.5mg"],"therapeuticClass":"降糖药","qualityIssue":"成分规格、批准文号及生产企业已核验；院内截图显示24片/盒，但公开监管/院方资料中该批准文号常见12片或20片包装，24片包装仍需以本院实物药盒或采购主数据最终确认。","sources":["https://yjj.beijing.gov.cn/yjj/xxcx/jdjcxx/fxzxjcxx/543353937/index.html"]}
  };

  window.OUTPATIENT_DRUG_CATALOG = (window.OUTPATIENT_DRUG_CATALOG || []).map(drug => {
    const patch = verifiedMetadata[drug.internalCode];
    if (!patch) return drug;

    const { sources = [], qualityIssue = "", packagingNote = "", ...masterData } = patch;
    return {
      ...drug,
      ...masterData,
      rawName: masterData.drugName || drug.rawName,
      qualityIssue,
      packagingNote,
      metadataVerification: {
        status: qualityIssue ? "verified-with-package-review" : "verified",
        scope: "药品主数据（名称、规格、剂型、生产/持有人、批准文号、主要成分）",
        checkedAt: VERIFIED_AT,
        sources
      },
      source: {
        ...drug.source,
        status: qualityIssue ? "needs-review" : "inventory-only",
        label: qualityIssue
          ? "用户提供的门诊药库截图；药品主数据已网络核验，包装仍待院内实物确认"
          : "用户提供的门诊药库截图；药品主数据已通过公开药品注册/政府目录/生产企业资料核验",
        checkedAt: VERIFIED_AT
      }
    };
  });
})();
