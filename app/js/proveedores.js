import { supabase } from './supabaseClient.js';

let initialized = false;
let cache = [];

export async function initProveedores() {
  const section = document.getElementById('section-proveedores');

  if (!initialized) {
    section.innerHTML = `
      <div class="section-header">
        <h2>Proveedores</h2>
        <button id="btn-nuevo-proveedor" class="btn btn-primary">+ Nuevo proveedor</button>
      </div>
      <div id="proveedor-form-wrap" class="form-card hidden"></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nombre</th><th>Tipo</th><th>Contacto</th><th>Teléfono</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody id="proveedores-tbody"></tbody>
        </table>
      </div>
    `;
    document.getElementById('btn-nuevo-proveedor').addEventListener('click', () => openForm());
    initialized = true;
  }

  await loadProveedores();
}

async function loadProveedores() {
  const tbody = document.getElementById('proveedores-tbody');
  tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';

  const { data, error } = await supabase
    .from('proveedores')
    .select('*')
    .order('nombre');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6">Error al cargar: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  cache = data || [];

  if (!cache.length) {
    tbody.innerHTML = '<tr><td colspan="6">Todavía no hay proveedores cargados.</td></tr>';
    return;
  }

  tbody.innerHTML = cache.map(p => `
    <tr>
      <td>${escapeHtml(p.nombre)}</td>
      <td>${tipoLabel(p.tipo)}</td>
      <td>${escapeHtml(p.nombre_contacto || '-')}</td>
      <td>${escapeHtml(p.telefono_contacto || '-')}</td>
      <td>${p.activo
        ? '<span class="badge badge-ok">Activo</span>'
        : '<span class="badge badge-off">Inactivo</span>'}</td>
      <td>
        <button class="btn btn-text btn-sm" data-edit="${p.id}">Editar</button>
        <button class="btn btn-text btn-sm" data-toggle="${p.id}" data-activo="${p.activo}">
          ${p.activo ? 'Desactivar' : 'Activar'}
        </button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-edit]').forEach(btn =>
    btn.addEventListener('click', () => {
      const proveedor = cache.find(p => p.id === btn.dataset.edit);
      openForm(proveedor);
    })
  );
  tbody.querySelectorAll('[data-toggle]').forEach(btn =>
    btn.addEventListener('click', () =>
      toggleActivo(btn.dataset.toggle, btn.dataset.activo === 'true')
    )
  );
}

function tipoLabel(tipo) {
  const labels = { carpintero: 'Carpintero', pintor: 'Pintor', ambos: 'Ambos', otro: 'Otro' };
  return labels[tipo] || tipo;
}

function openForm(proveedor = null) {
  const wrap = document.getElementById('proveedor-form-wrap');
  wrap.classList.remove('hidden');
  const metodos = proveedor?.metodos_contacto || [];

  wrap.innerHTML = `
    <h3>${proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
    <form id="proveedor-form" class="form-grid">
      <label>Nombre *
        <input name="nombre" required value="${escapeAttr(proveedor?.nombre || '')}">
      </label>
      <label>Tipo *
        <select name="tipo" required>
          <option value="carpintero" ${proveedor?.tipo === 'carpintero' ? 'selected' : ''}>Carpintero</option>
          <option value="pintor" ${proveedor?.tipo === 'pintor' ? 'selected' : ''}>Pintor</option>
          <option value="ambos" ${proveedor?.tipo === 'ambos' ? 'selected' : ''}>Ambos</option>
          <option value="otro" ${proveedor?.tipo === 'otro' ? 'selected' : ''}>Otro</option>
        </select>
      </label>
      <label>Tipo de productos que vende
        <input name="tipo_productos" value="${escapeAttr(proveedor?.tipo_productos || '')}">
      </label>
      <label>Dirección
        <input name="direccion" value="${escapeAttr(proveedor?.direccion || '')}">
      </label>
      <fieldset class="checkbox-group">
        <legend>Métodos de contacto</legend>
        <label class="checkbox"><input type="checkbox" name="metodo" value="whatsapp" ${metodos.includes('whatsapp') ? 'checked' : ''}> WhatsApp</label>
        <label class="checkbox"><input type="checkbox" name="metodo" value="telefono" ${metodos.includes('telefono') ? 'checked' : ''}> Teléfono</label>
        <label class="checkbox"><input type="checkbox" name="metodo" value="email" ${metodos.includes('email') ? 'checked' : ''}> Email</label>
      </fieldset>
      <label>Nombre de contacto
        <input name="nombre_contacto" value="${escapeAttr(proveedor?.nombre_contacto || '')}">
      </label>
      <label>Teléfono de contacto
        <input name="telefono_contacto" value="${escapeAttr(proveedor?.telefono_contacto || '')}">
      </label>
      <label>Mail
        <input name="mail" type="email" value="${escapeAttr(proveedor?.mail || '')}">
      </label>
      <label class="full">Información adicional
        <textarea name="info_adicional">${escapeHtml(proveedor?.info_adicional || '')}</textarea>
      </label>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Guardar</button>
        <button type="button" id="btn-cancelar-form" class="btn btn-secondary">Cancelar</button>
      </div>
    </form>
  `;

  document.getElementById('btn-cancelar-form').addEventListener('click', () => {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
  });
  document.getElementById('proveedor-form').addEventListener('submit', (e) =>
    saveProveedor(e, proveedor?.id)
  );
}

async function saveProveedor(e, id) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);

  const payload = {
    nombre: fd.get('nombre'),
    tipo: fd.get('tipo'),
    tipo_productos: fd.get('tipo_productos') || null,
    direccion: fd.get('direccion') || null,
    metodos_contacto: fd.getAll('metodo'),
    nombre_contacto: fd.get('nombre_contacto') || null,
    telefono_contacto: fd.get('telefono_contacto') || null,
    mail: fd.get('mail') || null,
    info_adicional: fd.get('info_adicional') || null,
  };

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando...';

  const { error } = id
    ? await supabase.from('proveedores').update(payload).eq('id', id)
    : await supabase.from('proveedores').insert(payload);

  if (error) {
    alert('No se pudo guardar: ' + error.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Guardar';
    return;
  }

  const wrap = document.getElementById('proveedor-form-wrap');
  wrap.classList.add('hidden');
  wrap.innerHTML = '';
  await loadProveedores();
}

async function toggleActivo(id, activoActual) {
  const { error } = await supabase
    .from('proveedores')
    .update({ activo: !activoActual })
    .eq('id', id);

  if (error) {
    alert('No se pudo actualizar: ' + error.message);
    return;
  }
  await loadProveedores();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}
