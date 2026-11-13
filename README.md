# Nunki

Gestión para peluquerías y barberías: agenda y reserva online, recordatorios por WhatsApp, comandas, caja diaria con pagos mixtos, comisiones y liquidaciones, stock por receta, compras y Sasha, la asistente con IA.

Nunki nace del código de h.A.I.r y lo reemplaza a futuro. Mientras tanto conviven en el **mismo proyecto Supabase**: h.A.I.r usa el esquema `public` y Nunki el esquema `nunki`. Cuando Uky se migre a Nunki, se borran las tablas de `public`.

## Puesta en marcha

1. **Base de datos.** En el SQL Editor de Supabase ejecutar, en orden:
   - `supabase/migrations/0001_nunki_schema.sql` (clona la estructura de las tablas de h.A.I.r en `nunki`, sin datos, con seguridad por salón)
   - `supabase/migrations/0002_reserva_online.sql` (funciones públicas de reserva)
2. **Exponer el esquema.** Project Settings › API › Exposed schemas → agregar `nunki`.
3. **Edge functions.**
   ```bash
   supabase functions deploy nunki-sasha
   supabase functions deploy nunki-admin-update-password
   supabase secrets set GEMINI_API_KEY=...   # nueva clave, nunca en el frontend
   ```
4. **Primer salón y usuario.** Crear el usuario en Authentication y luego:
   ```sql
   insert into nunki.empresas (nombre, slug) values ('Mi salón', 'mi-salon') returning id;
   insert into nunki.usuarios (id, empresa_id, nombre_completo, email, rol)
   values ('<id de auth.users>', '<id de la empresa>', 'Nombre', 'mail@ejemplo.com', 'super_admin');
   ```
5. **Local.** Copiar `.env.example` a `.env`, completar y correr `npm install` y `npm run dev`.

## Deploy

`deploy.ps1` compila en Cloud Build y despliega el servicio `nunki-app` en Cloud Run. Las variables `VITE_*` se leen del `.env` local.

## Estructura

- `src/pages/Landing.jsx` — landing comercial (marca y contacto en el bloque `BRAND`)
- `src/pages/Reserva.jsx` — página pública de reserva `/r/<slug>`
- `src/pages/Reservas.jsx` — recordatorios por WhatsApp y configuración de la reserva online
- `src/lib/roles.js` — roles en un solo lugar (la seguridad real está en RLS)
- `src/components/NunkiLogo.jsx` — símbolo y logotipo
- `supabase/migrations/` — esquema `nunki`
- `supabase/referencia-hair/` — scripts originales de h.A.I.r, solo como referencia

## Marca

Paleta Bosque y cobre: bosque `#0F2A24`, cobre `#D9824A`, salvia `#9DB8A8`, hueso `#F3EFE7`. Tipografías Space Grotesk (títulos) e Inter (texto). Modo oscuro por defecto y modo claro con `body.light-theme`.
