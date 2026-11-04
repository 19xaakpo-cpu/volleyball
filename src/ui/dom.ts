export const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: (Node | string)[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) (e as any)[k] = v;
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids) e.append(k);
  return e;
}

export function showScreen(name: string) {
  document.querySelectorAll<HTMLElement>('#menu .screen').forEach((s) => {
    s.classList.toggle('hidden', s.dataset.screen !== name);
  });
  const panel = document.querySelector('#menu .panel');
  if (panel) panel.scrollTop = 0;
}

export function setWait(title: string, status: string) {
  $('#wait-title').textContent = title;
  $('#wait-status').textContent = status;
}

export async function copyText(text: string, btn: HTMLElement, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = '✅ Скопійовано';
  } catch {
    prompt('Скопіюйте посилання:', text);
  }
  setTimeout(() => { btn.textContent = label; }, 2000);
}
