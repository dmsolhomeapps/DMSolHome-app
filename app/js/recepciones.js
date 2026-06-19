import { supabase } from './supabaseClient.js';

let initialized = false;
let cacheRecepciones = [];
let cacheOrdenesAbiertas = [];

export async function initRecepciones() {
  const section = document.getElementById('section-recepciones');

  if (!initialized) {
    section.innerHTML = `
      <div class="section-header">
        <h2>Recepciones</h2>
        <button id="btn-nueva-recepcion" class="btn btn-primary">+ Nueva recepción</button>
      </div>
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
    document.getElementById('btn-nueva-recepcion').addEventListener('click', () => openForm());
    initialized = true;
  }

  await loadRecepciones();
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

async function openForm() {
  await loadOrdenesAbiertas();

  const wrap = document.getElementById('recepcion-form-wrap');
  wrap.classList.remove('hidden');

  const ordenOptions = cacheOrdenesAbiertas.map(oc =>
    `<option value="${oc.id}">${escapeHtml(oc.proveedores?.nombre || '-')} - ${tipoOcLabel(oc.tipo)} - ${formatFecha(oc.fecha_pedido)}</option>`
  ).join('');

  wrap.innerHTML = `
    <h3>Nueva recepción</h3>
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
  document.getElementById('recepcion-form').addEventListener('submit', saveRecepcion);
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

async function saveRecepcion(e) {
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
  const { data: insertedItems, error: errItems } = await supabase
    .from('recepciones_items')
    .insert(itemsConRecepcion)
    .select();

  if (errItems) {
    alert('La recepción se creó pero hubo un error al guardar los ítems: ' + errItems.message);
  }

  const wrap = document.getElementById('recepcion-form-wrap');

  if (insertedItems && insertedItems.length) {
    const { data: nuevasUnidades } = await supabase
      .from('unidades')
      .select('codigo_qr, inventario(sku)')
      .in('recepcion_item_id', insertedItems.map(i => i.id));

    if (nuevasUnidades && nuevasUnidades.length) {
      mostrarEtiquetas(wrap, nuevasUnidades);
      await loadRecepciones();
      return;
    }
  }

  wrap.classList.add('hidden');
  wrap.innerHTML = '';
  await loadRecepciones();
}

function mostrarEtiquetas(wrap, unidades) {
  wrap.innerHTML = `
    <h3>Recepción guardada</h3>
    <p>Se generaron ${unidades.length} unidad${unidades.length === 1 ? '' : 'es'} con su código QR. Podés imprimir las etiquetas ahora o más tarde desde acá.</p>
    <div id="etiquetas-print">
      ${unidades.map((u, i) => `
        <div class="etiqueta">
          <canvas id="etq-${i}"></canvas>
          <span>${escapeHtml(u.inventario?.sku || '-')}<br>${escapeHtml(u.codigo_qr)}</span>
        </div>
      `).join('')}
    </div>
    <div class="form-actions">
      <button type="button" id="btn-imprimir-etiquetas" class="btn btn-primary">Imprimir etiquetas</button>
      <button type="button" id="btn-cerrar-etiquetas" class="btn btn-secondary">Cerrar</button>
    </div>
  `;

  unidades.forEach((u, i) => {
    QRCode.toCanvas(document.getElementById(`etq-${i}`), u.codigo_qr, { width: 110 }, (err) => {
      if (err) console.error('Error generando QR:', err);
    });
  });

  document.getElementById('btn-imprimir-etiquetas').addEventListener('click', () => window.print());
  document.getElementById('btn-cerrar-etiquetas').addEventListener('click', () => {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
  });
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
