import { supabase } from './supabaseClient.js';

let initialized = false;
let cacheStock = [];

export async function initStock() {
  const section = document.getElementById('section-stock');

  if (!initialized) {
    section.innerHTML = `
      <div class="section-header">
        <h2>Stock</h2>
        <button id="btn-imprimir-qrs" class="btn btn-secondary">Imprimir QR de todos los productos</button>
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
      </div>

      <div id="etiquetas-print" class="hidden"></div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>SKU</th><th>Descripción</th><th>Tipo</th><th>Color</th>
              <th>Stock total</th><th>Stock laqueado</th><th></th>
            </tr>
          </thead>
          <tbody id="stock-tbody"></tbody>
        </table>
      </div>
    `;

    document.getElementById('btn-imprimir-qrs').addEventListener('click', imprimirTodosLosQr);
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
  tbody.innerHTML = '<tr><td colspan="7">Cargando...</td></tr>';

  const { data, error } = await supabase
    .from('stock_actual')
    .select('*')
    .order('sku');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7">Error al cargar: ${escapeHtml(error.message)}</td></tr>`;
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
    tbody.innerHTML = '<tr><td colspan="7">No hay artículos que coincidan con el filtro.</td></tr>';
    return;
  }

  tbody.innerHTML = filtradas.map(r => `
    <tr data-inventario-id="${r.inventario_id}">
      <td>${escapeHtml(r.sku)}</td>
      <td>${escapeHtml(r.descripcion || '-')}</td>
      <td>${escapeHtml(r.tipo || '-')}</td>
      <td>${colorLabel(r.color)}</td>
      <td>${r.stock_total}</td>
      <td>${r.stock_laqueado}</td>
      <td>
        <button class="btn btn-text btn-sm" data-qr="${r.inventario_id}" data-sku="${escapeAttr(r.sku)}">Ver QR</button>
        <button class="btn btn-text btn-sm" data-laquear="${r.inventario_id}" data-sku="${escapeAttr(r.sku)}">+ Laqueado</button>
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
    <input type="number" min="0.01" step="1" placeholder="Cantidad" style="width:90px">
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

async function imprimirTodosLosQr() {
  const { data, error } = await supabase
    .from('inventario')
    .select('sku, descripcion')
    .eq('activo', true)
    .order('sku');

  if (error) {
    alert('No se pudo generar la hoja: ' + error.message);
    return;
  }
  if (!data.length) {
    alert('No hay artículos activos en el inventario.');
    return;
  }

  const contenedor = document.getElementById('etiquetas-print');
  contenedor.classList.remove('hidden');
  contenedor.innerHTML = data.map((item, i) => `
    <div class="etiqueta">
      <canvas id="qr-hoja-${i}"></canvas>
      <span>${escapeHtml(item.sku)}</span>
    </div>
  `).join('');

  data.forEach((item, i) => {
    QRCode.toCanvas(document.getElementById(`qr-hoja-${i}`), item.sku, { width: 110 }, (err) => {
      if (err) console.error('Error generando QR:', err);
    });
  });

  setTimeout(() => window.print(), 200);
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
