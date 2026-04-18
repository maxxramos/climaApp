/* ═══════════════════════════════════════════════════════════════════════
   climaApp — app.js
   Lógica principal: búsqueda, API, gráfico, favoritos, tema
   ═══════════════════════════════════════════════════════════════════════ */

// ── Estado global ──────────────────────────────────────────────────────
let currentCity    = null;   // { name, country, lat, lon }
let tempChart      = null;   // Instancia activa de Chart.js
let autocompleteData = [];   // Últimas sugerencias de ciudades
let activeIndex    = -1;     // Índice de navegación por teclado en dropdown
let debounceTimer  = null;   // Timer del debounce de búsqueda

// ── Referencias al DOM ─────────────────────────────────────────────────
const searchInput      = document.getElementById('search-input');
const autocompleteList = document.getElementById('autocomplete-list');
const errorMessage     = document.getElementById('error-message');
const loadingSpinner   = document.getElementById('loading-spinner');
const weatherDisplay   = document.getElementById('weather-display');
const themeToggle      = document.getElementById('theme-toggle');
const themeIconWrap    = document.getElementById('theme-icon-wrap');
const favoriteBtn      = document.getElementById('favorite-btn');
const favoriteIconWrap = document.getElementById('favorite-icon-wrap');
const favoritesList    = document.getElementById('favorites-list');

// ── Inicialización ─────────────────────────────────────────────────────
(function init() {
  if (typeof CONFIG === 'undefined' || !CONFIG.API_KEY || CONFIG.API_KEY === 'TU_API_KEY_AQUI') {
    console.error('[climaApp] config.js no está cargado o la API key no está configurada.');
    document.getElementById('error-message').textContent =
      'Error de configuración: falta la API key. Si eres el administrador, revisa config.js o las variables de entorno en Netlify.';
    document.getElementById('error-message').classList.add('visible');
  }
  lucide.createIcons();
  loadTheme();
  renderFavorites();
  attachEventListeners();
})();

/* ════════════════════════════════════════════════════════════════════════
   TEMA (modo oscuro / claro)
   ════════════════════════════════════════════════════════════════════════ */

function loadTheme() {
  const stored      = localStorage.getItem('climaapp-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark      = stored ? stored === 'dark' : prefersDark;
  if (isDark) applyDark();
}

function applyDark() {
  document.body.classList.add('dark-mode');
  themeIconWrap.innerHTML = '<i data-lucide="sun"></i>';
  lucide.createIcons();
  themeToggle.setAttribute('aria-label', 'Cambiar a modo claro');
}

function applyLight() {
  document.body.classList.remove('dark-mode');
  themeIconWrap.innerHTML = '<i data-lucide="moon"></i>';
  lucide.createIcons();
  themeToggle.setAttribute('aria-label', 'Cambiar a modo oscuro');
}

function toggleTheme() {
  const isDark = document.body.classList.contains('dark-mode');
  if (isDark) {
    applyLight();
    localStorage.setItem('climaapp-theme', 'light');
  } else {
    applyDark();
    localStorage.setItem('climaapp-theme', 'dark');
  }
  if (tempChart) updateChartTheme();
}

/* ════════════════════════════════════════════════════════════════════════
   EVENT LISTENERS
   ════════════════════════════════════════════════════════════════════════ */

function attachEventListeners() {
  themeToggle.addEventListener('click', toggleTheme);
  favoriteBtn.addEventListener('click', handleFavoriteToggle);

  // Input de búsqueda: debounce de 400ms
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    clearTimeout(debounceTimer);
    if (query.length < 2) { closeDropdown(); return; }
    debounceTimer = setTimeout(() => fetchCitySuggestions(query), 400);
  });

  // Navegación por teclado en el dropdown
  searchInput.addEventListener('keydown', handleKeydown);

  // Cerrar dropdown al hacer clic fuera
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) closeDropdown();
  });
}

/* ════════════════════════════════════════════════════════════════════════
   BÚSQUEDA Y AUTOCOMPLETADO
   ════════════════════════════════════════════════════════════════════════ */

