# 05 — Autenticación

- **NextAuth** con `CredentialsProvider` (email + contraseña con `bcryptjs`), sesión JWT
- `src/middleware.ts` protege todo `/admin/*` excepto `/admin/acceso`, redirigiendo al
  login si no hay sesión
- `src/lib/rate-limit.ts` limita intentos de login: 10/10min por IP, 5/15min por email
  (en memoria — si se despliega con más de una réplica, migrar a Redis)
- `role` en `User` está en el JWT y en la sesión, pero hoy no hay ninguna ruta que
  distinga por rol (un único usuario). Se activará cuando haya multi-usuario real.

No hay registro público de usuarios: se crean con `npm run db:seed` o directamente en
la base de datos.
