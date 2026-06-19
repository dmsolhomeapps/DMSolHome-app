import { supabase } from './supabaseClient.js';

let initialized = false;
let cacheOrdenes = [];
let cacheProveedores = [];
let cacheInventario = [];
let itemRowCount = 0;
let puedeEditarOrdenes = false;

export async function initOrdenes() {
  const section = document.getElementById('section-ordenes');

  if (!initialized) {
    section.innerHTML = `
      <div class="section-header">
        <h2>Órdenes de compra</h2>
        <button id="btn-nueva-oc" class="btn btn-primary">+ Nueva orden</button>
      </div>
      <div id="oc-alertas-wrap"></div>
      <div id="oc-form-wrap" class="form-card hidden"></div>
      <div id="oc-detail-wrap" class="form-card hidden"></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Proveedor</th><th>Tipo</th><th>Fecha pedido</th><th>Fecha necesidad</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody id="ordenes-tbody"></tbody>
        </table>
      </div>
    `;
    document.getElementById('btn-nueva-oc').addEventListener('click', () => openForm());
    initialized = true;
  }

  await Promise.all([loadProveedores(), loadInventario(), cargarPermiso()]);
  await loadOrdenes();
}

async function cargarPermiso() {
  const { data, error } = await supabase.rpc('fn_tiene_rol', { p_rol_nombre: 'Editor de órdenes' });
  puedeEditarOrdenes = !error && data === true;
}

async function loadProveedores() {
  const { data, error } = await supabase
    .from('proveedores')
    .select('id, nombre, tipo')
    .eq('activo', true)
    .order('nombre');
  cacheProveedores = error ? [] : (data || []);
}

async function loadInventario() {
  const { data, error } = await supabase
    .from('inventario')
    .select('id, sku, descripcion')
    .eq('activo', true)
    .order('sku');
  cacheInventario = error ? [] : (data || []);
}

