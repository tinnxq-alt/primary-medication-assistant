
(() => {
  'use strict';

  const sharedSteps = Object.freeze([
    '快速识别：优先评估气道、呼吸、循环、意识及其他立即威胁生命的异常。',
    '立即呼救：按危险程度启动监护、呼叫支援并执行本院急救流程。',
    '初始处置：围绕最危险且可逆的病因开展处置，并持续复评。',
    '升级与记录：达到升级条件时尽早转诊或会诊，完整记录时间轴与疗效。'
  ]);

  const flows = [
    { id: 'cardiac-arrest', icon: '♥', title: '心搏骤停', tone: 'danger', summary: '从无反应入口进入复苏、节律判断、可逆原因和记录闭环。', drugIds: ['drug-concept-epinephrine', 'drug-concept-amiodarone'] },
    { id: 'shock', icon: '◆', title: '休克/循环不稳', tone: 'danger', summary: '先确认灌注异常，再按感染、失血、过敏和心源性等方向分流。', drugIds: ['drug-concept-norepinephrine', 'drug-concept-epinephrine'] },
    { id: 'respiratory-distress', icon: '◌', title: '严重呼吸困难', tone: 'primary', summary: '从气道和氧合危险开始，避免过早固定为单一诊断。', drugIds: ['drug-concept-salbutamol', 'drug-concept-ipratropium'] },
    { id: 'chest-pain', icon: '♡', title: '急性胸痛', tone: 'danger', summary: '优先排查高危胸痛，再进入相应的鉴别与处置路径。', drugIds: ['drug-concept-aspirin'] },
    { id: 'altered-consciousness', icon: '◎', title: '意识障碍', tone: 'primary', summary: '先保护生命功能并排除低血糖等可逆原因。', drugIds: ['drug-concept-glucose', 'drug-concept-naloxone'] },
    { id: 'hypoglycemia', icon: '↓', title: '低血糖', tone: 'primary', summary: '围绕即时确认、意识与吞咽能力、纠正和复测建立闭环。', drugIds: ['drug-concept-glucose'] },
    { id: 'seizure', icon: '⚡', title: '抽搐/癫痫持续状态', tone: 'danger', summary: '保护患者、记录持续时间、处理可逆原因，并在持续发作时升级。', drugIds: ['drug-concept-levetiracetam', 'drug-concept-diazepam'] },
    { id: 'infection', icon: '✣', title: '严重感染/高热', tone: 'warning', summary: '从感染危险信号与器官功能异常切入，并同步寻找感染来源。', drugIds: ['drug-concept-ceftriaxone'] },
    { id: 'bleeding', icon: '●', title: '大出血/严重创伤', tone: 'danger', summary: '优先控制出血、识别循环不稳并尽早协调转诊资源。', drugIds: ['drug-concept-tranexamic-acid'] },
    { id: 'abdominal-pain', icon: '◇', title: '急性腹痛', tone: 'warning', summary: '先识别休克、腹膜刺激征和其他急腹症危险，再进行病因分流。', drugIds: [] }
  ].map(flow => Object.freeze({ ...flow, steps: sharedSteps, reviewStatus: 'needs-clinical-review' }));

  const calculators = [
    { id: 'egfr', title: 'eGFR', subtitle: '肾小球滤过率估算', status: '待公式与适用人群复核' },
    { id: 'crcl', title: 'CrCl', subtitle: '肌酐清除率估算', status: '待公式与体重口径复核' },
    { id: 'cha2ds2-vasc', title: 'CHA₂DS₂-VASc', subtitle: '房颤卒中风险评估', status: '待评分项复核' },
    { id: 'has-bled', title: 'HAS-BLED', subtitle: '出血风险评估', status: '待评分项复核' }
  ].map(item => Object.freeze(item));

  const orderTemplates = [
    { id: 'order-nebulization', title: '雾化治疗医嘱', category: '呼吸系统', description: '仅保存模板入口；具体药物、剂量与频次需按患者情况核对。' },
    { id: 'order-chest-pain', title: '胸痛初步处置', category: '心血管', description: '用于整理评估与监护项目，不替代胸痛鉴别诊断。' },
    { id: 'order-fluids', title: '补液与监护', category: '常用处置', description: '容量、液体种类和监护目标必须个体化审核。' }
  ].map(item => Object.freeze({ ...item, reviewStatus: 'template-only' }));

  window.CLINICAL_WORKSPACE_DATA = Object.freeze({
    schemaVersion: 1,
    emergencyBaseline: '856805613e1967ae56493a77e7b3d5fd309f6dc2',
    flows: Object.freeze(flows),
    calculators: Object.freeze(calculators),
    orderTemplates: Object.freeze(orderTemplates)
  });
})();

