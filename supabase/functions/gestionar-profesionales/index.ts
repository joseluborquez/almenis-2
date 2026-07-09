import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError('No autorizado', 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return jsonError('No autorizado', 401)

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (usuario?.rol !== 'admin') {
      return jsonError('Solo administradores pueden gestionar profesionales', 403)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const body = await req.json()

    if (body.accion === 'crear') {
      const { email, password, nombre_completo, profesional_nombre } = body

      if (!email || !password || !nombre_completo || !profesional_nombre) {
        return jsonError('Faltan datos: email, password, nombre_completo, profesional_nombre', 400)
      }
      if (password.length < 8) {
        return jsonError('La contraseña debe tener al menos 8 caracteres', 400)
      }

      const { data: creado, error: eCrear } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre_completo, rol: 'profesional', profesional_nombre },
      })

      if (eCrear) return jsonError(eCrear.message, 400)

      return new Response(JSON.stringify({ id: creado.user.id, email: creado.user.email }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.accion === 'actualizar_modalidad') {
      const { id, modalidad_pago, porcentaje_almenis } = body

      const MODALIDADES = ['porcentaje', 'arriendo', 'sueldo_fijo']
      if (!id || !MODALIDADES.includes(modalidad_pago)) {
        return jsonError('modalidad_pago inválida', 400)
      }
      if (modalidad_pago === 'porcentaje') {
        if (!Number.isInteger(porcentaje_almenis) || porcentaje_almenis < 0 || porcentaje_almenis > 100) {
          return jsonError('porcentaje_almenis debe ser un entero entre 0 y 100', 400)
        }
      }

      const { data: objetivo } = await supabaseAdmin
        .from('usuarios')
        .select('rol')
        .eq('id', id)
        .single()

      if (!objetivo || objetivo.rol !== 'profesional') {
        return jsonError('Solo se puede modificar la modalidad de profesionales', 400)
      }

      const { error: eActualizar } = await supabaseAdmin
        .from('usuarios')
        .update({
          modalidad_pago,
          porcentaje_almenis: modalidad_pago === 'porcentaje' ? porcentaje_almenis : 30,
        })
        .eq('id', id)

      if (eActualizar) return jsonError(eActualizar.message, 400)

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.accion === 'eliminar') {
      const { id } = body
      if (!id) return jsonError('Falta el id del profesional', 400)

      const { data: objetivo } = await supabaseAdmin
        .from('usuarios')
        .select('rol')
        .eq('id', id)
        .single()

      if (!objetivo || objetivo.rol !== 'profesional') {
        return jsonError('Solo se pueden eliminar cuentas de profesionales', 400)
      }

      const { error: eEliminar } = await supabaseAdmin.auth.admin.deleteUser(id)
      if (eEliminar) return jsonError(eEliminar.message, 400)

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return jsonError('Acción inválida', 400)

  } catch (error) {
    // El detalle queda en los logs de la función; al cliente solo un mensaje genérico
    console.error('gestionar-profesionales error:', error)
    return jsonError('Error interno al gestionar profesionales. Revisa los logs de la función.', 500)
  }
})
