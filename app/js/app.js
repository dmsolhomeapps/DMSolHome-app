import { supabase } from './supabaseClient.js';
import { signInWithGoogle, signOut, checkAutorizado } from './auth.js';
import { initProveedores } from './proveedores.js';
import { initInventario } from './inventario.js';

const sectionInitializers = {
  inventario: initInventario,
};

const screens = {
  login: document.getElementById('login-screen'),
  denied: document.getElementById('denied-screen'),
  app: document.getElementById('app-screen'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
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
  await initProveedores();
}

document.getElementById('btn-google-login').addEventListener('click', signInWithGoogle);
document.getElementById('btn-logout').addEventListener('click', signOut);
document.getElementById('btn-logout-denied').addEventListener('click', signOut);

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    document.getElementById('section-' + btn.dataset.section).classList.remove('hidden');

    const init = sectionInitializers[btn.dataset.section];
    if (init) await init();
  });
});

supabase.auth.onAuthStateChange((_event, session) => {
  handleSession(session);
});

supabase.auth.getSession().then(({ data }) => handleSession(data.session));
