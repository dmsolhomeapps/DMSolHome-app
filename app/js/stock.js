import { supabase } from './supabaseClient.js';

let initialized = false;
let cacheStock = [];

export async function initStock() {
  const section = document.getElementById('section-stock');

  if (!initialized) {
    section.innerHTML = `
      <div class="section-header">
        <h2>Stock</h2>
      </div>

      <div class="form-card">
        <h3>Buscar unidad por código QR</h3>
        <form id="qr-search-form" class="form-grid">
          <label>Código (ej: U-000001)
            <input name="codigo" id="qr-input" placeholder="U-000001">
          </label>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Buscar</button>
            <button type="button" id="btn-escanear" class="btn btn-secondary">Escanear con la cámara</button>
          </div>
        </form>
        <div id="qr-scanner-wrap" class="hidden"></div>
        <div id="qr-result"></div>
      </div>

      <div class="form-card">
        <h3>Filtros</h3>
        <div class="form-grid">
          <label>Tipo
            <select id="filtro-tipo"><option value="">Todos</option></select>
          </label>
          <label>Color
            <select id="filtro-color">
              <option value="">Todos</option>
              <option value="natural">Natural</option>
              <option value="estandar">Estándar</option>
              <option value="chocolate">Chocolate</option>
              <option value="otro">Otro</option>
            </select>
          </label>
          <label>Laqueado
            <select id="filtro-laqueado">
              <option value="">Todos</option>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </label>
          <label>Buscar
            <input id="filtro-texto" placeholder="SKU o descripción">
          </label>
        </div>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>SKU</th><th>Descripción</th><th>Tipo</th><th>Color</th><th>Laqueado</th><th>Stock</th></tr>
          </thead>
          <tbody id="stock-tbody"></tbody>
        </table>
      </div>
    `;

    document.getElementById('qr-search-form').addEventListener('submit', buscarPorQr);
    document.getElementById('btn-escanear').addEventListener('click', toggleScanner);
    ['filtro-tipo', 'filtro-color', 'filtro-laqueado'].forEach(id =>
      document.getElementById(id).addEventListener('change', renderTabla)
    );
    document.getElementById('filtro-texto').addEventListener('input', renderTabla);

    initialized = true;
  }

  await loadStock();
}

async function loadStock() {
  const tbody = document.getElementById('stock-tbody');
  tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';

  const { data, error } = await supabase
    .from('stock_actual')
    .select('*')
    .order('sku');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6">Error al cargar: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  cacheStock = data || [];
  poblarFiltroTipo();
  renderTabla();
}

