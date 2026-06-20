import { supabase } from './supabaseClient.js';
import QRCode from 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm';
import { tienePermiso } from './permisos.js';

let initialized = false;
let cacheStock = [];
let cacheInventario = [];
let scanner = null;
let puedeModificarStock = false;

export async function initStock() {
  const section = document.getElementById('section-stock');
  puedeModificarStock = tienePermiso(['supervisorAlmacen']);

  if (!initialized) {
    section.innerHTML = `
      <div class="section-header">
        <h2>Stock</h2>
        ${puedeModificarStock ? '<button id="btn-ajuste-stock" class="btn btn-secondary">Ajuste de stock (alta/baja)</button>' : ''}
      </div>

      <div id="ajuste-stock-wrap" class="form-card hidden"></div>

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
          <label>Laqueado (línea de producto)
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
        <div class="form-actions">
          <button type="button" id="btn-escanear-stock" class="btn btn-secondary btn-sm">Escanear con la cámara</button>
        </div>
        <div id="scanner-stock-wrap" class="hidden"></div>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>SKU</th><th>Descripción</th><th>Tipo</th><th>Color</th>
              <th>Almacén</th><th>Mercado Libre</th><th>Total</th><th>Laqueado</th><th></th>
            </tr>
          </thead>
          <tbody id="stock-tbody"></tbody>
        </table>
      </div>
    `;

    ['filtro-tipo', 'filtro-color', 'filtro-laqueado'].forEach(id =>
      document.getElementById(id).addEventListener('change', renderTabla)
    );
    document.getElementById('filtro-texto').addEventListener('input', renderTabla);
    document.getElementById('btn-escanear-stock').addEventListener('click', toggleScanner);
    if (puedeModificarStock) {
      document.getElementById('btn-ajuste-stock').addEventListener('click', toggleAjusteStock);
    }

    initialized = true;
  }

  await loadInventarioBasico();
  await loadStock();
}

async function loadInventarioBasico() {
  const { data, error } = await supabase
    .from('inventario')
    .select('id, sku, descripcion')
    .eq('activo', true)
    .order('sku');
  cacheInventario = error ? [] : (data || []);
}

async function loadStock() {
  const tbody = document.getElementById('stock-tbody');
  tbody.innerHTML = '<tr><td colspan="9">Cargando...</td></tr>';

  const { data, error } = await supabase
    .from('stock_actual')
    .select('*')
    .order('sku');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="9">Error al cargar: ${escapeHtml(error.message)}</td></tr>`;
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
    tbody.innerHTML = '<tr><td colspan="9">No hay artículos que coincidan con el filtro.</td></tr>';
    return;
  }

  tbody.innerHTML = filtradas.map(r => `
    <tr data-inventario-id="${r.inventario_id}">
      <td>${escapeHtml(r.sku)}</td>
      <td>${escapeHtml(r.descripcion || '-')}</td>
      <td>${escapeHtml(r.tipo || '-')}</td>
      <td>${colorLabel(r.color)}</td>
      <td>${r.stock_almacen}</td>
      <td>${r.stock_mercado_libre}</td>
      <td>${r.stock_total}</td>
      <td>${r.stock_laqueado}</td>
      <td>
        <button class="btn btn-text btn-sm" data-qr="${r.inventario_id}" data-sku="${escapeAttr(r.sku)}">Ver QR</button>
        ${puedeModificarStock ? `<button class="btn btn-text btn-sm" data-laquear="${r.inventario_id}" data-sku="${escapeAttr(r.sku)}">+ Laqueado</button>` : ''}
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-qr]').forEach(btn =>
    btn.addEventListener('click', () => mostrarQrIndividual(btn.dataset.qr, btn.dataset.sku))
  );
  tbody.querySelectorAll('[data-laquear]').forEach(btn =>
    btn.addEventListener('click', () => abrirFormularioLaqueado(btn))
  );
}

function mostrarQrIndividual(inventarioId, sku) {
  const fila = document.querySelector(`tr[data-inventario-id="${inventarioId}"]`);
  if (fila.querySelector('.qr-inline')) {
    fila.querySelector('.qr-inline').remove();
    return;
  }
  const celda = fila.lastElementChild;
  const wrap = document.createElement('div');
  wrap.className = 'qr-inline';
  wrap.innerHTML = `<canvas></canvas><div>${escapeHtml(sku)}</div>`;
  celda.appendChild(wrap);
  QRCode.toCanvas(wrap.querySelector('canvas'), sku, { width: 100 }, (err) => {
    if (err) console.error('Error generando QR:', err);
  });
}