async function loadOrdenes() {
  const tbody = document.getElementById('ordenes-tbody');
  tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';

  const { data, error } = await supabase
    .from('ordenes_compra')
    .select('*, proveedores(nombre)')
    .order('fecha_pedido', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6">Error al cargar: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  cacheOrdenes = data || [];
  renderAlertas();

  if (!cacheOrdenes.length) {
    tbody.innerHTML = '<tr><td colspan="6">Todavía no hay órdenes de compra.</td></tr>';
    return;
  }

  tbody.innerHTML = cacheOrdenes.map(oc => `
    <tr>
      <td>${escapeHtml(oc.proveedores?.nombre || '-')}</td>
      <td>${tipoOcLabel(oc.tipo)}</td>
      <td>${formatFecha(oc.fecha_pedido)}</td>
      <td>${formatFecha(oc.fecha_necesidad)}</td>
      <td>${estadoOcBadge(oc.estado)}</td>
      <td>
        <button class="btn btn-text btn-sm" data-ver="${oc.id}">Ver detalle</button>
        ${puedeEditarOrdenes ? `<button class="btn btn-text btn-sm" data-editar="${oc.id}">Editar</button>` : ''}
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-ver]').forEach(btn =>
    btn.addEventListener('click', () => verDetalle(btn.dataset.ver))
  );
  tbody.querySelectorAll('[data-editar]').forEach(btn =>
    btn.addEventListener('click', () => {
      const oc = cacheOrdenes.find(o => o.id === btn.dataset.editar);
      openForm(oc);
    })
  );
}

function renderAlertas() {
  const wrap = document.getElementById('oc-alertas-wrap');
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const alertas = cacheOrdenes.filter(oc => {
    if (['completa', 'cancelada'].includes(oc.estado)) return false;
    if (!oc.fecha_necesidad || oc.dias_aviso === null || oc.dias_aviso === undefined) return false;
    const limite = new Date(oc.fecha_necesidad + 'T00:00:00');
    limite.setDate(limite.getDate() - oc.dias_aviso);
    return hoy >= limite;
  });

  if (!alertas.length) {
    wrap.innerHTML = '';
    return;
  }

  wrap.innerHTML = `
    <div class="form-card alerta-card">
      <h3>Órdenes que necesitan atención</h3>
      <ul>
        ${alertas.map(oc => {
          const necesidad = new Date(oc.fecha_necesidad + 'T00:00:00');
          const diasRestantes = Math.round((necesidad - hoy) / 86400000);
          const texto = diasRestantes >= 0
            ? `faltan ${diasRestantes} día${diasRestantes === 1 ? '' : 's'} para la fecha de necesidad`
            : `la fecha de necesidad pasó hace ${Math.abs(diasRestantes)} día${Math.abs(diasRestantes) === 1 ? '' : 's'}`;
          return `<li>${escapeHtml(oc.proveedores?.nombre || '-')} - ${tipoOcLabel(oc.tipo)} (${estadoOcBadge(oc.estado)}): ${texto}</li>`;
        }).join('')}
      </ul>
    </div>
  `;
}

function tipoOcLabel(tipo) {
  const labels = { carpinteria: 'Carpintería', pintura: 'Pintura', laqueado: 'Laqueado', otro: 'Otro' };
  return labels[tipo] || (tipo || '-');
}

function tipoProvLabel(tipo) {
  const labels = { carpintero: 'carpintero', pintor: 'pintor', ambos: 'ambos', otro: 'otro' };
  return labels[tipo] || tipo;
}

function estadoOcBadge(estado) {
  const map = {
    pendiente: ['badge-neutral', 'Pendiente'],
    parcial: ['badge-warn', 'Parcial'],
    completa: ['badge-ok', 'Completa'],
    cancelada: ['badge-off', 'Cancelada'],
  };
  const [cls, label] = map[estado] || ['badge-neutral', estado];
  return `<span class="badge ${cls}">${label}</span>`;
}

function openForm(item = null) {
  const wrap = document.getElementById('oc-form-wrap');
  document.getElementById('oc-detail-wrap').classList.add('hidden');
  wrap.classList.remove('hidden');
  itemRowCount = 0;
  const esEdicion = !!item;

  const proveedorOptions = cacheProveedores.map(p =>
    `<option value="${p.id}" ${item?.proveedor_id === p.id ? 'selected' : ''}>${escapeHtml(p.nombre)} (${tipoProvLabel(p.tipo)})</option>`
  ).join('');

  wrap.innerHTML = `
    <h3>${esEdicion ? 'Editar orden de compra' : 'Nueva orden de compra'}</h3>
    <form id="oc-form" class="form-grid">
      <label>Proveedor *
        <select name="proveedor_id" required>
          <option value="">- Elegir -</option>
          ${proveedorOptions}
        </select>
      </label>
      <label>Tipo *
        <select name="tipo" required>
          <option value="carpinteria" ${item?.tipo === 'carpinteria' ? 'selected' : ''}>Carpintería</option>
          <option value="pintura" ${item?.tipo === 'pintura' ? 'selected' : ''}>Pintura</option>
          <option value="laqueado" ${item?.tipo === 'laqueado' ? 'selected' : ''}>Laqueado</option>
          <option value="otro" ${item?.tipo === 'otro' ? 'selected' : ''}>Otro</option>
        </select>
      </label>
      <label>Fecha de pedido
        <input name="fecha_pedido" type="date" value="${item?.fecha_pedido || new Date().toISOString().slice(0, 10)}">
      </label>
      <label>Fecha de necesidad <span class="ts">- Fecha en que se necesita entregar al cliente</span>
        <input name="fecha_necesidad" type="date" value="${item?.fecha_necesidad || ''}">
      </label>
      <label>Fecha estimada de entrega <span class="ts">- Fecha comprometida por el proveedor para entregar el producto</span>
        <input name="fecha_estimada_entrega" type="date" value="${item?.fecha_estimada_entrega || ''}">
      </label>
      <label>Avisar cuando falten <span class="ts">- días antes de la fecha de necesidad, si todavía no está recibida</span>
        <input name="dias_aviso" type="number" min="0" step="1" value="${item?.dias_aviso ?? ''}">
      </label>
      <label class="full">Notas
        <textarea name="notas">${escapeHtml(item?.notas || '')}</textarea>
      </label>

      ${esEdicion ? '' : `
      <div class="full">
        <h3 style="margin-top:1rem">Ítems</h3>
        <div id="oc-items-rows"></div>
        <button type="button" id="btn-agregar-item" class="btn btn-secondary btn-sm">+ Agregar ítem</button>
      </div>
      `}

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Guardar orden</button>
        <button type="button" id="btn-cancelar-oc" class="btn btn-secondary">Cancelar</button>
      </div>
    </form>
  `;

  if (!esEdicion) {
    document.getElementById('btn-agregar-item').addEventListener('click', () => agregarItemRow());
    agregarItemRow();
  }

  document.getElementById('btn-cancelar-oc').addEventListener('click', () => {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
  });
  document.getElementById('oc-form').addEventListener('submit', (e) => saveOrden(e, item?.id));
}

function agregarItemRow() {
  itemRowCount++;
  const id = itemRowCount;
  const container = document.getElementById('oc-items-rows');
  const inventarioOptions = cacheInventario.map(i =>
    `<option value="${i.id}">${escapeHtml(i.sku)}</option>`
  ).join('');

  const row = document.createElement('div');
  row.className = 'oc-item-row';
  row.dataset.rowId = id;
  row.innerHTML = `
    <div class="form-grid">
      <label>Artículo
        <select name="item-inventario-${id}">
          <option value="">- A medida / personalizado -</option>
          ${inventarioOptions}
        </select>
      </label>
      <label>Descripción (si es a medida)
        <input name="item-desc-${id}">
      </label>
      <label>Cantidad pedida *
        <input name="item-cantidad-${id}" type="number" min="0.01" step="0.01" required>
      </label>
      <label>Costo unitario
        <input name="item-costo-${id}" type="number" min="0" step="0.01">
      </label>
      <label class="full">Notas del ítem
        <input name="item-notas-${id}">
      </label>
      <div class="form-actions">
        <button type="button" class="btn btn-text btn-sm" data-quitar-row="${id}">Quitar este ítem</button>
      </div>
    </div>
  `;
  container.appendChild(row);

  row.querySelector(`[data-quitar-row="${id}"]`).addEventListener('click', () => row.remove());
}

async function saveOrden(e, id) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);

  const payloadHeader = {
    proveedor_id: fd.get('proveedor_id'),
    tipo: fd.get('tipo'),
    fecha_pedido: fd.get('fecha_pedido') || null,
    fecha_necesidad: fd.get('fecha_necesidad') || null,
    fecha_estimada_entrega: fd.get('fecha_estimada_entrega') || null,
    dias_aviso: fd.get('dias_aviso') ? parseInt(fd.get('dias_aviso'), 10) : null,
    notas: fd.get('notas') || null,
  };

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando...';

  if (id) {
    const { error } = await supabase.from('ordenes_compra').update(payloadHeader).eq('id', id);
    if (error) {
      alert('No se pudo guardar: ' + error.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Guardar orden';
      return;
    }
    document.getElementById('oc-form-wrap').classList.add('hidden');
    document.getElementById('oc-form-wrap').innerHTML = '';
    await loadOrdenes();
    return;
  }

  const rows = document.querySelectorAll('#oc-items-rows .oc-item-row');
  if (!rows.length) {
    alert('Agregá al menos un ítem a la orden.');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Guardar orden';
    return;
  }

  const items = [];
  for (const row of rows) {
    const rowId = row.dataset.rowId;
    const cantidad = parseFloat(fd.get(`item-cantidad-${rowId}`));
    if (!cantidad || cantidad <= 0) continue;
    items.push({
      inventario_id: fd.get(`item-inventario-${rowId}`) || null,
      descripcion_personalizada: fd.get(`item-desc-${rowId}`) || null,
      cantidad_pedida: cantidad,
      costo_unitario: fd.get(`item-costo-${rowId}`) ? parseFloat(fd.get(`item-costo-${rowId}`)) : null,
      notas: fd.get(`item-notas-${rowId}`) || null,
    });
  }

  if (!items.length) {
    alert('Agregá al menos un ítem con una cantidad válida.');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Guardar orden';
    return;
  }

  const { data: oc, error: errOc } = await supabase
    .from('ordenes_compra')
    .insert(payloadHeader)
    .select()
    .single();

  if (errOc) {
    alert('No se pudo crear la orden: ' + errOc.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Guardar orden';
    return;
  }

  const itemsConOrden = items.map(it => ({ ...it, orden_compra_id: oc.id }));
  const { error: errItems } = await supabase.from('ordenes_compra_items').insert(itemsConOrden);

  if (errItems) {
    alert('La orden se creó pero hubo un error al guardar los ítems: ' + errItems.message);
  }

  document.getElementById('oc-form-wrap').classList.add('hidden');
  document.getElementById('oc-form-wrap').innerHTML = '';
  await loadOrdenes();
}

async function verDetalle(ocId) {
  document.getElementById('oc-form-wrap').classList.add('hidden');
  const wrap = document.getElementById('oc-detail-wrap');
  wrap.classList.remove('hidden');
  wrap.innerHTML = '<p class="proximamente">Cargando...</p>';

  const oc = cacheOrdenes.find(o => o.id === ocId);

  const { data: items, error } = await supabase
    .from('ordenes_compra_items')
    .select('*, inventario(sku, descripcion)')
    .eq('orden_compra_id', ocId);

  if (error) {
    wrap.innerHTML = `<p class="proximamente">Error: ${escapeHtml(error.message)}</p>`;
    return;
  }

  wrap.innerHTML = `
    <div class="section-header">
      <h3>Orden a ${escapeHtml(oc?.proveedores?.nombre || '-')} - ${tipoOcLabel(oc?.tipo)}</h3>
      <div>
        ${puedeEditarOrdenes ? `<button type="button" id="btn-editar-detalle" class="btn btn-secondary btn-sm">Editar</button>` : ''}
        <button type="button" id="btn-cerrar-detalle" class="btn btn-secondary btn-sm">Cerrar</button>
      </div>
    </div>
    <p>
      Pedido: ${formatFecha(oc?.fecha_pedido)} ·
      Necesidad: ${formatFecha(oc?.fecha_necesidad)} ·
      Entrega estimada: ${formatFecha(oc?.fecha_estimada_entrega)} ·
      Entrega real: ${formatFecha(oc?.fecha_entrega_real)}
    </p>
    <p>Estado: ${estadoOcBadge(oc?.estado)} ${oc?.dias_aviso != null ? `· Avisar con ${oc.dias_aviso} días de anticipación` : ''}</p>
    ${oc?.notas ? `<p>Notas: ${escapeHtml(oc.notas)}</p>` : ''}
    <table class="data-table">
      <thead>
        <tr><th>Artículo</th><th>Pedido</th><th>Recibido</th><th>Pendiente</th><th>Costo unit.</th></tr>
      </thead>
      <tbody>
        ${(items || []).map(it => `
          <tr>
            <td>${escapeHtml(it.inventario?.sku || it.descripcion_personalizada || '-')}</td>
            <td>${it.cantidad_pedida}</td>
            <td>${it.cantidad_recibida}</td>
            <td>${(it.cantidad_pedida - it.cantidad_recibida).toFixed(2)}</td>
            <td>${it.costo_unitario ?? '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  if (puedeEditarOrdenes) {
    document.getElementById('btn-editar-detalle').addEventListener('click', () => {
      wrap.classList.add('hidden');
      wrap.innerHTML = '';
      openForm(oc);
    });
  }

  document.getElementById('btn-cerrar-detalle').addEventListener('click', () => {
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
