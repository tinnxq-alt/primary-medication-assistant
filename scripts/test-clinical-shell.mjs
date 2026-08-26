import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const index = read('index.html');
const app = read('app.js');
const serviceWorker = read('service-worker.js');

for (const marker of ['data-route="home"', 'data-route="medication"', 'data-route="emergency"', 'data-route="favorites"', 'data-route="notebook"']) {
  if (!index.includes(marker)) throw new Error(`缺少统一导航：${marker}`);
}
if (!app.includes('home: renderClinicalHome')) throw new Error('统一首页未注册');
if (!app.includes('medication: renderMedicationHome')) throw new Error('用药模块首页未注册');
if (!app.includes('emergency: renderEmergencyHome')) throw new Error('急救模块入口未注册');
if (!serviceWorker.includes('clinical-data-contract.js')) throw new Error('离线外壳未缓存数据契约');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(read('clinical-data-contract.js'), context);
const contract = context.window.CLINICAL_DATA_CONTRACT;
if (!contract || contract.version !== '1.0.0-draft') throw new Error('数据契约未加载');

const drugs = new Set(['drug-001']);
const validProtocol = {
  id: 'protocol-anaphylaxis',
  title: '过敏性休克',
  version: 'draft-1',
  reviewStatus: 'needs-review',
  drugRefs: [{ drugId: 'drug-001', purpose: '一线急救药物' }]
};
if (contract.validateEmergencyProtocol(validProtocol, drugs).length) throw new Error('有效 drug_id 引用被拒绝');
if (!contract.validateEmergencyProtocol({ ...validProtocol, drugRefs: [{ drugId: 'drug-999' }] }, drugs).length) throw new Error('悬空 drug_id 未被发现');
if (!contract.validateEmergencyProtocol({ ...validProtocol, drugRefs: [{ drugId: 'drug-001', drugName: '肾上腺素' }] }, drugs).length) throw new Error('重复药名未被拒绝');
if (!contract.validateUserEntity({ entityType: 'note', id: 'note-1' }).length) throw new Error('缺少 userId 的个人数据未被拒绝');

console.log('clinical shell and data contract checks passed');
