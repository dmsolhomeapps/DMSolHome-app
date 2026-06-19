import { supabase } from './supabaseClient.js';

let initialized = false;
let cacheInventario = [];
let cacheProveedores = [];
let cacheTiposProducto = [];
let cacheTiposMadera = [];

export async function initInventario() {
  const section = document.getElementById('section-inventario');

  if (!initialized) {
    section.innerHTML = `
      <div class="section-header">
        <h2>Inventario</h2>
        <button id="btn-nuevo-articulo" class="btn btn-primary">+ Nuevo artículo</button>
      </div>
      <div id="articulo-form-wrap" class="form-card hidden"></div>
      <div class="form-card">
        <div class="form-grid">
          <label>Tipo de producto
            <select id="filtro-tipo-inv"><option value="">Todos</option></select>
          </label>
          <label>Buscar por SKU
            <input id="filtro-sku-inv" placeholder="ej: BM-001">
          </label>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>SKU</th><th>Tipo</th><th>Proveedor</th><th>Color</th>
              <th>Laqueado</th><th>Medidas (L×A×P cm)</th><th>Peso físico (kg)</th>
              <th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody id="inventario-tbody"></tbody>
        </table>
      </div>
    `;
    document.getElementById('btn-nuevo-articulo').addEventListener('click', () => openForm());
    document.getElementById('filtro-tipo-inv').addEventListener('change', renderTabla);
    document.getElementById('filtro-sku-inv').addEventListener('input', renderTabla);
    initialized = true;
  }

  await Promise.all([loadProveedores(), loadTiposListas()]);
  await loadInventario();
}

async function loadTiposListas() {
  const [tp, tm] = await Promise.all([
    supabase.from('tipos_producto').select('nombre').eq('activo', true).order('nombre'),
    supabase.from('tipos_madera').select('nombre').eq('activo', true).order('nombre'),
  ]);
  cacheTiposProducto = tp.data || [];
  cacheTiposMadera = tm.data || [];
}

async function loadProveedores() {
  const { data, error } = await supabase
    .from('proveedores')
    .select('id, nombre, tipo')
    .eq('activo', true)
    .in('tipo', ['carpintero', 'ambos'])
    .order('nombre');

  if (error) {
    console.error('Error cargando proveedores:', error);
    cacheProveedores = [];
    return;
  }
  cacheProveedores = data || [];
}

async function loadInventario() {
  const tbody = document.getElementById('inventario-tbody');
  tbody.innerHTML = '<tr><td colspan="9">Cargando...</td></tr>';

  const { data, error } = await supabase
    .from('inventario')
    .select('*, proveedores(nombre)')
    .order('sku');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="9">Error al cargar: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  cacheInventario = data || [];
  poblarFiltroTipo();
  renderTabla();
}

function poblarFiltroTipo() {
  const select = document.getElementById('filtro-tipo-inv');
  const tipos = [...new Set(cacheInventario.map(i => i.tipo).filter(Boolean))].sort();
  const actual = select.value;
  select.innerHTML = '<option value="">Todos</option>' +
    tipos.map(t => `<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join('');
  select.value = actual;
}

function renderTabla() {
  const tbody = document.getElementById('inventario-tbody');
  const tipo = document.getElementById('filtro-tipo-inv').value;
  const sku = document.getElementById('filtro-sku-inv').value.trim().toLowerCase();

  const filtrados = cacheInventario.filter(item => {
    if (tipo && item.tipo !== tipo) return false;
    if (sku && !item.sku.toLowerCase().includes(sku)) return false;
    return true;
  });

  if (!filtrados.length) {
    tbody.innerHTML = '<tr><td colspan="9">No hay artículos que coincidan con el filtro.</td></tr>';
    return;
  }

  tbody.innerHTML = filtrados.map(item => `
    <tr>
      <td>${escapeHtml(item.sku)}</td>
      <td>${escapeHtml(item.tipo || '-')}</td>
      <td>${escapeHtml(item.proveedores?.nombre || '-')}</td>
      <td>${colorLabel(item.color)}</td>
      <td>${item.laqueado ? 'Sí' : 'No'}</td>
      <td>${formatMedidas(item)}</td>
      <td>${item.peso_fisico_kg ?? '-'}</td>
      <td>${item.activo
        ? '<span class="badge badge-ok">Activo</span>'
        : '<span class="badge badge-off">Inactivo</span>'}</td>
      <td>
        <button class="btn btn-text btn-sm" data-edit="${item.id}">Editar</button>
        <button class="btn btn-text btn-sm" data-toggle="${item.id}" data-activo="${item.activo}">
          ${item.activo ? 'Desactivar' : 'Activar'}
        </button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-edit]').forEach(btn =>
    btn.addEventListener('click', () => {
      const item = cacheInventario.find(i => i.id === btn.dataset.edit);
      openForm(item);
    })
  );
  tbody.querySelectorAll('[data-toggle]').forEach(btn =>
    btn.addEventListener('click', () =>
      toggleActivo(btn.dataset.toggle, btn.dataset.activo === 'true')
    )
  );
}

