# Evidencias de una orden de trabajo (cliente web)

Cómo la web debe **listar y mostrar** las fotos de evidencia de una OT. La captura la hace la app Android; el bucket GCS es **privado**. El navegador **no** habla con GCS con credenciales propias: solo usa el API Go (`TrafficNexusBackCore`) y las **URLs firmadas** (`readUrl`) que el API devuelve.

Contrato completo (upload, verify, delete, storage):  
`TrafficNexusBackCore/docs/evidencias-storage-verify.md`.

## Auth y alcance

- Mismas rutas `/v1/...` y `Authorization: Bearer <JWT>` que el resto de la web.
- Prefijo: `/v1/projects/{projectId}`.
- El usuario debe ser miembro del proyecto (403 si no).
- Roles: listar / ver detalle / actualizar `caption` → OPERATOR y ADMIN.

## Flujo recomendado en la UI de OT

```text
1. Usuario abre detalle de OT (ya tienes workOrderId + projectId de sesión).
2. GET .../work-orders/{workOrderId}/evidences
3. Pintar álbum / galería con cada ficha:
   - miniatura o full: <img src={readUrl} /> (o fetch → blob URL si hace falta)
   - meta: photoCode, capturedAt, caption, createdByName, addressText, …
4. Si readUrl venció o la imagen falla (403/404 del signed URL):
   - GET .../evidences/{evidenceId}  → nueva readUrl
   - o volver a listar la OT
5. (Opcional) Editar nota: PATCH .../evidences/{id} { "caption": "..." }
```

**No** implementes upload desde la web en esta fase salvo que producto lo pida. El álbum web es de **lectura** (+ nota opcional).

## 1. Listar evidencias de la OT

```http
GET /v1/projects/{projectId}/work-orders/{workOrderId}/evidences
Authorization: Bearer <jwt>
```

- Por defecto solo estado **`READY`** (fotos ya subidas y confirmadas).
- Query opcional: `?status=READY|PENDING_UPLOAD|FAILED|DELETED` (solo si la UI lo necesita).
- Orden: **más reciente primero**.

### Respuesta 200

```json
[
  {
    "id": "uuid",
    "photoCode": "ABCD2345EFGH67",
    "status": "READY",
    "capturedAt": "2026-10-25T13:55:00-05:00",
    "serverReceivedAt": "2026-10-25T13:55:12-05:00",
    "addressText": "Cl. 42 Sur # 78H-28, …",
    "externalNumber": "3468",
    "directionText": "TV 78H X CL 42 SUR",
    "caption": "Poste dañado, lado norte",
    "createdByName": "Juan Pérez",
    "byteSize": 420000,
    "readUrl": "https://storage.googleapis.com/…&X-Goog-Signature=…",
    "readUrlExpiresAt": "2026-10-25T14:10:00Z"
  }
]
```

| Campo | Uso en web |
| --- | --- |
| `id` | Key de lista; detalle / PATCH / refresh de URL |
| `photoCode` | Código quemado en el watermark; mostrar en UI si aplica |
| `status` | En listado default siempre `READY` |
| `capturedAt` | Hora de captura (cliente) |
| `serverReceivedAt` | Hora de confirmación en servidor |
| `addressText` / `externalNumber` / `directionText` | Snapshot de la OT al capturar |
| `caption` | Nota libre del operador (puede ser `""`) |
| `createdByName` | Quién tomó la foto |
| `byteSize` | Peso del JPEG |
| `readUrl` | **URL firmada GET** para mostrar/descargar la imagen |
| `readUrlExpiresAt` | Caducidad de `readUrl` (usar para refrescar) |

Lista vacía `[]` = OT sin evidencias listas (no es error).

## 2. Mostrar la imagen (`readUrl`)

1. Usa `readUrl` directo en `<img src="…" />`, lightbox o descarga.
2. La URL apunta al **objeto privado** en GCS con firma V4; **no** construyas paths del bucket a mano.
3. TTL típico del GET firmado: ~15 min (`EVIDENCE_READ_TTL_SECONDS` en el back, default 900). No caches la URL como permanente.
4. Si la imagen deja de cargar por vencimiento:
   - `GET /v1/projects/{projectId}/evidences/{evidenceId}` → ficha con `readUrl` nueva, o
   - re-ejecuta el listado de la OT.
