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

      <div class="form-card">
        <h3>Roles</h3>
        <form id="form-nuevo-rol" class="form-grid">
          <label class="full">Nuevo rol
            <input name="nombre" placeholder="ej: Supervisor de compras" required>
          </label>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-sm">Agregar</button>
          </div>
        </form>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Nombre</th><th>Estado</th><th></th></tr></thead>
            <tbody id="roles-tbody"></tbody>
          </table>
        </div>
      </div>

      <div class="form-card">
        <h3>Asignación de roles</h3>
        <p class="ts">Solo aparecen las personas que ya iniciaron sesión en la app al menos una vez.</p>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr id="asignacion-thead"><th>Persona</th></tr></thead>
            <tbody id="asignacion-tbody"></tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('form-nuevo-tipo-producto').addEventListener('submit', (e) =>
      agregarValor(e, 'tipos_producto', 'tipos-producto-tbody')
    );
    document.getElementById('form-nueva-madera').addEventListener('submit', (e) =>
      agregarValor(e, 'tipos_madera', 'tipos-madera-tbody')
    );
    document.getElementById('form-nuevo-rol').addEventListener('submit', (e) =>
      agregarValor(e, 'roles', 'roles-tbody', cargarAsignacionRoles)
    );

    initialized = true;
  }

  await renderLista('tipos_producto', 'tipos-producto-tbody');
  await renderLista('tipos_madera', 'tipos-madera-tbody');
  await renderLista('roles', 'roles-tbody', cargarAsignacionRoles);
  await cargarAsignacionRoles();
}

async function agregarValor(e, tabla, tbodyId, onChange) {
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
  await renderLista(tabla, tbodyId, onChange);
  if (onChange) await onChange();
}

async function renderLista(tabla, tbodyId, onChange) {
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
    <tr data-id="${v.id}">
      <td class="celda-nombre">${escapeHtml(v.nombre)}</td>
      <td>${v.activo
        ? '<span class="badge badge-ok">Activo</span>'
        : '<span class="badge badge-off">Inactivo</span>'}</td>
      <td>
        <button class="btn btn-text btn-sm" data-editar="${v.id}">Editar</button>
        <button class="btn btn-text btn-sm" data-toggle="${v.id}" data-activo="${v.activo}">
          ${v.activo ? 'Desactivar' : 'Activar'}
        </button>
        <button class="btn btn-text btn-sm" data-borrar="${v.id}">Borrar</button>
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
      await renderLista(tabla, tbodyId, onChange);
      if (onChange) await onChange();
    })
  );

  tbody.querySelectorAll('[data-borrar]').forEach(btn =>
    btn.addEventListener('click', async () => {
      if (!confirm('¿Borrar este valor? Si ya se usó en algún artículo de inventario, ese artículo conserva el texto pero deja de aparecer en la lista para elegir.')) {
        return;
      }
      const { error: errDelete } = await supabase.from(tabla).delete().eq('id', btn.dataset.borrar);
      if (errDelete) {
        alert('No se pudo borrar: ' + errDelete.message);
        return;
      }
      await renderLista(tabla, tbodyId, onChange);
      if (onChange) await onChange();
    })
  );

  tbody.querySelectorAll('[data-editar]').forEach(btn =>
    btn.addEventListener('click', () => {
      const fila = btn.closest('tr');
      const celda = fila.querySelector('.celda-nombre');
      const nombreActual = celda.textContent;
      celda.innerHTML = `<input type="text" class="input-edicion" value="${escapeAttr(nombreActual)}">`;
      const input = celda.querySelector('input');
      input.focus();
      input.select();

      const accionesCelda = fila.children[2];
      accionesCelda.innerHTML = `
        <button class="btn btn-text btn-sm" data-guardar="${btn.dataset.editar}">Guardar</button>
        <button class="btn btn-text btn-sm" data-cancelar-edicion>Cancelar</button>
      `;

      accionesCelda.querySelector('[data-cancelar-edicion]').addEventListener('click', () => {
        renderLista(tabla, tbodyId, onChange);
      });

      accionesCelda.querySelector('[data-guardar]').addEventListener('click', async () => {
        const nuevoNombre = input.value.trim();
        if (!nuevoNombre) return;
        const { error: errUpdate } = await supabase
          .from(tabla)
          .update({ nombre: nuevoNombre })
          .eq('id', btn.dataset.editar);
        if (errUpdate) {
          alert('No se pudo guardar: ' + errUpdate.message);
          return;
        }
        await renderLista(tabla, tbodyId, onChange);
        if (onChange) await onChange();
      });
    })
  );
}

async function cargarAsignacionRoles() {
  const thead = document.getElementById('asignacion-thead');
  const tbody = document.getElementById('asignacion-tbody');

  const [perfilesRes, rolesRes, asignacionesRes] = await Promise.all([
    supabase.from('perfiles').select('id, email, nombre').order('email'),
    supabase.from('roles').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('perfiles_roles').select('perfil_id, rol_id'),
  ]);

  const perfiles = perfilesRes.data || [];
  const rolesActivos = rolesRes.data || [];
  const asignaciones = asignacionesRes.data || [];

  thead.innerHTML = '<th>Persona</th>' +
    rolesActivos.map(r => `<th>${escapeHtml(r.nombre)}</th>`).join('');

  if (!perfiles.length) {
    tbody.innerHTML = `<tr><td colspan="${rolesActivos.length + 1}">Todavía nadie inició sesión.</td></tr>`;
    return;
  }
  if (!rolesActivos.length) {
    tbody.innerHTML = `<tr><td colspan="1">No hay roles activos para asignar.</td></tr>`;
    return;
  }

  tbody.innerHTML = perfiles.map(p => `
    <tr>
      <td>${escapeHtml(p.nombre || p.email)}</td>
      ${rolesActivos.map(r => {
        const tiene = asignaciones.some(a => a.perfil_id === p.id && a.rol_id === r.id);
        return `<td style="text-align:center"><input type="checkbox" data-perfil="${p.id}" data-rol="${r.id}" ${tiene ? 'checked' : ''}></td>`;
      }).join('')}
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-perfil]').forEach(checkbox =>
    checkbox.addEventListener('change', async () => {
      const { perfil, rol } = checkbox.dataset;
      if (checkbox.checked) {
        const { error } = await supabase.from('perfiles_roles').insert({ perfil_id: perfil, rol_id: rol });
        if (error) {
          alert('No se pudo asignar: ' + error.message);
          checkbox.checked = false;
        }
      } else {
        const { error } = await supabase.from('perfiles_roles').delete().eq('perfil_id', perfil).eq('rol_id', rol);
        if (error) {
          alert('No se pudo quitar: ' + error.message);
          checkbox.checked = true;
        }
      }
    })
  );
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}
