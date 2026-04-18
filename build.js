/**
 * build.js — Generador de config.js para Netlify
 *
 * Netlify ejecuta este script antes del despliegue (ver netlify.toml).
 * Lee la variable de entorno OWM_API_KEY del panel de Netlify y escribe
 * config.js en la raíz del proyecto, de modo que el archivo nunca
 * necesita existir en el repositorio.
 *
 * Para configurarla en Netlify:
 *   Site Settings → Environment variables → Add variable
 *   Key: OWM_API_KEY  |  Value: <tu API key de OpenWeatherMap>
 */

const fs  = require('fs');
const key = process.env.OWM_API_KEY;

if (!key) {
  console.error('[build.js] ERROR: La variable de entorno OWM_API_KEY no está definida.');
  console.error('           Agrégala en Netlify → Site Settings → Environment variables.');
  process.exit(1);
}

const content = `// Archivo generado automáticamente por build.js — no editar manualmente.
const CONFIG = {
  API_KEY:  '${key}',
  BASE_URL: 'https://api.openweathermap.org'
};
`;

fs.writeFileSync('config.js', content, 'utf8');
console.log('[build.js] config.js generado correctamente.');
