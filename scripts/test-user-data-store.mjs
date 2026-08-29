
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../user-data-store.js', import.meta.url), 'utf8');

class MemoryStorage {
  constructor(initial = {}) { this.values = new Map(Object.entries(initial)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const storage = new MemoryStorage({
  'primary-medication-pro:v1:favorites': JSON.stringify(['drug-025']),
  'primary-medication-pro:v1:tasks': JSON.stringify([{ id: 'task-legacy', title: '旧待办', done: false }])
});

const makeContext = () => {
  const context = { window: {}, localStorage: storage, Date, Math };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.USER_DATA_STORE;
};

const first = makeContext();
assert.match(first.currentUserId, /^local-/);
assert.deepEqual([...first.read('favorites', [])], ['drug-025']);
const firstScopedPrefix = `clinical-assistant:user-data:v1:${first.currentUserId}:`;
assert.ok(storage.getItem(`${firstScopedPrefix}favorites`), '旧收藏应迁入当前用户命名空间');

first.write('tasks', [{ id: 'task-1', userId: first.currentUserId, title: '核对资料', done: false }]);
assert.ok(storage.getItem(`${firstScopedPrefix}tasks`), '个人待办必须写入用户命名空间');
assert.ok(storage.getItem('primary-medication-pro:v1:tasks'), '草稿阶段必须保留回退镜像');
assert.equal(first.userOwns({ userId: first.currentUserId }), true);
assert.equal(first.userOwns({ userId: 'another-user' }), false);
assert.equal(first.withCurrentUser({ id: 'note-1' }).userId, first.currentUserId);
assert.equal(first.migrationStatus().legacyOwnerUserId, first.currentUserId);

storage.setItem('clinical-assistant:active-user-id', 'local-second-user');
const second = makeContext();
assert.equal(second.currentUserId, 'local-second-user');
assert.deepEqual([...second.read('favorites', [])], [], '第二个用户不得继承首个用户的旧收藏');
second.write('favorites', ['drug-096']);
assert.deepEqual(JSON.parse(storage.getItem('clinical-assistant:user-data:v1:local-second-user:favorites')), ['drug-096']);
assert.deepEqual(JSON.parse(storage.getItem(`${firstScopedPrefix}favorites`)), ['drug-025'], '用户间数据不得互相覆盖');

console.log('个人数据隔离检查通过：旧数据单次迁移、用户命名空间隔离、回退镜像均有效');

