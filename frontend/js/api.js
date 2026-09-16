// Em produção o frontend é servido pelo mesmo domínio da API (caminho relativo funciona
// direto). Em dev local com `npx serve` numa porta separada (5173), a API roda em :3000
// no mesmo host — cobre local, rede local (IP) e produção sem precisar configurar nada.
const API_BASE = window.API_BASE_URL
  || (location.port && location.port !== '3000'
    ? `${location.protocol}//${location.hostname}:3000/api`
    : '/api');

async function apiRequest(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const erro = new Error(data?.erro || `Erro ${res.status}`);
    erro.status = res.status;
    erro.detalhes = data?.detalhes;
    throw erro;
  }
  return data;
}

const api = {
  get: (path) => apiRequest(path),
  post: (path, body) => apiRequest(path, { method: 'POST', body }),
  put: (path, body) => apiRequest(path, { method: 'PUT', body }),
  patch: (path, body) => apiRequest(path, { method: 'PATCH', body }),
  delete: (path) => apiRequest(path, { method: 'DELETE' }),
};
