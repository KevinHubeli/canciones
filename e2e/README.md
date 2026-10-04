# Pruebas de punta a punta

Prueban la app corriendo de verdad (HTTP y navegador). Escriben en la base real
y limpian lo que crean, así que usalas contra una base de desarrollo.

1. Levantar la app con un usuario de prueba:

   ADMIN_USER=tester ADMIN_PASSWORD=tmp-pass-123 SESSION_SECRET=algo-largo npx next dev -p 3100

2. En otra terminal: `npm run test:e2e`

Variables opcionales: E2E_URL, E2E_USER, E2E_PASS.