function formatMedidas(item) {
  if (item.diametro_cm && item.alto_cm) {
    return `Ø${item.diametro_cm} × ${item.alto_cm}`;
  }
  const partes = [item.largo_cm, item.alto_cm, item.profundidad_cm];
  if (partes.every(p => p === null || p === undefined)) return '-';
  return partes.map(p => p ?? '?').join(' × ');
}

function colorLabel(color) {
  const labels = { natural: 'Natural', estandar: 'Estándar', chocolate: 'Chocolate', otro: 'Otro' };
  return labels[color] || (color ? escapeHtml(color) : '-');
}

function calcularPesoVolumetrico(alto, largo, profundidad, diametro) {
  if (alto && largo && profundidad) {
    return Math.round((alto * largo * profundidad / 4000) * 100) / 100;
  }
  if (alto && diametro) {
    return Math.round((alto * diametro * diametro / 4000) * 100) / 100;
  }
  return null;
}

function buildSelectOptions(lista, valorActual) {
  const nombres = lista.map(v => v.nombre);
  let html = lista.map(v =>
    `<option value="${escapeAttr(v.nombre)}" ${v.nombre === valorActual ? 'selected' : ''}>${escapeHtml(v.nombre)}</option>`
  ).join('');
  if (valorActual && !nombres.includes(valorActual)) {
    html += `<option value="${escapeAttr(valorActual)}" selected>${escapeHtml(valorActual)} (inactivo)</option>`;
  }
  return html;
}

