import { supabase } from './supabaseClient.js';

let initialized = false;
let esSuperusuario = false;

export async function initConfiguracion() {
  const section = document.getElementById('section-configuracion');

  const { data } = await supabase.rpc('fn_es_superusuario');
  esSuperusuario = data === true;

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

      ${esSuperusuario ? `
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
        <div id="asignacion-leyenda"></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr id="asignacion-thead"><th>Persona</th></tr></thead>
            <tbody id="asignacion-tbody"></tbody>
          </table>
        </div>
      </div>

      <div class="form-card">
        <h3>Usuarios autorizados</h3>
        <form id="form-nuevo-usuario" class="form-grid">
          <label>Email *
            <input name="email" type="email" placeholder="persona@gmail.com" required>
          </label>
          <label>Nombre *
            <input name="nombre" placeholder="Cómo se la nombra en la app" required>
          </label>
          <label class="checkbox" style="flex-direction: row; align-items: center;">
            <input type="checkbox" name="es_superusuario"> Es súper usuario
          </label>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-sm">Agregar</button>
          </div>
        </form>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Email</th><th>Nombre</th><th>Estado</th><th>Súper usuario</th><th></th></tr></thead>
            <tbody id="usuarios-tbody"></tbody>
          </table>
        </div>
      </div>
      ` : ''}
    `;

    document.getElementById('form-nuevo-tipo-producto').addEventListener('submit', (e) =>
      agregarValor(e, 'tipos_producto', 'tipos-producto-tbody')
    );
    document.getElementById('form-nueva-madera').addEventListener('submit', (e) =>
      agregarValor(e, 'tipos_madera', 'tipos-madera-tbody')
    );
    if (esSuperusuario) {
      document.getElementById('form-nuevo-rol').addEventListener('submit', (e) =>
        agregarValor(e, 'roles', 'roles-tbody', cargarAsignacionRoles)
      );
      document.getElementById('form-nuevo-usuario').addEventListener('submit', agregarUsuarioAutorizado);
    }

    initialized = true;
  }

  await renderLista('tipos_producto', 'tipos-producto-tbody');
  await renderLista('tipos_madera', 'tipos-madera-tbody');
  if (esSuperusuario) {
    await renderLista('roles', 'roles-tbody', cargarAsignacionRoles);
    await cargarAsignacionRoles();
    await cargarUsuariosAutorizados();
  }
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
  const leyenda = document.getElementById('asignacion-leyenda');

  const [perfilesRes, rolesRes, asignacionesRes] = await Promise.all([
    supabase.from('perfiles').select('id, email, nombre').order('email'),
    supabase.from('roles').select('id, nombre, descripcion').eq('activo', true).order('nombre'),
    supabase.from('perfiles_roles').select('perfil_id, rol_id'),
  ]);

  const perfiles = perfilesRes.data || [];
  const rolesActivos = rolesRes.data || [];
  const asignaciones = asignacionesRes.data || [];

  if (leyenda) {
    leyenda.innerHTML = rolesActivos.length
      ? '<ul class="leyenda-roles">' + rolesActivos.map(r =>
          `<li><strong>${escapeHtml(r.nombre)}:</strong> ${escapeHtml(r.descripcion || 'Sin descripción.')}</li>`
        ).join('') + '</ul>'
      : '';
  }

  thead.innerHTML = '<th>Persona</th>' +
    rolesActivos.map(r => `<th title="${escapeAttr(r.descripcion || '')}">${escapeHtml(r.nombre)}</th>`).join('');

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
        return `<td style="text-align:center"><input type="checkbox" data-perfil="${p.id}" data-rol="${r.id}" title="${escapeAttr(r.descripcion || '')}" ${tiene ? 'checked' : ''}></td>`;
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

async function agregarUsuarioAutorizado(e) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const email = fd.get('email').trim().toLowerCase();
  const nombre = fd.get('nombre').trim();
  if (!email || !nombre) return;

  const { error } = await supabase.from('emails_autorizados').insert({
    email,
    nombre,
    es_superusuario: fd.get('es_superusuario') === 'on',
  });

  if (error) {
    alert('No se pudo agregar: ' + error.message);
    return;
  }
  form.reset();
  await cargarUsuariosAutorizados();
}

async function cargarUsuariosAutorizados() {
  const tbody = document.getElementById('usuarios-tbody');
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';

  const { data, error } = await supabase
    .from('emails_autorizados')
    .select('*')
    .order('email');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5">Error al cargar: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="5">Todavía no hay usuarios cargados.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(u => `
    <tr data-email="${escapeAttr(u.email)}">
      <td>${escapeHtml(u.email)}</td>
      <td class="celda-nombre-usuario">${escapeHtml(u.nombre)}</td>
      <td>${u.activo
        ? '<span class="badge badge-ok">Activo</span>'
        : '<span class="badge badge-off">Inactivo</span>'}</td>
      <td>${u.es_superusuario ? '<span class="badge badge-ok">Sí</span>' : 'No'}</td>
      <td>
        <button class="btn btn-text btn-sm" data-editar-usuario="${escapeAttr(u.email)}">Editar nombre</button>
        <button class="btn btn-text btn-sm" data-toggle-usuario="${escapeAttr(u.email)}" data-activo="${u.activo}">
          ${u.activo ? 'Desactivar' : 'Activar'}
        </button>
        <button class="btn btn-text btn-sm" data-borrar-usuario="${escapeAttr(u.email)}">Borrar</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-toggle-usuario]').forEach(btn =>
    btn.addEventListener('click', async () => {
      const { error: errToggle } = await supabase
        .from('emails_autorizados')
        .update({ activo: btn.dataset.activo !== 'true' })
        .eq('email', btn.dataset.toggleUsuario);
      if (errToggle) {
        alert('No se pudo actualizar: ' + errToggle.message);
        return;
      }
      await cargarUsuariosAutorizados();
    })
  );

  tbody.querySelectorAll('[data-borrar-usuario]').forEach(btn =>
    btn.addEventListener('click', async () => {
      if (!confirm(`¿Borrar a ${btn.dataset.borrarUsuario}? Va a perder el acceso a la app.`)) return;
      const { error: errDelete } = await supabase
        .from('emails_autorizados')
        .delete()
        .eq('email', btn.dataset.borrarUsuario);
      if (errDelete) {
        alert('No se pudo borrar: ' + errDelete.message);
        return;
      }
      await cargarUsuariosAutorizados();
    })
  );

  tbody.querySelectorAll('[data-editar-usuario]').forEach(btn =>
    btn.addEventListener('click', () => {
      const fila = btn.closest('tr');
      const celda = fila.querySelector('.celda-nombre-usuario');
      const nombreActual = celda.textContent;
      celda.innerHTML = `<input type="text" class="input-edicion" value="${escapeAttr(nombreActual)}">`;
      const input = celda.querySelector('input');
      input.focus();
      input.select();

      const accionesCelda = fila.children[4];
      accionesCelda.innerHTML = `
        <button class="btn btn-text btn-sm" data-guardar-usuario="${btn.dataset.editarUsuario}">Guardar</button>
        <button class="btn btn-text btn-sm" data-cancelar-edicion-usuario>Cancelar</button>
      `;

      accionesCelda.querySelector('[data-cancelar-edicion-usuario]').addEventListener('click', () => {
        cargarUsuariosAutorizados();
      });

      accionesCelda.querySelector('[data-guardar-usuario]').addEventListener('click', async () => {
        const nuevoNombre = input.value.trim();
        if (!nuevoNombre) return;
        const { error: errUpdate } = await supabase
          .from('emails_autorizados')
          .update({ nombre: nuevoNombre })
          .eq('email', btn.dataset.editarUsuario);
        if (errUpdate) {
          alert('No se pudo guardar: ' + errUpdate.message);
          return;
        }
        await cargarUsuariosAutorizados();
      });
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
