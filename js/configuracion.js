import { supabase } from './supabaseClient.js';

let initialized = false;

export async function initConfiguracion() {
  const section = document.getElementById('section-configuracion');

  if (!initialized) {
    section.innerHTML = `
      <div class="section-header">
        <h2>Configuración</h2>
      </div>

      <div class="form-card">
        <h3>Tipos de producto</h3>
        <form id="form-nuevo-tipo-producto" class="form-grid">
          <label class="full">Nuevo tipo
            <input name="nombre" placeholder="ej: Mesas ratonas" required>
          </label>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-sm">Agregar</button>
          </div>
        </form>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Nombre</th><th>Estado</th><th></th></tr></thead>
            <tbody id="tipos-producto-tbody"></tbody>
          </table>
        </div>
      </div>

      <div class="form-card">
        <h3>Tipos de madera</h3>
        <form id="form-nueva-madera" class="form-grid">
          <label class="full">Nuevo tipo de madera
            <input name="nombre" placeholder="ej: Álamo" required>
          </label>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-sm">Agregar</button>
          </div>
        </form>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Nombre</th><th>Estado</th><th></th></tr></thead>
            <tbody id="tipos-madera-tbody"></tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('form-nuevo-tipo-producto').addEventListener('submit', (e) =>
      agregarValor(e, 'tipos_producto', loadTiposProducto)
    );
    document.getElementById('form-nueva-madera').addEventListener('submit', (e) =>
      agregarValor(e, 'tipos_madera', loadTiposMadera)
    );

    initialized = true;
  }

  await loadTiposProducto();
  await loadTiposMadera();
}

async function agregarValor(e, tabla, recargar) {
  e.preventDefault();
  const form = e.target;
  const nombre = new FormData(form).get('nombre').trim();
  if (!nombre) return;

  const { error } = await supabase.from(tabla).insert({ nombre });
  if (error) {
    alert('No se pudo agregar: ' + error.message);
    return;
  }
  form.reset();
  await recargar();
}

async function loadTiposProducto() {
  await renderLista('tipos_producto', 'tipos-producto-tbody');
}

async function loadTiposMadera() {
  await renderLista('tipos_madera', 'tipos-madera-tbody');
}

async function renderLista(tabla, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';

  const { data, error } = await supabase.from(tabla).select('*').order('nombre');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="3">Error al cargar: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="3">Todavía no hay valores cargados.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(v => `
    <tr>
      <td>${escapeHtml(v.nombre)}</td>
      <td>${v.activo
        ? '<span class="badge badge-ok">Activo</span>'
        : '<span class="badge badge-off">Inactivo</span>'}</td>
      <td>
        <button class="btn btn-text btn-sm" data-toggle="${v.id}" data-activo="${v.activo}">
          ${v.activo ? 'Desactivar' : 'Activar'}
        </button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-toggle]').forEach(btn =>
    btn.addEventListener('click', async () => {
      const { error: errToggle } = await supabase
        .from(tabla)
        .update({ activo: btn.dataset.activo !== 'true' })
        .eq('id', btn.dataset.toggle);
      if (errToggle) {
        alert('No se pudo actualizar: ' + errToggle.message);
        return;
      }
      await renderLista(tabla, tbodyId);
    })
  );
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
