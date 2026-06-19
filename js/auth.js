import { supabase } from './supabaseClient.js';

export async function signInWithGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
}

export async function signOut() {
  await supabase.auth.signOut();
}

// Devuelve la fila de emails_autorizados si el mail está habilitado y activo,
// o null si no está autorizado (aunque el login con Google haya funcionado).
export async function checkAutorizado(email) {
  const { data, error } = await supabase
    .from('emails_autorizados')
    .select('email, nombre, activo')
    .eq('email', email)
    .eq('activo', true)
    .maybeSingle();

  if (error) {
    console.error('Error verificando autorización:', error);
    return null;
  }
  return data;
}
