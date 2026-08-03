/**
 * Registro único de módulos y pantallas.
 *
 * Esta es la fuente de verdad para el encabezado compartido, el layout de
 * escritorio y la navegación lateral. Los módulos siguen controlando sus
 * pestañas internas; el shell solo las presenta de forma consistente.
 */
export const MODULE_REGISTRY = Object.freeze({
  inicio: {
    id: "inicio",
    title: "Autoservicio",
    pageTitle: "Herramientas",
    subtitle: "Elegí el módulo que querés usar",
    icon: "#icon-box",
    sidebarTitle: "",
    navSelector: ""
  },
  inventario: {
    id: "inventario",
    title: "Cargar",
    pageTitle: "Cargar",
    subtitle: "Registrar productos",
    icon: "#icon-box",
    sidebarTitle: "Inventario",
    navSelector: ".bottom-nav.app-bottom-nav"
  },
  vencimientos: {
    id: "vencimientos",
    title: "Vencimientos",
    pageTitle: "Vencimientos",
    subtitle: "Control de fechas",
    icon: "#icon-calendar",
    sidebarTitle: "Vencimientos",
    navSelector: "#pantallaVencimientos .venc-bottom-nav"
  },
  anotar: {
    id: "anotar",
    title: "Lista",
    pageTitle: "Lista",
    subtitle: "Agregar productos",
    icon: "#icon-list",
    sidebarTitle: "Lista",
    navSelector: "#pantallaAnotar .repo-bottom-nav"
  },
  precios: {
    id: "precios",
    title: "Precios",
    pageTitle: "Precios",
    subtitle: "Consultar precio",
    icon: "#icon-tag",
    sidebarTitle: "Precios",
    navSelector: "#pantallaPrecios .precios-bottom-nav"
  },
  horarios: {
    id: "horarios",
    title: "Horarios",
    pageTitle: "Horarios",
    subtitle: "Turnos del equipo",
    icon: "#icon-clock",
    sidebarTitle: "Horarios",
    navSelector: "#pantallaHorarios .horarios-bottom-nav"
  },
  tareas: {
    id: "tareas",
    title: "Tareas",
    pageTitle: "Tareas",
    subtitle: "Organización semanal",
    icon: "#icon-tasks",
    sidebarTitle: "Tareas",
    navSelector: "#pantallaTareas .tareas-bottom-nav"
  },
  ajustes: {
    id: "ajustes",
    title: "Configuración",
    pageTitle: "Configuración",
    subtitle: "",
    icon: "#icon-settings",
    sidebarTitle: "",
    navSelector: ""
  },
  admin: {
    id: "admin",
    title: "Administrador",
    pageTitle: "Administrador",
    subtitle: "Usuarios e historial",
    icon: "#icon-shield",
    sidebarTitle: "Administrador",
    navSelector: "#pantallaAdmin .admin-bottom-nav"
  }
});

const SCREEN_ALIASES = Object.freeze({
  productos: "inventario",
  cargados: "inventario",
  editarProducto: "inventario"
});

const PAGE_OVERRIDES = Object.freeze({
  productos: { pageTitle: "Productos", subtitle: "Consultar productos", icon: "#icon-box" },
  cargados: { pageTitle: "Cargados", subtitle: "Conteos realizados", icon: "#icon-box" },
  editarProducto: { pageTitle: "Editar producto", subtitle: "Modificar producto", icon: "#icon-edit" }
});

export function resolveModule(screenName = "inicio") {
  const moduleId = SCREEN_ALIASES[screenName] || screenName;
  const base = MODULE_REGISTRY[moduleId] || MODULE_REGISTRY.inicio;
  const override = PAGE_OVERRIDES[screenName] || {};
  return Object.freeze({ ...base, ...override, moduleId, screenName });
}

export function getDesktopNavigationSource(screenName = "inicio") {
  const module = resolveModule(screenName);
  if (!module.navSelector) return null;
  return {
    moduleId: module.moduleId,
    title: module.sidebarTitle || module.title,
    icon: module.icon,
    selector: module.navSelector
  };
}
