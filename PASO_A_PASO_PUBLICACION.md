# Publicación del SITIO WEB ADDISON (versión multi-proyecto)

## Qué contiene esta carpeta

| Archivo | Función |
|---|---|
| `index.html` | Portada corporativa pública + botón INGRESAR APP (login) + DESCARGAR APP |
| `empresas.html` | Selector de empresas (CVM / CVG Bauxilum) — requiere sesión |
| `app-cvm-santabarbara.html` | Centro de Control — Tanques CIP/CIL Planta Santa Bárbara |
| `app-bauxilum-mb32.html` | Centro de Control — Molino de Bolas MB-32-102 |
| `app-bauxilum-agua.html` | PFD interactivo — Tratamiento de Agua Industrial |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | La APP instalable (PWA) con funcionamiento sin conexión |

## Acceso

- Usuario administrador: `admin` · Clave: la definida (ADDISON2026). Único con acceso total.
- La clave NO está escrita en el código: se valida contra un hash.
- Flujo: `index.html` → INGRESAR APP → login → `empresas.html` → elegir empresa → elegir proyecto.
- Cerrar sesión desde el botón ⎋ en `empresas.html`.

> Nota técnica: al ser un sitio 100 % estático, la protección es de nivel disuasorio
> (del lado del navegador). Para confidencialidad real ante terceros técnicos,
> publicar detrás de un hosting con autenticación (p. ej. Cloudflare Access).

## Probar en la computadora

Doble clic a `index.html` (Chrome/Edge). Todo funciona localmente; solo la
instalación PWA requiere que esté publicado en internet (https).

## Publicar gratis (Netlify)

1. Entra a https://app.netlify.com → "Add new site" → "Deploy manually".
2. Arrastra la carpeta `SITIO WEB ADDISON` completa.
3. Netlify da una dirección https — desde ella funciona INSTALAR APP en Android/iPhone.
4. En `index.html` reemplaza `REEMPLAZAR-DOMINIO` por el dominio definitivo (SEO).

## Actualizar contenido

Las APPs de proyecto son copias de las que están en las carpetas de cada proyecto.
Si se actualizan las originales, avisar a Claude para regenerar las copias con el
candado de seguridad, o repetir la inyección de la guardia de sesión.
