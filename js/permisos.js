import { supabase } from './supabaseClient.js';

let cache = null;

export async function cargarPermisos() {
  const [superRes, compradorRes, supervisorRes, operadorRes, configuradorRes] = await Promise.all([
    supabase.rpc('fn_es_superusuario'),
    supabase.rpc('fn_tiene_rol', { p_rol_nombre: 'Comprador' }),
    supabase.rpc('fn_tiene_rol', { p_rol_nombre: 'Supervisor de Almacén' }),
    supabase.rpc('fn_tiene_rol', { p_rol_nombre: 'Operador de Almacén' }),
    supabase.rpc('fn_tiene_rol', { p_rol_nombre: 'Configurador' }),
  ]);

  cache = {
    superusuario: superRes.data === true,
    comprador: compradorRes.data === true,
    supervisorAlmacen: supervisorRes.data === true,
    operadorAlmacen: operadorRes.data === true,
    configurador: configuradorRes.data === true,
  };
  return cache;
}

// rolesRequeridos: array de claves ('comprador', 'supervisorAlmacen',
// 'operadorAlmacen', 'configurador'). Si está vacío o no se pasa, se
// considera visible para cualquier usuario autorizado.
export function tienePermiso(rolesRequeridos) {
  if (!cache) return false;
  if (cache.superusuario) return true;
  if (!rolesRequeridos || !rolesRequeridos.length) return true;
  return rolesRequeridos.some(r => cache[r]);
}
