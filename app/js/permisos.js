import { supabase } from './supabaseClient.js';

let cache = null;

export async function cargarPermisos() {
  const [superRes, compradorRes, inventarioRes] = await Promise.all([
    supabase.rpc('fn_es_superusuario'),
    supabase.rpc('fn_tiene_rol', { p_rol_nombre: 'Comprador' }),
    supabase.rpc('fn_tiene_rol', { p_rol_nombre: 'Inventario' }),
  ]);

  cache = {
    superusuario: superRes.data === true,
    comprador: compradorRes.data === true,
    inventario: inventarioRes.data === true,
  };
  return cache;
}

// rolesRequeridos: array de claves ('comprador', 'inventario'). Si está
// vacío o no se pasa, se considera visible para cualquier usuario
// autorizado (sin restricción de rol puntual).
export function tienePermiso(rolesRequeridos) {
  if (!cache) return false;
  if (cache.superusuario) return true;
  if (!rolesRequeridos || !rolesRequeridos.length) return true;
  return rolesRequeridos.some(r => cache[r]);
}