function poblarFiltroTipo() {
  const select = document.getElementById('filtro-tipo');
  const tipos = [...new Set(cacheStock.map(r => r.tipo).filter(Boolean))].sort();
  const actual = select.value;
  select.innerHTML = '<option value="">Todos</option>' +
    tipos.map(t => `<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join('');
  select.value = actual;
}

function renderTabla() {
  const tbody = document.getElementById('stock-tbody');
  const tipo = document.getElementById('filtro-tipo').value;
  const color = document.getElementById('filtro-color').value;
  const laqueado = document.getElementById('filtro-laqueado').value;
  const texto = document.getElementById('filtro-texto').value.trim().toLowerCase();

  const filtradas = cacheStock.filter(r => {
    if (tipo && r.tipo !== tipo) return false;
    if (color && r.color !== color) return false;
    if (laqueado === 'si' && !r.laqueado) return false;
    if (laqueado === 'no' && r.laqueado) return false;
    if (texto) {
      const haystack = `${r.sku} ${r.descripcion || ''}`.toLowerCase();
      if (!haystack.includes(texto)) return false;
    }
    return true;
  });

  if (!filtradas.length) {
    tbody.innerHTML = '<tr><td colspan="6">No hay artículos que coincidan con el filtro.</td></tr>';
    return;
  }

  tbody.innerHTML = filtradas.map(r => `
    <tr>
      <td>${escapeHtml(r.sku)}</td>
      <td>${escapeHtml(r.descripcion || '-')}</td>
      <td>${escapeHtml(r.tipo || '-')}</td>
      <td>${colorLabel(r.color)}</td>
      <td>${r.laqueado ? 'Sí' : 'No'}</td>
      <td>${r.stock}</td>
    </tr>
  `).join('');
}

let scanner = null;

async function toggleScanner() {
  const wrap = document.getElementById('qr-scanner-wrap');

  if (!wrap.classList.contains('hidden')) {
    await detenerScanner();
    return;
  }

  wrap.classList.remove('hidden');
  wrap.innerHTML = `
    <div id="qr-reader" style="max-width: 320px; margin: 0.5rem 0;"></div>
    <button type="button" id="btn-cancelar-scan" class="btn btn-text btn-sm">Cancelar</button>
  `;
  document.getElementById('btn-cancelar-scan').addEventListener('click', detenerScanner);

  scanner = new Html5Qrcode('qr-reader');
  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 220 },
      async (decodedText) => {
        document.getElementById('qr-input').value = decodedText.trim().toUpperCase();
        await detenerScanner();
        document.getElementById('qr-search-form').requestSubmit();
      },
      () => {} // se llama por cada cuadro sin QR detectado, no es un error real
    );
  } catch (err) {
    wrap.innerHTML = `<p class="proximamente">No se pudo acceder a la cámara: ${escapeHtml(err.message || String(err))}</p>`;
  }
}

async function detenerScanner() {
  const wrap = document.getElementById('qr-scanner-wrap');
  if (scanner) {
    try { await scanner.stop(); } catch (e) { /* ya estaba detenido */ }
    try { scanner.clear(); } catch (e) { /* nada que limpiar */ }
    scanner = null;
  }
  wrap.classList.add('hidden');
  wrap.innerHTML = '';
}

async function buscarPorQr(e) {
  e.preventDefault();
  const resultDiv = document.getElementById('qr-result');
  const codigo = (new FormData(e.target).get('codigo') || '').trim().toUpperCase();

  if (!codigo) return;

  resultDiv.innerHTML = '<p class="proximamente">Buscando...</p>';

  const { data, error } = await supabase
    .from('unidades')
    .select('*, inventario(sku, descripcion, tipo, color), pintor:proveedores(nombre)')
    .eq('codigo_qr', codigo)
    .maybeSingle();

  if (error) {
    resultDiv.innerHTML = `<p class="proximamente">Error: ${escapeHtml(error.message)}</p>`;
    return;
  }
  if (!data) {
    resultDiv.innerHTML = '<p class="proximamente">No se encontró ninguna unidad con ese código.</p>';
    return;
  }

  resultDiv.innerHTML = `
    <div class="form-card">
      <div class="qr-result-layout">
        <canvas id="qr-canvas"></canvas>
        <div>
          <p><strong>${escapeHtml(data.codigo_qr)}</strong> - ${escapeHtml(data.inventario?.sku || '-')}</p>
          <p>${escapeHtml(data.inventario?.descripcion || '')}</p>
          <p>Estado: ${estadoUnidadLabel(data.estado)}</p>
          <p>Ingresó: ${formatFechaHora(data.fecha_ingreso)}</p>
          <p>Pintado: ${data.pintado
            ? `Sí (${escapeHtml(data.pintor?.nombre || 'sin especificar')}${data.fecha_pintado ? ', ' + formatFechaHora(data.fecha_pintado) : ''})`
            : 'No'}</p>
          <p>Laqueado: ${data.laqueado
            ? `Sí${data.fecha_laqueado ? ' (' + formatFechaHora(data.fecha_laqueado) + ')' : ''}`
            : 'No'}</p>
          ${data.notas ? `<p>Notas: ${escapeHtml(data.notas)}</p>` : ''}
        </div>
      </div>
    </div>
  `;
  QRCode.toCanvas(document.getElementById('qr-canvas'), data.codigo_qr, { width: 140 }, (err) => {
    if (err) console.error('Error generando QR:', err);
  });
}

function estadoUnidadLabel(estado) {
  const labels = {
    en_stock: 'En stock', en_pintura: 'En pintura', en_laqueado: 'En laqueado',
    vendido: 'Vendido', reservado: 'Reservado', danado: 'Dañado', baja: 'Baja',
  };
  return labels[estado] || estado;
}

function colorLabel(color) {
  const labels = { natural: 'Natural', estandar: 'Estándar', chocolate: 'Chocolate', otro: 'Otro' };
  return labels[color] || (color ? escapeHtml(color) : '-');
}

function formatFechaHora(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('es-AR');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}
