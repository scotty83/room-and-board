// Clock, date and greeting for the top bar. Renders locally, no network.

export const meta = { id: 'clock', title: 'Clock', refreshMs: 30 * 1000 };

export function greetingFor(name, date) {
  const h = date.getHours();
  const base = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${base}, ${name}` : base;
}

export function render(el, _vm, cfg) {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', cfg?.clock24
    ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
    : { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  el.innerHTML = `
    <div class="topbar__greeting">${escapeHtml(greetingFor(cfg?.name ?? '', now))}</div>
    <div class="topbar__clock">
      <span class="topbar__time">${time}</span>
      <span class="topbar__date">${date}</span>
    </div>`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
