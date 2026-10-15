# TrafficNexus Web

Versión web de la app Android **TrafficNexus** (gestión de cuadrillas de semaforización) con las mismas funciones,
conectada al backend Go `TrafficNexusBackCore`.

- **Cuadrillas**: lista, creación/edición (integrantes por cargo, celular corporativo, placa), horario por cuadrilla
  (turnos habituales por día y turnos de fecha/festivo) y vista semanal con relevos (≤ 60 min) y cruces.
- **Vehículos**: placas, cajas por grupo del inventario, cantidades, consumos (operadores), chequeos de herramienta,
  mover caja entre placas, historial de movimientos y chequeos.
- **Inventario**: grupos (herramienta / consumible) e ítems, renombrar, reordenar, eliminar con bloqueo si hay stock.
- **Externos**: mapa (Leaflet + CARTO dark, sin llave de Google), carga de KML/KMZ, búsqueda, frentes de trabajo
  (WF#), capas persistidas, detalle del punto y versiones del mapa.
- **Admin**: usuarios (crear/editar/eliminar, generar contraseña), miembros del proyecto, proyectos.

## Requisitos

- Node 20+ (probado con Node 24)
- Backend `TrafficNexusBackCore` corriendo (por defecto en `http://localhost:8080`)

## Desarrollo

```bash
npm install
cp .env.example .env     # opcional, ver variables abajo
npm run dev              # http://localhost:5173
```

En desarrollo Vite hace de proxy de `/v1/*` hacia el backend (`VITE_DEV_PROXY_TARGET`), así el navegador habla
siempre con el mismo origen y **no hace falta CORS** en el backend.

### Variables de entorno

| Variable                | Uso                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`     | Base del API en el bundle. Vacío = mismo origen (recomendado). Ej.: `https://api.midominio.com`       |
| `VITE_DEV_PROXY_TARGET` | Solo desarrollo: a dónde reenvía Vite las llamadas `/v1`. Por defecto `http://localhost:8080`         |

## Scripts

| Script              | Qué hace                                  |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Servidor de desarrollo con proxy al API   |
| `npm run build`     | Typecheck + build de producción en `dist` |
| `npm run preview`   | Sirve `dist` localmente                   |
| `npm run test`      | Pruebas unitarias (Vitest)                |
| `npm run lint`      | oxlint                                    |
| `npm run typecheck` | `tsc -b`                                  |

## Despliegue

El build es estático (`dist/`). Hay dos formas de conectar con el backend:

1. **Mismo origen (recomendado)**: servir `dist/` detrás de un reverse proxy (Nginx, Caddy, etc.) que reenvíe
   `/v1/*` al servicio Go. `VITE_API_BASE_URL` queda vacío. No se necesita CORS.
2. **Orígenes distintos**: compilar con `VITE_API_BASE_URL=https://api...`. En este caso **el backend Go debe
   agregar cabeceras CORS** (hoy no las tiene), permitiendo el origen del front, `Authorization` y
   `Content-Type`.

Como la app usa rutas del navegador (`/cuadrillas`, `/vehiculos`, …), el servidor estático debe devolver
`index.html` para cualquier ruta desconocida (SPA fallback).

## Arquitectura

Arquitectura limpia, con dependencias apuntando hacia el dominio:

```
src/
  domain/          Modelos, reglas de negocio puras y contratos (sin React, sin fetch)
    model/         Crew, Shift, Vehicle, Kit, InventoryGroup, Map, User...
    schedule/      Fechas civiles, regla de relevo (60 min), semana, festivos
    validation/    Placas, celulares, nombres, correos, inventario
    map/           Frentes de trabajo (WF#) por cercanía a los trazos
    repository/    Interfaces de repositorios (puertos)
  application/     Casos de uso como hooks (TanStack Query), contenedor de dependencias, sesión
  infrastructure/  Adaptadores: cliente HTTP (JWT, timeouts, mapeo de errores), DTOs y mappers del
                   backend, almacenamiento del navegador, parser KML/KMZ
  presentation/    React: tema (colores de marca), componentes UI, páginas por feature
```

- Autenticación JWT; el token vive en `sessionStorage` y se descarta ante un 401.
- Las reglas (relevo de placas, cantidades, duplicados) se validan en cliente **y** las aplica el backend.
- Interfaz en español, tema oscuro con los colores y logos de la marca.

## Pruebas

```bash
npm run test
```

Cubren fechas civiles, reglas de horario (relevos, nocturnos, festivos), validadores y el parser KML con los
frentes de trabajo.
