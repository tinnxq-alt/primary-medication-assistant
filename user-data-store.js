
(() => {
  'use strict';

  const LEGACY_PREFIX = 'primary-medication-pro:v1:';
  const ACTIVE_USER_KEY = 'clinical-assistant:active-user-id';
  const MIGRATION_KEY = 'clinical-assistant:user-data-migration:v1';
  const USER_PREFIX = 'clinical-assistant:user-data:v1:';
  const USER_SCOPED_KEYS = new Set([
    'favorites', 'groups', 'favoriteMap', 'notes', 'customDrugs', 'customCategories',
    'contraindications', 'marks', 'remembered', 'cached', 'hidden', 'categoryOverrides',
    'drugOverrides', 'tasks', 'activePharmacy'
  ]);

  const safeParse = (raw, fallback) => {
    try { return raw == null ? fallback : JSON.parse(raw); }
    catch { return fallback; }
  };

  const createLocalUserId = () => {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `local-${random}`;
  };

  let currentUserId = localStorage.getItem(ACTIVE_USER_KEY);
  if (!currentUserId) {
    currentUserId = createLocalUserId();
    localStorage.setItem(ACTIVE_USER_KEY, currentUserId);
  }

  const scopedKey = (key, userId = currentUserId) => `${USER_PREFIX}${userId}:${key}`;
  const migration = safeParse(localStorage.getItem(MIGRATION_KEY), { version: 1, legacyOwnerUserId: null, migratedKeys: [], migratedAt: null });

  function read(key, fallback) {
    if (!USER_SCOPED_KEYS.has(key)) return safeParse(localStorage.getItem(LEGACY_PREFIX + key), fallback);
    const scoped = localStorage.getItem(scopedKey(key));
    if (scoped != null) return safeParse(scoped, fallback);

    if (migration.legacyOwnerUserId && migration.legacyOwnerUserId !== currentUserId) return fallback;

    const legacy = localStorage.getItem(LEGACY_PREFIX + key);
    if (legacy == null) return fallback;
    localStorage.setItem(scopedKey(key), legacy);
    migration.legacyOwnerUserId ||= currentUserId;
    if (!migration.migratedKeys.includes(key)) migration.migratedKeys.push(key);
    migration.migratedAt = new Date().toISOString();
    localStorage.setItem(MIGRATION_KEY, JSON.stringify(migration));
    return safeParse(legacy, fallback);
  }

  function write(key, value) {
    const serialized = JSON.stringify(value);
    if (USER_SCOPED_KEYS.has(key)) {
      localStorage.setItem(scopedKey(key), serialized);
      // Draft 阶段保留旧键镜像，确保关闭 PR 后稳定站仍能读取最新本机数据。
      localStorage.setItem(LEGACY_PREFIX + key, serialized);
      return;
    }
    localStorage.setItem(LEGACY_PREFIX + key, serialized);
  }

  function userOwns(record) {
    return !record?.userId || record.userId === currentUserId;
  }

  function withCurrentUser(record) {
    return Object.freeze({ ...record, userId: currentUserId });
  }

  function migrationStatus() {
    return Object.freeze({
      userId: currentUserId,
      storageVersion: 1,
      migratedKeys: Object.freeze([...migration.migratedKeys]),
      migratedAt: migration.migratedAt,
      legacyOwnerUserId: migration.legacyOwnerUserId,
      rollbackMirrorEnabled: true
    });
  }

  window.USER_DATA_STORE = Object.freeze({
    currentUserId,
    userScopedKeys: Object.freeze([...USER_SCOPED_KEYS]),
    read,
    write,
    userOwns,
    withCurrentUser,
    migrationStatus
  });
})();

