import { supabase } from './supabaseClient.js';

let initialized = false;
let cacheRecepciones = [];
let cacheOrdenesAbiertas = [];
let cacheInventario = [];
let scanner = null;

export async function initRecepciones() {
  const section = document.getElementById('section-recepciones');

  if (!initialized) {
    section.innerHTML = `
      <div class="section-header">
        <h2>Recepciones</h2>
        <div>
          <button id="btn-recepcion-rapida" class="btn btn-primary">+ Recepción rápida (escanear producto)</button>
          <button id="btn-nueva-recepcion" class="btn btn-secondary">+ Nueva recepción (por orden)</button>
        </div>
      </div>
      <div id="recepcion-rapida-wrap" class="form-card hidden"></div>
      <div id="recepcion-form-wrap" class="form-card hidden"></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Fecha</th><th>Proveedor</th><th>Orden</th><th>Notas</th></tr>
          </thead>
          <tbody id="recepciones-tbody"></tbody>
        </table>
      </div>
    `;
    document.getElementById('btn-nueva-recepcion').addEventListener('click', () => openFormOrden());
    document.getElementById('btn-recepcion-rapida').addEventListener('click', () => openFormRapida());
    initialized = true;
  }

  await loadInventario();
  await loadRecepciones();
}

async function loadInventario() {
  const { data, error } = await supabase
    .from('inventario')
    .select('id, sku, descripcion')
    .eq('activo', true)
    .order('sku');
  cacheInventario = error ? [] : (data || []);
}

async function loadOrdenesAbiertas() {
  const { data, error } = await supabase
    .from('ordenes_compra')
    .select('id, proveedor_id, tipo, fecha_pedido, estado, proveedores(nombre)')
    .in('estado', ['pendiente', 'parcial'])
    .order('fecha_pedido', { ascending: false });
  cacheOrdenesAbiertas = error ? [] : (data || []);
}

async function loadRecepciones() {
  const tbody = document.getElementById('recepciones-tbody');
  tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';

  const { data, error } = await supabase
    .from('recepciones')
    .select('*, proveedores(nombre), ordenes_compra(tipo)')
    .order('fecha_recepcion', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4">Error al cargar: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  cacheRecepciones = data || [];

  if (!cacheRecepciones.length) {
    tbody.innerHTML = '<tr><td colspan="4">Todavía no hay recepciones registradas.</td></tr>';
    return;
  }

  tbody.innerHTML = cacheRecepciones.map(r => `
    <tr>
      <td>${formatFecha(r.fecha_recepcion)}</td>
      <td>${escapeHtml(r.proveedores?.nombre || '-')}</td>
      <td>${tipoOcLabel(r.ordenes_compra?.tipo)}</td>
      <td>${escapeHtml(r.notas || '-')}</td>
    </tr>
  `).join('');
}

function tipoOcLabel(tipo) {
  const labels = { carpinteria: 'Carpintería', pintura: 'Pintura', laqueado: 'Laqueado', otro: 'Otro' };
  return labels[tipo] || (tipo || '-');
}

// ===================================================================
// RECEPCIÓN RÁPIDA: escanear/elegir un producto, tipear cantidad,
// el sistema reparte solo entre las órdenes abiertas por antigüedad.
// ===================================================================
function openFormRapida() {
  document.getElementById('recepcion-form-wrap').classList.add('hidden');
  loadOrdenesAbiertas();
  const wrap = document.getElementById('recepcion-rapida-wrap');
  wrap.classList.remove('hidden');

  const inventarioOptions = cacheInventario.map(i =>
    `<option value="${i.id}">${escapeHtml(i.sku)}${i.descripcion ? ' - ' + escapeHtml(i.descripcion) : ''}</option>`
  ).join('');

  wrap.innerHTML = `
    <h3>Recepción rápida</h3>
    <div class="form-actions" style="margin-bottom: 1rem;">
      <button type="button" id="btn-escanear-rapida" class="btn btn-secondary">Escanear con la cámara</button>
    </div>
    <div id="scanner-rapida-wrap" class="hidden"></div>
    <form id="form-rapida" class="form-grid">
      <label class="full">Producto *
        <select name="inventario_id" id="select-producto-rapida" required>
          <option value="">- Elegir -</option>
          ${inventarioOptions}
        </select>
      </label>
      <label>Cantidad recibida *
        <input name="cantidad" type="number" min="0.01" step="1" required>
      </label>
      <label>De esa cantidad, ¿cuántas ya vienen laqueadas?
        <input name="cantidad_laqueada" type="number" min="0" step="1" value="0">
      </label>
      <label>Fecha de recepción
        <input name="fecha_recepcion" type="date" value="${new Date().toISOString().slice(0, 10)}">
      </label>
      <label class="full">Notas
        <textarea name="notas"></textarea>
      </label>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Registrar recepción</button>
        <button type="button" id="btn-cancelar-rapida" class="btn btn-secondary">Cancelar</button>
      </div>
    </form>
    <div id="resultado-rapida"></div>
  `;

  document.getElementById('btn-escanear-rapida').addEventListener('click', toggleScanner);
  document.getElementById('btn-cancelar-rapida').addEventListener('click', () => {
    detenerScanner();
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
  });
  document.getElementById('form-rapida').addEventListener('submit', saveRecepcionRapida);
}

async function toggleScanner() {
  const wrap = document.getElementById('scanner-rapida-wrap');

  if (!wrap.classList.contains('hidden')) {
    await detenerScanner();
    return;
  }

  wrap.classList.remove('hidden');
  wrap.innerHTML = `
    <div id="qr-reader" style="max-width: 320px; margin: 0.5rem 0;"></div>
    <button type="button" id="btn-cancelar-scan" class="btn btn-text btn-sm">Cancelar escaneo</button>
  `;
  document.getElementById('btn-cancelar-scan').addEventListener('click', detenerScanner);

  scanner = new Html5Qrcode('qr-reader');
  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 220 },
      async (decodedText) => {
        const sku = decodedText.trim();
        await detenerScanner();
        const item = cacheInventario.find(i => i.sku === sku);
        if (!item) {
          alert(`No se encontró ningún artículo activo con el SKU "${sku}".`);
          return;
        }
        document.getElementById('select-producto-rapida').value = item.id;
      },
      () => {} // se llama por cada cuadro sin QR detectado, no es un error real
    );
  } catch (err) {
    wrap.innerHTML = `<p class="proximamente">No se pudo acceder a la cámara: ${escapeHtml(err.message || String(err))}</p>`;
  }
}

