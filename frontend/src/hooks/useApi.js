const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

async function rawFetch(path, options = {}) {
  return fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
    ...options,
  });
}

export async function apiFetch(path, options = {}) {
  let response = await rawFetch(path, options);

  if (response.status === 401) {
    const refreshRes = await rawFetch('/auth/refresh', { method: 'POST' });
    if (refreshRes.ok) {
      response = await rawFetch(path, options);
    }
  }

  if (response.status === 304) return {};

  const contentType = response.headers.get('content-type') || '';
  let data = {};
  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => ({}));
  }

  if (!response.ok) {
    const message = data.error || (Array.isArray(data.errors) ? data.errors[0] : null) || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}