function abrirFormularioLaqueado(btn) {
  const fila = btn.closest('tr');
  if (fila.querySelector('.laqueado-inline')) return;

  const wrap = document.createElement('div');
  wrap.className = 'laqueado-inline';
  wrap.innerHTML = `
    <input type="number" min="1" step="1" placeholder="Cantidad" style="width:90px">
    <button type="button" class="btn btn-text btn-sm" data-confirmar>Confirmar</button>
    <button type="button" class="btn btn-text btn-sm" data-cancelar>Cancelar</button>
  `;
  btn.closest('td').appendChild(wrap);

  wrap.querySelector('[data-cancelar]').addEventListener('click', () => wrap.remove());
  wrap.querySelector('[data-confirmar]').addEventListener('click', async () => {
    const cantidad = parseFloat(wrap.querySelector('input').value);
    if (!cantidad || cantidad <= 0) return;

    const { error } = await supabase.from('movimientos_stock').insert({
      inventario_id: btn.dataset.laquear,
      tipo: 'ingreso_laqueado',
      cantidad,
    });

    if (error) {
      alert('No se pudo registrar: ' + error.message);
      return;
    }
    await loadStock();
  });
}

// ===================================================================
// BÚSQUEDA POR ESCANEO DE QR (el QR contiene el SKU del producto)
// ===================================================================
async function toggleScanner() {
  const wrap = document.getElementById('scanner-stock-wrap');

  if (!wrap.classList.contains('hidden')) {
    await detenerScanner();
    return;
  }

  wrap.classList.remove('hidden');
  wrap.innerHTML = `
    <div id="qr-reader-stock" style="max-width: 320px; margin: 0.5rem 0;"></div>
    <button type="button" id="btn-cancelar-scan-stock" class="btn btn-text btn-sm">Cancelar escaneo</button>
  `;
  document.getElementById('btn-cancelar-scan-stock').addEventListener('click', detenerScanner);

  scanner = new Html5Qrcode('qr-reader-stock');
  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 220 },
      async (decodedText) => {
        await detenerScanner();
        document.getElementById('filtro-texto').value = decodedText.trim();
        renderTabla();
      },
      () => {} // se llama por cada cuadro sin QR detectado, no es un error real
    );
  } catch (err) {
    wrap.innerHTML = `<p class="proximamente">No se pudo acceder a la cámara: ${escapeHtml(err.message || String(err))}</p>`;
  }
}

async function detenerScanner() {
  const wrap = document.getElementById('scanner-stock-wrap');
  if (scanner) {
    try { await scanner.stop(); } catch (e) { /* ya estaba detenido */ }
    try { scanner.clear(); } catch (e) { /* nada que limpiar */ }
    scanner = null;
  }
  if (wrap) {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
  }
}

// ===================================================================
// AJUSTE DIRECTO DE STOCK (alta/baja manual, ej. para corregir errores)
// ===================================================================
function toggleAjusteStock() {
  const wrap = document.getElementById('ajuste-stock-wrap');
  if (!wrap.classList.contains('hidden')) {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
    return;
  }

  wrap.classList.remove('hidden');
  const inventarioOptions = cacheInventario.map(i =>
    `<option value="${i.id}">${escapeHtml(i.sku)}${i.descripcion ? ' - ' + escapeHtml(i.descripcion) : ''}</option>`
  ).join('');

  wrap.innerHTML = `
    <h3>Ajuste de stock</h3>
    <p class="ts">Usar solo para corregir diferencias entre el stock real y lo que muestra el sistema. No reemplaza una recepción ni una venta.</p>
    <form id="form-ajuste-stock" class="form-grid">
      <label class="full">Producto *
        <select name="inventario_id" required>
          <option value="">- Elegir -</option>
          ${inventarioOptions}
        </select>
      </label>
      <label>Tipo de ajuste *
        <select name="tipo" required>
          <option value="ajuste_positivo">Alta (suma stock)</option>
          <option value="ajuste_negativo">Baja (resta stock)</option>
        </select>
      </label>
      <label>Ubicación *
        <select name="ubicacion" required>
          <option value="almacen">Almacén</option>
          <option value="mercado_libre">Mercado Libre</option>
        </select>
      </label>
      <label>Cantidad *
        <input name="cantidad" type="number" min="1" step="1" required>
      </label>
      <label class="full">Motivo / notas
        <textarea name="notas" placeholder="ej: diferencia detectada en recuento físico"></textarea>
      </label>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Registrar ajuste</button>
        <button type="button" id="btn-cancelar-ajuste" class="btn btn-secondary">Cancelar</button>
      </div>
    </form>
  `;

  document.getElementById('btn-cancelar-ajuste').addEventListener('click', toggleAjusteStock);
  document.getElementById('form-ajuste-stock').addEventListener('submit', guardarAjusteStock);
}

async function guardarAjusteStock(e) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando...';

  const { error } = await supabase.from('movimientos_stock').insert({
    inventario_id: fd.get('inventario_id'),
    tipo: fd.get('tipo'),
    ubicacion: fd.get('ubicacion'),
    cantidad: parseFloat(fd.get('cantidad')),
    referencia_tipo: 'ajuste_manual',
    notas: fd.get('notas') || null,
  });

  if (error) {
    alert('No se pudo registrar el ajuste: ' + error.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Registrar ajuste';
    return;
  }

  toggleAjusteStock();
  await loadStock();
}

function colorLabel(color) {
  const labels = { natural: 'Natural', estandar: 'Estándar', chocolate: 'Chocolate', otro: 'Otro' };
  return labels[color] || (color ? escapeHtml(color) : '-');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}