function openForm(item = null) {
  const wrap = document.getElementById('articulo-form-wrap');
  wrap.classList.remove('hidden');

  const proveedorOptions = cacheProveedores.map(p =>
    `<option value="${p.id}" ${item?.proveedor_id === p.id ? 'selected' : ''}>${escapeHtml(p.nombre)}</option>`
  ).join('');

  wrap.innerHTML = `
    <h3>${item ? 'Editar artículo' : 'Nuevo artículo'}</h3>
    <form id="articulo-form" class="form-grid">
      <label>SKU *
        <input name="sku" required maxlength="200" value="${escapeAttr(item?.sku || '')}">
      </label>
      <label>Tipo
        <select name="tipo">
          <option value="">- Sin definir -</option>
          ${buildSelectOptions(cacheTiposProducto, item?.tipo)}
        </select>
      </label>
      <label>Proveedor (carpintero)
        <select name="proveedor_id">
          <option value="">- Sin asignar -</option>
          ${proveedorOptions}
        </select>
      </label>
      <label>Tipo de madera
        <select name="tipo_madera">
          <option value="">- Sin definir -</option>
          ${buildSelectOptions(cacheTiposMadera, item?.tipo_madera)}
        </select>
      </label>
      <label>Color
        <select name="color" id="color-select">
          <option value="">- Sin definir -</option>
          <option value="natural" ${item?.color === 'natural' ? 'selected' : ''}>Natural</option>
          <option value="estandar" ${item?.color === 'estandar' ? 'selected' : ''}>Estándar</option>
          <option value="chocolate" ${item?.color === 'chocolate' ? 'selected' : ''}>Chocolate</option>
          <option value="otro" ${item?.color === 'otro' ? 'selected' : ''}>Otro</option>
        </select>
      </label>
      <label id="color-detalle-wrap" class="${item?.color === 'otro' ? '' : 'hidden'}">Detalle del color
        <input name="color_detalle" value="${escapeAttr(item?.color_detalle || '')}">
      </label>
      <label class="checkbox" style="flex-direction: row; align-items: center;">
        <input type="checkbox" name="laqueado" ${item?.laqueado ? 'checked' : ''}> Laqueado
      </label>

      <label>Largo (cm)
        <input name="largo_cm" type="number" step="0.1" min="0" value="${item?.largo_cm ?? ''}">
      </label>
      <label>Alto (cm)
        <input name="alto_cm" type="number" step="0.1" min="0" value="${item?.alto_cm ?? ''}">
      </label>
      <label>Profundidad (cm)
        <input name="profundidad_cm" type="number" step="0.1" min="0" value="${item?.profundidad_cm ?? ''}">
      </label>
      <label>Diámetro (cm) <span class="ts">- para piezas redondas, en vez de largo/profundidad</span>
        <input name="diametro_cm" type="number" step="0.1" min="0" value="${item?.diametro_cm ?? ''}">
      </label>
      <label>Peso físico (kg)
        <input name="peso_fisico_kg" type="number" step="0.01" min="0" value="${item?.peso_fisico_kg ?? ''}">
      </label>
      <label>Peso volumétrico (kg)
        <input id="peso-vol-preview" type="text" disabled value="${item?.peso_volumetrico_kg ?? '-'}">
      </label>

      <label class="full">Descripción
        <textarea name="descripcion">${escapeHtml(item?.descripcion || '')}</textarea>
      </label>
      <label class="full">Información adicional
        <textarea name="info_adicional">${escapeHtml(item?.info_adicional || '')}</textarea>
      </label>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Guardar</button>
        <button type="button" id="btn-cancelar-form" class="btn btn-secondary">Cancelar</button>
      </div>
    </form>
  `;

  const form = document.getElementById('articulo-form');
  const preview = document.getElementById('peso-vol-preview');
  const dimFields = ['alto_cm', 'largo_cm', 'profundidad_cm', 'diametro_cm'];
  dimFields.forEach(name => {
    form.elements[name].addEventListener('input', () => {
      const alto = parseFloat(form.elements.alto_cm.value) || null;
      const largo = parseFloat(form.elements.largo_cm.value) || null;
      const profundidad = parseFloat(form.elements.profundidad_cm.value) || null;
      const diametro = parseFloat(form.elements.diametro_cm.value) || null;
      const calc = calcularPesoVolumetrico(alto, largo, profundidad, diametro);
      preview.value = calc ?? '-';
    });
  });

  document.getElementById('color-select').addEventListener('change', (e) => {
    document.getElementById('color-detalle-wrap').classList.toggle('hidden', e.target.value !== 'otro');
  });

  document.getElementById('btn-cancelar-form').addEventListener('click', () => {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
  });
  form.addEventListener('submit', (e) => saveArticulo(e, item?.id));
}

async function saveArticulo(e, id) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);

  const num = (v) => (v === '' || v === null ? null : parseFloat(v));

  const payload = {
    sku: fd.get('sku'),
    tipo: fd.get('tipo') || null,
    proveedor_id: fd.get('proveedor_id') || null,
    tipo_madera: fd.get('tipo_madera') || null,
    color: fd.get('color') || null,
    color_detalle: fd.get('color') === 'otro' ? (fd.get('color_detalle') || null) : null,
    laqueado: fd.get('laqueado') === 'on',
    alto_cm: num(fd.get('alto_cm')),
    largo_cm: num(fd.get('largo_cm')),
    profundidad_cm: num(fd.get('profundidad_cm')),
    diametro_cm: num(fd.get('diametro_cm')),
    peso_fisico_kg: num(fd.get('peso_fisico_kg')),
    descripcion: fd.get('descripcion') || null,
    info_adicional: fd.get('info_adicional') || null,
  };
  // peso_volumetrico_kg NO se manda: es una columna calculada en la base,
  // Postgres la rechaza si se intenta insertar/actualizar a mano.

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando...';

  const { error } = id
    ? await supabase.from('inventario').update(payload).eq('id', id)
    : await supabase.from('inventario').insert(payload);

  if (error) {
    alert('No se pudo guardar: ' + error.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Guardar';
    return;
  }

  const wrap = document.getElementById('articulo-form-wrap');
  wrap.classList.add('hidden');
  wrap.innerHTML = '';
  await loadInventario();
}

async function toggleActivo(id, activoActual) {
  const { error } = await supabase
    .from('inventario')
    .update({ activo: !activoActual })
    .eq('id', id);

  if (error) {
    alert('No se pudo actualizar: ' + error.message);
    return;
  }
  await loadInventario();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}
