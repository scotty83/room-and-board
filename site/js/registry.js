// Widget module registry. Modules self-describe via meta = {id, title,
// refreshMs}; the active set and order come from the user's config.

const registry = new Map();

export function registerWidget(mod) {
  registry.set(mod.meta.id, mod);
}

export function activeWidgets(cfg) {
  return cfg.widgets.map((id) => registry.get(id)).filter(Boolean);
}

export function getWidget(id) {
  return registry.get(id) ?? null;
}

export function clearRegistry() {
  registry.clear();
}
