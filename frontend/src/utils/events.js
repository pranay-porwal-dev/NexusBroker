export const AppEvents = {
  WALLET_CHANGED: 'nexus:wallet_changed',
  ORDER_CHANGED:  'nexus:order_changed',
};

export function emitEvent(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function onEvent(name, handler) {
  window.addEventListener(name, handler);
  return () => window.removeEventListener(name, handler); 
}