async function fetchCitySuggestions(query) {
  try {
    if (typeof CONFIG === 'undefined') throw new Error('config.js no está cargado. Verifica el despliegue.');
    const url = `${CONFIG.BASE_URL}/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${CONFIG.API_KEY}`;
    const res = await fetch(url);
    if (res.status === 401) throw new Error('API key inválida. Edita config.js con tu clave de OpenWeatherMap.');
    if (!res.ok) throw new Error(`Error al buscar ciudades (${res.status}).`);
    const data = await res.json();
    autocompleteData = data;
    renderDropdown(data);
  } catch (err) {
    console.error('[fetchCitySuggestions]', err);
    closeDropdown();
    showError(err.message || 'No se pudo conectar con el servicio de búsqueda.');
    setTimeout(hideError, 4000);
  }
}

function renderDropdown(cities) {
  if (!cities.length) { closeDropdown(); return; }

  autocompleteList.innerHTML = '';
  activeIndex = -1;

  cities.forEach((city) => {
    const li   = document.createElement('li');
    const state = city.state ? `, ${city.state}` : '';

    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.innerHTML = `
      <span class="city-suggestion-name">${escapeHtml(city.name)}${escapeHtml(state)}</span>
      <span class="city-suggestion-country">${escapeHtml(city.country)}</span>
    `;
    li.addEventListener('click', () => selectCity(city));
    autocompleteList.appendChild(li);
  });

  autocompleteList.classList.add('visible');
}

function handleKeydown(e) {
  const items = autocompleteList.querySelectorAll('li');
  if (!items.length) return;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      highlightItem(items);
      break;
    case 'ArrowUp':
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      highlightItem(items);
      break;
    case 'Enter':
      e.preventDefault();
      if (activeIndex >= 0 && autocompleteData[activeIndex]) {
        selectCity(autocompleteData[activeIndex]);
      }
      break;
    case 'Escape':
      closeDropdown();
      break;
  }
}

function highlightItem(items) {
  items.forEach((item, i) => {
    const isActive = i === activeIndex;
    item.classList.toggle('active', isActive);
    item.setAttribute('aria-selected', String(isActive));
  });
}

function closeDropdown() {
  autocompleteList.classList.remove('visible');
  autocompleteList.innerHTML = '';
  activeIndex = -1;
}

async function selectCity(city) {
  closeDropdown();
  searchInput.value = `${city.name}, ${city.country}`;
  currentCity = { name: city.name, country: city.country, lat: city.lat, lon: city.lon };
  await loadWeatherData(city.lat, city.lon);
}

/* ════════════════════════════════════════════════════════════════════════
   CARGA DE DATOS DE CLIMA (orquestador)
   ════════════════════════════════════════════════════════════════════════ */

async function loadWeatherData(lat, lon) {
  showLoading();
  hideError();
  hideWeather();

  try {
    const [current, forecast] = await Promise.all([
      fetchCurrentWeather(lat, lon),
      fetchForecast(lat, lon)
    ]);
    renderCurrentWeather(current);
    renderChart(forecast);
    showWeather();
  } catch (err) {
    showError(err.message || 'Error al obtener el clima. Verifica tu conexión e inténtalo de nuevo.');
  } finally {
    hideLoading();
  }
}

/* ════════════════════════════════════════════════════════════════════════
   LLAMADAS A LA API DE OPENWEATHERMAP
   ════════════════════════════════════════════════════════════════════════ */

async function fetchCurrentWeather(lat, lon) {
  const url = `${CONFIG.BASE_URL}/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${CONFIG.API_KEY}&units=metric&lang=es`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 401) throw new Error('API key inválida. Edita config.js con tu clave de OpenWeatherMap.');
    if (res.status === 429) throw new Error('Límite de peticiones alcanzado. Espera un momento e intenta de nuevo.');
    throw new Error('No se pudo obtener el clima actual.');
  }
  return res.json();
}

async function fetchForecast(lat, lon) {
  const url = `${CONFIG.BASE_URL}/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${CONFIG.API_KEY}&units=metric&lang=es`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 401) throw new Error('API key inválida. Edita config.js con tu clave de OpenWeatherMap.');
    if (res.status === 429) throw new Error('Límite de peticiones alcanzado. Espera un momento e intenta de nuevo.');
    throw new Error('No se pudo obtener el pronóstico.');
  }
  return res.json();
}