async function detenerScanner() {
  const wrap = document.getElementById('scanner-rapida-wrap');
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

async function saveRecepcionRapida(e) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);

  const inventarioId = fd.get('inventario_id');
  const cantidad = parseFloat(fd.get('cantidad'));
  const cantidadLaqueada = parseFloat(fd.get('cantidad_laqueada')) || 0;

  if (!inventarioId || !cantidad || cantidad <= 0) {
    alert('Elegí un producto y una cantidad válida.');
    return;
  }
  if (cantidadLaqueada > cantidad) {
    alert('La cantidad laqueada no puede ser mayor a la cantidad recibida.');
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Registrando...';

  const { data: asignaciones, error } = await supabase.rpc('fn_recibir_producto', {
    p_inventario_id: inventarioId,
    p_cantidad: cantidad,
    p_fecha_recepcion: fd.get('fecha_recepcion') || null,
    p_notas: fd.get('notas') || null,
  });

  if (error) {
    alert('No se pudo registrar la recepción: ' + error.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Registrar recepción';
    return;
  }

  if (cantidadLaqueada > 0) {
    await supabase.from('movimientos_stock').insert({
      inventario_id: inventarioId,
      tipo: 'ingreso_laqueado',
      cantidad: cantidadLaqueada,
      notas: 'Registrado junto con la recepción rápida',
    });
  }

  mostrarResultadoRapida(asignaciones || []);
  form.reset();
  submitBtn.disabled = false;
  submitBtn.textContent = 'Registrar recepción';
  await loadOrdenesAbiertas();
  await loadRecepciones();
}

function mostrarResultadoRapida(asignaciones) {
  const wrap = document.getElementById('resultado-rapida');
  if (!asignaciones.length) {
    wrap.innerHTML = '<p class="proximamente">Recepción registrada.</p>';
    return;
  }

  const conOrden = asignaciones.filter(a => a.orden_compra_id);
  const sinOrden = asignaciones.filter(a => !a.orden_compra_id);

  let html = '<div class="form-card"><p><strong>Recepción registrada.</strong> Reparto por antigüedad:</p><ul>';
  conOrden.forEach(a => {
    html += `<li>${a.cantidad_asignada} unidades asignadas a la orden de compra del ${formatOrdenFecha(a.orden_compra_id)}</li>`;
  });
  sinOrden.forEach(a => {
    html += `<li>${a.cantidad_asignada} unidades sin orden de compra asociada (ingresaron directo al stock)</li>`;
  });
  html += '</ul></div>';
  wrap.innerHTML = html;
}

function formatOrdenFecha(ocId) {
  const oc = cacheOrdenesAbiertas.find(o => o.id === ocId);
  return oc ? formatFecha(oc.fecha_pedido) : ocId;
}

// ===================================================================
// RECEPCIÓN MANUAL POR ORDEN (precisión cuando ya sabés de qué orden es)
// ===================================================================
async function openFormOrden() {
  document.getElementById('recepcion-rapida-wrap').classList.add('hidden');
  await loadOrdenesAbiertas();

  const wrap = document.getElementById('recepcion-form-wrap');
  wrap.classList.remove('hidden');

  const ordenOptions = cacheOrdenesAbiertas.map(oc =>
    `<option value="${oc.id}">${escapeHtml(oc.proveedores?.nombre || '-')} - ${tipoOcLabel(oc.tipo)} - ${formatFecha(oc.fecha_pedido)}</option>`
  ).join('');

  wrap.innerHTML = `
    <h3>Nueva recepción por orden</h3>
    <form id="recepcion-form" class="form-grid">
      <label class="full">Orden de compra *
        <select name="orden_compra_id" id="select-oc" required>
          <option value="">- Elegir -</option>
          ${ordenOptions}
        </select>
      </label>
      <label>Fecha de recepción
        <input name="fecha_recepcion" type="date" value="${new Date().toISOString().slice(0, 10)}">
      </label>
      <label class="full">Notas
        <textarea name="notas"></textarea>
      </label>

      <div class="full" id="recepcion-items-wrap"></div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary" disabled>Guardar recepción</button>
        <button type="button" id="btn-cancelar-recepcion" class="btn btn-secondary">Cancelar</button>
      </div>
    </form>
  `;

  if (!cacheOrdenesAbiertas.length) {
    document.getElementById('recepcion-items-wrap').innerHTML =
      '<p class="proximamente">No hay órdenes de compra pendientes o parciales para recibir.</p>';
  }

  document.getElementById('select-oc').addEventListener('change', cargarItemsDeOrden);
  document.getElementById('btn-cancelar-recepcion').addEventListener('click', () => {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
  });
  document.getElementById('recepcion-form').addEventListener('submit', saveRecepcionOrden);
}

async function cargarItemsDeOrden(e) {
  const ocId = e.target.value;
  const itemsWrap = document.getElementById('recepcion-items-wrap');
  const submitBtn = document.querySelector('#recepcion-form button[type="submit"]');

  if (!ocId) {
    itemsWrap.innerHTML = '';
    submitBtn.disabled = true;
    return;
  }

  itemsWrap.innerHTML = '<p class="proximamente">Cargando ítems...</p>';

  const { data: items, error } = await supabase
    .from('ordenes_compra_items')
    .select('*, inventario(sku, descripcion)')
    .eq('orden_compra_id', ocId);

  if (error) {
    itemsWrap.innerHTML = `<p class="proximamente">Error: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const pendientes = (items || []).filter(it => it.cantidad_pedida - it.cantidad_recibida > 0);

  if (!pendientes.length) {
    itemsWrap.innerHTML = '<p class="proximamente">Esta orden no tiene ítems pendientes.</p>';
    submitBtn.disabled = true;
    return;
  }

  itemsWrap.innerHTML = `
    <h3>Ítems pendientes</h3>
    <table class="data-table">
      <thead>
        <tr><th>Artículo</th><th>Pedido</th><th>Recibido hasta ahora</th><th>Pendiente</th><th>Recibir ahora</th></tr>
      </thead>
      <tbody>
        ${pendientes.map(it => {
          const pendiente = it.cantidad_pedida - it.cantidad_recibida;
          return `
            <tr>
              <td>${escapeHtml(it.inventario?.sku || it.descripcion_personalizada || '-')}</td>
              <td>${it.cantidad_pedida}</td>
              <td>${it.cantidad_recibida}</td>
              <td>${pendiente.toFixed(2)}</td>
              <td><input type="number" min="0" max="${pendiente}" step="0.01" data-cantidad-recibir="${it.id}" value="0" style="width:90px"></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
  submitBtn.disabled = false;
}

async function saveRecepcionOrden(e) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const ocId = fd.get('orden_compra_id');

  const oc = cacheOrdenesAbiertas.find(o => o.id === ocId);
  if (!oc) {
    alert('Elegí una orden de compra válida.');
    return;
  }

  const inputs = document.querySelectorAll('[data-cantidad-recibir]');
  const itemsARecibir = [];
  inputs.forEach(input => {
    const cantidad = parseFloat(input.value);
    if (cantidad > 0) {
      itemsARecibir.push({
        orden_compra_item_id: input.dataset.cantidadRecibir,
        cantidad_recibida: cantidad,
      });
    }
  });

  if (!itemsARecibir.length) {
    alert('Ingresá una cantidad mayor a 0 en al menos un ítem.');
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando...';

  const { data: recepcion, error: errRecepcion } = await supabase
    .from('recepciones')
    .insert({
      orden_compra_id: ocId,
      proveedor_id: oc.proveedor_id,
      fecha_recepcion: fd.get('fecha_recepcion') || null,
      notas: fd.get('notas') || null,
    })
    .select()
    .single();

  if (errRecepcion) {
    alert('No se pudo crear la recepción: ' + errRecepcion.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Guardar recepción';
    return;
  }

  const itemsConRecepcion = itemsARecibir.map(it => ({ ...it, recepcion_id: recepcion.id }));
  const { error: errItems } = await supabase.from('recepciones_items').insert(itemsConRecepcion);

  if (errItems) {
    alert('La recepción se creó pero hubo un error al guardar los ítems: ' + errItems.message);
  }

  document.getElementById('recepcion-form-wrap').classList.add('hidden');
  document.getElementById('recepcion-form-wrap').innerHTML = '';
  await loadRecepciones();
}

function formatFecha(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