5. CORS: el GET a GCS lo hace el **navegador** hacia `storage.googleapis.com`. Si el bucket/CORS de GCS no permite el origen de la web, opciones:
   - configurar CORS en el bucket para el origen de TrafficNexusWeb, o
   - proxy de lectura vía el API (hoy no está; preferir CORS en bucket si hace falta).

En desarrollo con proxy Vite (`/v1` → Go), las llamadas al **API** no necesitan CORS; las de **`readUrl`** sí dependen de GCS.

## 3. Detalle de una evidencia

```http
GET /v1/projects/{projectId}/evidences/{evidenceId}
```

Misma ficha que en el listado (incluye `readUrl` / `readUrlExpiresAt` frescas). Útil al abrir una foto o al refrescar una sola URL.

## 4. Actualizar nota (`caption`) — opcional

```http
PATCH /v1/projects/{projectId}/evidences/{evidenceId}
Content-Type: application/json

{ "caption": "Texto libre del operador" }
```

- Campo JSON / DB: **`caption`** (`string`, puede ser `""`).
- **200:** ficha completa actualizada.
- La app Android ya usa este campo; la web puede editarlo o solo mostrarlo.

## 5. Qué no hacer

- No subas archivos al bucket desde la web con service account / keys en el front.
- No asumas URLs públicas tipo Firebase Storage.
- No uses `photoCode` como id de archivo; el id de API es `id` (uuid).
- No trates `PENDING_UPLOAD` / `FAILED` como fotos visibles en el álbum normal (el listado default las omite).
- Soft-delete (`DELETED`): desaparecen del listado default; no las muestres como álbum activo.

## 6. Errores útiles

| HTTP | Significado |
| --- | --- |
| 401 | Sin JWT / sesión vencida → re-login |
| 403 | No miembro del proyecto |
| 404 | Proyecto, OT o evidencia inexistente |
| 503 | Storage/firma no configurados en el back |

Si el API responde 200 pero `readUrl` está vacío, la ficha existe pero no se pudo firmar GET: mostrar meta + aviso “imagen no disponible”.

## 7. Encaje sugerido en este repo

Siguiendo la arquitectura limpia actual:

| Capa | Qué agregar |
| --- | --- |
| `domain/model` | `EvidencePhoto` (`id`, `photoCode`, `caption`, `readUrl`, …) |
| `domain/repository` | `listByWorkOrder(projectId, workOrderId)`, `get(projectId, evidenceId)`, opcional `updateCaption` |
| `infrastructure/api` | DTOs + `GET .../work-orders/{id}/evidences`, etc. (mismo `HttpClient` JWT) |
| `application` | Query key p.ej. `['project', projectId, 'work-orders', workOrderId, 'evidences']` |
| `presentation` | Sección/galería en detalle de OT |

## 8. Ejemplo mínimo (TypeScript)

```ts
// GET listado
const evidences = await http.get<EvidenceDto[]>(
  `/v1/projects/${projectId}/work-orders/${workOrderId}/evidences`,
)

// Mostrar
// <img src={evidences[0].readUrl} alt={evidences[0].caption || evidences[0].photoCode} />

// Refresco de una URL vencida
const fresh = await http.get<EvidenceDto>(
  `/v1/projects/${projectId}/evidences/${evidenceId}`,
)
```

## Resumen

| Acción | Método y ruta |
| --- | --- |
| Álbum de la OT | `GET /v1/projects/{projectId}/work-orders/{workOrderId}/evidences` |
| Ver / refrescar una foto | `GET /v1/projects/{projectId}/evidences/{evidenceId}` |
| Mostrar bytes | Usar `readUrl` (signed GET); renovar si expira |
| Nota | Campo **`caption`**; opcional `PATCH .../evidences/{id}` |
