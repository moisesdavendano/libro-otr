// API del Libro de Trabajo OTR: guarda y entrega los trabajos en Netlify Blobs.
// Protegida con la contraseña definida en la variable de entorno LIBRO_CLAVE.
import { getStore } from '@netlify/blobs';

const KEY = 'libro_otr';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

function claveOk(req) {
  const esperada = process.env.LIBRO_CLAVE || '';
  const dada = req.headers.get('x-clave') || '';
  if (!esperada || dada.length !== esperada.length) return false;
  let d = 0;
  for (let i = 0; i < dada.length; i++) d |= dada.charCodeAt(i) ^ esperada.charCodeAt(i);
  return d === 0;
}

export default async (req) => {
  if (!process.env.LIBRO_CLAVE) return json(500, { error: 'Falta configurar LIBRO_CLAVE en Netlify' });
  if (!claveOk(req)) {
    await new Promise(r => setTimeout(r, 800));   // frena intentos de adivinar
    return json(401, { error: 'Contraseña incorrecta' });
  }

  const store = getStore({ name: 'libro', consistency: 'strong' });

  // Cada guardado lleva un número de versión propio (rev); 'v0' = guardado antes de existir rev
  const leer = () => store.get(KEY, { type: 'json' });
  const versionDe = doc => doc ? (doc.rev || 'v0') : '';

  if (req.method === 'GET') {
    const doc = await leer();
    if (!doc) return json(404, {});
    return json(200, { etag: versionDe(doc), trabajos: doc.trabajos || [] });
  }

  if (req.method === 'PUT') {
    const body = await req.json().catch(() => ({}));
    if (!Array.isArray(body.trabajos)) return json(400, { error: 'Formato inválido' });
    // Solo guarda si nadie más guardó desde la última lectura de este equipo
    if ((body.etag || '') !== versionDe(await leer())) return json(412, {});
    const doc = { version: 1, rev: crypto.randomUUID(), actualizado: new Date().toISOString(), trabajos: body.trabajos };
    await store.setJSON(KEY, doc);
    // Respaldo diario automático (queda la última versión de cada día)
    await store.setJSON('respaldos/' + doc.actualizado.slice(0, 10), doc)
      .catch(e => console.warn('No se pudo escribir el respaldo:', e));
    return json(200, { etag: doc.rev });
  }

  return json(405, {});
};

export const config = { path: '/api/datos' };
