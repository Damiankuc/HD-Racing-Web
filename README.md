# 🏁 HD Racing - Catálogo Web Oficial

> **MOTOS | ACCESORIOS | INDUMENTARIA**  
> *DISCIPLINA · MOTOR · LIBERTAD · PASIÓN*

Plataforma web oficial para la visualización del catálogo de productos y disponibilidad de stock en tiempo real de **HD Racing**, desplegable en **Vercel** e integrable con el sistema de gestión/POS central.

---

## 🚀 Características Principales

- **Disponibilidad de Stock en Tiempo Real**: Los clientes pueden ver si un producto está **En Stock**, con **Últimas Unidades** o **Sin Stock**.
- **Buscador Inteligente con Fuse.js**: Búsqueda instantánea y tolerante a faltas de ortografía por nombre de producto, SKU, categoría o descripción.
- **Filtros por Categoría & Disponibilidad**: Navegación por pills (Indumentaria, Cascos y Protección, Accesorios Wirtz, Repuestos, etc.) y selector de "Solo productos con stock".
- **Carrito de Pedidos Dinámico**:
  - Selector de cantidades con validación automática contra stock físico.
  - Detección de **Precios Mayoristas** automáticos al llevar 5 o más unidades.
  - Selección de método de pago preferido: **Efectivo / Local** o **Transferencia / Alias**.
  - Modal de datos de transferencia con un clic para copiar el Alias (`HDRACING.OFICIAL`).
- **Checkout Directo por WhatsApp**: Genera automáticamente un mensaje estructurado y prolijo con los productos, SKUs, totales y forma de pago para confirmar directamente con el equipo de ventas.
- **Doble Modo de Operación**:
  - **Modo Supabase RPC**: Conectado directamente a la tienda de HD Racing (`hdracing@gmail.com`) en el backend SaaS de DH Motopartes mediante `get_public_catalog`.
  - **Modo Local JSON (`hdracing_db.json`)**: Respaldo automático local si Supabase no está disponible.

---

## 📁 Estructura del Proyecto

```text
HD-Racing-Web/
├── index.html            # Estructura semántica, accesibilidad y componentes UI
├── style.css             # Sistema de diseño dark racing, rojo pasión, animaciones y responsive
├── app.js                # Lógica del cliente, carrito, buscador Fuse.js, Supabase RPC y WhatsApp
├── hdracing_db.json      # Base de datos de catálogo (productos, categorías y configuraciones)
├── hd-racing-logo.jpg    # Emblema e identidad oficial de HD Racing
├── vercel.json           # Configuración de despliegue en Vercel y reescritura de URLs
├── sync_to_github.py     # Script de sincronización con el inventario del sistema POS
└── README.md             # Documentación del proyecto
```

---

## 🛠️ Cómo Probar Localmente

Podés abrir `index.html` directamente en tu navegador o servirlo con cualquier servidor local:

```bash
# Con Python
python -m http.server 8080

# Con Node (npx)
npx serve .
```

Luego ingresá a `http://localhost:8080` en tu navegador.

---

## 🌐 Despliegue en Vercel

1. Subir el repositorio a GitHub: `https://github.com/<tu-usuario>/HD-Racing-Web`.
2. Conectar el repositorio en [Vercel](https://vercel.com).
3. Vercel detectará la configuración `vercel.json` y desplegará el catálogo estático en menos de 1 minuto.
