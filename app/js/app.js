import { supabase } from './supabaseClient.js';
import { signInWithGoogle, signOut, checkAutorizado } from './auth.js';
import { initProveedores } from './proveedores.js';
import { initInventario } from './inventario.js';
import { initStock } from './stock.js';
import { initOrdenes } from './ordenes.js';
import { initRecepciones } from './recepciones.js';
import { initConfiguracion } from './configuracion.js';
import { cargarPermisos, tienePermiso } from './permisos.js';

// roles: claves que requiere ver esta pantalla ('comprador', 'inventario').
// Vacío = visible para cualquier usuario autorizado, sin restricción de rol.
const navGroups = [
  {
    label: 'Maestros',
    items: [
      { key: 'proveedores', label: 'Proveedores', init: initProveedores, roles: ['inventario'] },
      { key: 'inventario', label: 'Inventario', init: initInventario, roles: ['inventario'] },
    ],
  },
  {
    label: 'Gestión',
    items: [
      { key: 'ordenes', label: 'Órdenes de compra', init: initOrdenes, roles: ['comprador'] },
      { key: 'recepciones', label: 'Recepciones', init: initRecepciones, roles: ['inventario'] },
      { key: 'stock', label: 'Stock', init: initStock, roles: ['inventario'] },
    ],
  },
  {
    label: 'Configuración',
    items: [
      { key: 'configuracion', label: 'Configuración', init: initConfiguracion, roles: [] },
    ],
  },
];

const screens = {
  login: document.getElementById('login-screen'),
  denied: document.getElementById('denied-screen'),
  app: document.getElementById('app-screen'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

function construirMenu() {
  const nav = document.getElementById('sidebar-nav');
  let primerItemVisible = null;

  nav.innerHTML = navGroups.map(grupo => {
    const itemsVisibles = grupo.items.filter(item => tienePermiso(item.roles));
    if (!itemsVisibles.length) return '';

    if (!primerItemVisible) primerItemVisible = itemsVisibles[0];

    const mostrarHeader = !(itemsVisibles.length === 1 && itemsVisibles[0].label === grupo.label);

    return `
      ${mostrarHeader ? `<div class="nav-group-label">${grupo.label}</div>` : ''}
      ${itemsVisibles.map(item =>
        `<button class="nav-item" data-section="${item.key}">${item.label}</button>`
      ).join('')}
    `;
  }).join('');

  nav.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => activarSeccion(btn.dataset.section));
  });

  return primerItemVisible;
}

async function activarSeccion(key) {
  document.querySelectorAll('.nav-item').forEach(b =>
    b.classList.toggle('active', b.dataset.section === key)
  );
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  document.getElementById('section-' + key).classList.remove('hidden');

  const item = navGroups.flatMap(g => g.items).find(i => i.key === key);
  if (item?.init) await item.init();
}

async function handleSession(session) {
  if (!session) {
    showScreen('login');
    return;
  }

  const user = session.user;
  const perfil = await checkAutorizado(user.email);

  if (!perfil) {
    document.getElementById('denied-email').textContent = user.email;
    showScreen('denied');
    return;
  }

  document.getElementById('user-name').textContent = perfil.nombre || user.email;
  showScreen('app');

  await cargarPermisos();
  const primerItem = construirMenu();
  if (primerItem) await activarSeccion(primerItem.key);
}

document.getElementById('btn-google-login').addEventListener('click', signInWithGoogle);
document.getElementById('btn-logout').addEventListener('click', signOut);
document.getElementById('btn-logout-denied').addEventListener('click', signOut);

supabase.auth.onAuthStateChange((_event, session) => {
  handleSession(session);
});

supabase.auth.getSession().then(({ data }) => handleSession(data.session));
