# Cierre de Caja — Almenis

## Configuración inicial

### 1. Variables de entorno

Crea el archivo `.env` en esta carpeta (copia de `.env.example`):

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

Ambas las encuentras en Supabase → Project Settings → API.

### 2. Base de datos Supabase

En el SQL Editor de Supabase, ejecuta el archivo:
```
supabase/migrations/001_schema.sql
```

### 3. Edge Function

Despliega la Edge Function con la Supabase CLI:

```bash
supabase functions deploy generar-cierre
```

Luego agrega los secrets en Supabase → Edge Functions → Secrets:
- `CLAUDE_API_KEY` = tu API key de Anthropic

### 4. Cargar la base de tratamientos

En Supabase → Table Editor → tratamientos, importa las filas del Excel.
Las columnas necesarias son: `id`, `nombre`, `categoria`, `valor`, `gratuito`.

### 5. Crear usuarios

En Supabase → Authentication → Users, crea los usuarios con email/password.

Luego en la tabla `usuarios`, actualiza manualmente:
- `rol`: `admin` para recepcionistas / `profesional` para doctores
- `profesional_nombre`: debe coincidir EXACTAMENTE con el texto en la columna Box/Prof del PDF de Reservo
  - Ejemplo: `Dra. Magdalena Sepúlveda Suárez`

### 6. Desarrollo local

```bash
npm run dev
```

### 7. Deploy en Vercel

```bash
npm run build
```

Luego en Vercel, conecta el repositorio y configura las variables de entorno:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## Flujo de uso

1. Recepcionista descarga el PDF desde Reservo.cl
2. Entra a la app y sube el PDF (datos de pacientes nunca salen del computador)
3. Revisa el listado anonimizado y presiona "Generar Cierre con IA"
4. Claude hace el match tratamiento → valor de la BD
5. El cierre queda guardado en Supabase
6. Cada profesional puede entrar con su login y ver solo su cierre

## Privacidad

- RUT, nombre, teléfono y ficha de pacientes: procesados solo en el browser, nunca se envían a ningún servidor
- La API key de Claude nunca sale al cliente (vive en la Edge Function de Supabase)
