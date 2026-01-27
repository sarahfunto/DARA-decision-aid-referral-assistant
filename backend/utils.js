// utils.js
export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function toText(err) {
  return err?.message || String(err);
}
