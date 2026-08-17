(() => {
  "use strict";

  const PHARMACY_IDS = Object.freeze(["ward", "outpatient"]);

  const normalizePharmacyId = (value, fallback = "ward") => {
    const candidate = String(value || "").trim().toLowerCase();
    if (PHARMACY_IDS.includes(candidate)) return candidate;
    return PHARMACY_IDS.includes(fallback) ? fallback : "ward";
  };

  const normalizePharmacyScopes = (drug, fallback = "ward") => {
    const raw = Array.isArray(drug?.pharmacyScopes)
      ? drug.pharmacyScopes
      : drug?.pharmacyScope
        ? [drug.pharmacyScope]
        : [];
    const scopes = [...new Set(raw.map(value => String(value || "").trim().toLowerCase()).filter(value => PHARMACY_IDS.includes(value)))];
    return scopes.length ? scopes : [normalizePharmacyId(fallback)];
  };

  const withPharmacyScopes = (drug, fallback = "ward") => ({
    ...drug,
    pharmacyScopes: normalizePharmacyScopes(drug, fallback)
  });

  const drugBelongsToPharmacy = (drug, pharmacyId) => normalizePharmacyScopes(drug)
    .includes(normalizePharmacyId(pharmacyId));

  const filterDrugsByPharmacy = (drugs, pharmacyId) => (Array.isArray(drugs) ? drugs : [])
    .filter(drug => drugBelongsToPharmacy(drug, pharmacyId));

  window.PHARMACY_SCOPE = Object.freeze({
    PHARMACY_IDS,
    drugBelongsToPharmacy,
    filterDrugsByPharmacy,
    normalizePharmacyId,
    normalizePharmacyScopes,
    withPharmacyScopes
  });
})();