/* ════════════════════════════════════════════════════════════════════════
   RENDERIZADO — CLIMA ACTUAL
   ════════════════════════════════════════════════════════════════════════ */

function renderCurrentWeather(data) {
  document.getElementById('city-name').textContent        = `${data.name}, ${data.sys.country}`;
  document.getElementById('city-date').textContent        = formatDate(new Date());
  document.getElementById('temperature').textContent      = Math.round(data.main.temp);
  document.getElementById('weather-description').textContent = data.weather[0].description;
  document.getElementById('feels-like').textContent       = `${Math.round(data.main.feels_like)}°C`;
  document.getElementById('humidity').textContent         = `${data.main.humidity}%`;
  document.getElementById('wind-speed').textContent       = `${Math.round(data.wind.speed * 3.6)} km/h`;
  document.getElementById('pressure').textContent         = `${data.main.pressure} hPa`;

  const icon = document.getElementById('weather-icon');
  icon.src = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
  icon.alt = data.weather[0].description;

  updateFavoriteButton();
}

function formatDate(date) {
  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric'
  });
}

/* ════════════════════════════════════════════════════════════════════════
   GRÁFICO DE TEMPERATURA 24H — Chart.js
   ════════════════════════════════════════════════════════════════════════ */

function renderChart(forecastData) {
  // Primeros 8 slots = cada 3h → 24 horas
  const slots  = forecastData.list.slice(0, 8);
  const labels = slots.map(s => {
    const d = new Date(s.dt * 1000);
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  });
  const temps = slots.map(s => parseFloat(s.main.temp.toFixed(1)));

  const ctx    = document.getElementById('temp-chart').getContext('2d');
  const isDark = document.body.classList.contains('dark-mode');

  // Destruir instancia previa para evitar memory leaks
  if (tempChart) { tempChart.destroy(); tempChart = null; }

  const { gradient, lineColor, gridColor, tickColor, tooltipBg, tooltipTitle, tooltipBody, tooltipBorder } = getChartColors(ctx, isDark);

  tempChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label:                'Temperatura (°C)',
        data:                 temps,
        fill:                 true,
        backgroundColor:      gradient,
        borderColor:          lineColor,
        borderWidth:          2.5,
        pointBackgroundColor: lineColor,
        pointBorderColor:     isDark ? '#1e293b' : '#ffffff',
        pointBorderWidth:     2,
        pointRadius:          5,
        pointHoverRadius:     7,
        tension:              0.4
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor:      tooltipTitle,
          bodyColor:       tooltipBody,
          borderColor:     tooltipBorder,
          borderWidth:     1,
          padding:         10,
          callbacks: {
            label: (ctx) => `  ${ctx.parsed.y}°C`
          }
        }
      },
      scales: {
        x: {
          grid:  { color: gridColor },
          ticks: { color: tickColor, font: { size: 11 } }
        },
        y: {
          grid:  { color: gridColor },
          ticks: {
            color:    tickColor,
            font:     { size: 11 },
            callback: (v) => `${v}°`
          }
        }
      }
    }
  });
}

function getChartColors(ctx, isDark) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 280);
  if (isDark) {
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0)');
  } else {
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.4)');
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0)');
  }
  return {
    gradient,
    lineColor:    '#38bdf8',
    gridColor:    isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
    tickColor:    isDark ? '#94a3b8' : '#64748b',
    tooltipBg:    isDark ? 'rgba(12,20,38,0.95)' : 'rgba(255,255,255,0.95)',
    tooltipTitle: isDark ? '#f1f5f9' : '#0f172a',
    tooltipBody:  isDark ? '#94a3b8' : '#64748b',
    tooltipBorder:isDark ? 'rgba(56,189,248,0.2)' : 'rgba(56,189,248,0.25)'
  };
}

// Actualiza los colores del gráfico al cambiar el tema (sin re-fetch)
function updateChartTheme() {
  if (!tempChart) return;
  const ctx    = document.getElementById('temp-chart').getContext('2d');
  const isDark = document.body.classList.contains('dark-mode');
  const c      = getChartColors(ctx, isDark);

  const ds = tempChart.data.datasets[0];
  ds.backgroundColor      = c.gradient;
  ds.borderColor          = c.lineColor;
  ds.pointBackgroundColor = c.lineColor;
  ds.pointBorderColor     = isDark ? '#1e293b' : '#ffffff';

  tempChart.options.scales.x.grid.color  = c.gridColor;
  tempChart.options.scales.x.ticks.color = c.tickColor;
  tempChart.options.scales.y.grid.color  = c.gridColor;
  tempChart.options.scales.y.ticks.color = c.tickColor;

  const tt = tempChart.options.plugins.tooltip;
  tt.backgroundColor = c.tooltipBg;
  tt.titleColor      = c.tooltipTitle;
  tt.bodyColor       = c.tooltipBody;
  tt.borderColor     = c.tooltipBorder;

  tempChart.update();
}

/* ════════════════════════════════════════════════════════════════════════
   FAVORITOS — LocalStorage
   ════════════════════════════════════════════════════════════════════════ */

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem('climaapp-favorites')) || [];
  } catch {
    return [];
  }
}

function saveFavorites(favs) {
  localStorage.setItem('climaapp-favorites', JSON.stringify(favs));
}

function handleFavoriteToggle() {
  if (!currentCity) return;
  const favs   = getFavorites();
  const index  = favs.findIndex(f => f.lat === currentCity.lat && f.lon === currentCity.lon);

  if (index >= 0) {
    favs.splice(index, 1);
  } else {
    if (favs.length >= 8) {
      showError('Máximo 8 ciudades favoritas. Elimina una antes de agregar.');
      setTimeout(hideError, 3000);
      return;
    }
    favs.push({ ...currentCity });
  }

  saveFavorites(favs);
  renderFavorites();
  updateFavoriteButton();
}

function updateFavoriteButton() {
  if (!currentCity) return;
  const isFav = getFavorites().some(f => f.lat === currentCity.lat && f.lon === currentCity.lon);
  favoriteBtn.classList.toggle('active', isFav);
  favoriteBtn.setAttribute('aria-label', isFav ? 'Quitar de favoritos' : 'Agregar a favoritos');
}

function renderFavorites() {
  const favs = getFavorites();
  favoritesList.innerHTML = '';

  favs.forEach(city => {
    const chip = document.createElement('div');
    chip.className = 'favorite-chip';

    const label = document.createElement('button');
    label.className   = 'chip-label';
    label.textContent = `${city.name}, ${city.country}`;
    label.setAttribute('aria-label', `Ver clima de ${city.name}`);
    label.addEventListener('click', () => {
      currentCity        = { ...city };
      searchInput.value  = `${city.name}, ${city.country}`;
      loadWeatherData(city.lat, city.lon);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'chip-remove';
    removeBtn.innerHTML = '<i data-lucide="x"></i>';
    removeBtn.setAttribute('aria-label', `Eliminar ${city.name} de favoritos`);
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFavorite(city.lat, city.lon);
    });

    chip.appendChild(label);
    chip.appendChild(removeBtn);
    favoritesList.appendChild(chip);
  });
  lucide.createIcons();
}

function removeFavorite(lat, lon) {
  const updated = getFavorites().filter(f => !(f.lat === lat && f.lon === lon));
  saveFavorites(updated);
  renderFavorites();
  if (currentCity && currentCity.lat === lat && currentCity.lon === lon) {
    updateFavoriteButton();
  }
}

/* ════════════════════════════════════════════════════════════════════════
   HELPERS DE UI
   ════════════════════════════════════════════════════════════════════════ */

function showLoading()  { loadingSpinner.classList.add('visible');    }
function hideLoading()  { loadingSpinner.classList.remove('visible'); }
function showWeather()  { weatherDisplay.classList.add('visible'); document.body.classList.add('searched'); }
function hideWeather()  { weatherDisplay.classList.remove('visible'); }
function hideError()    { errorMessage.classList.remove('visible'); errorMessage.textContent = ''; }

function showError(msg) {
  errorMessage.textContent = msg;
  errorMessage.classList.add('visible');
}

// Prevención básica de XSS al insertar texto de la API en el DOM
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
