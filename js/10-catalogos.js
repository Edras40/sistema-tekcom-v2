// ============================================================
// 10-catalogos.js  —  Catálogos del sistema (listas desplegables editables)
// Parte de la aplicación NOC Tekcom. Se carga en orden desde index.html;
// NO reordenar las etiquetas <script> ni renombrar estos archivos.
//
// Idea general:
//  - Todas las listas desplegables "de negocio" (cuadrillas, causas,
//    puestos, zonas, etc.) del sistema quedaron mapeadas en CATALOGO_CONFIG.
//  - Los <option> que ya existen en el HTML se dejan intactos: sirven de
//    respaldo automático si Supabase no responde o la categoría está vacía.
//  - Al cargar la sesión se piden los catálogos a Supabase y, si una
//    categoría tiene datos, se reemplazan las opciones de sus <select>
//    asociados (conservando el valor ya seleccionado si sigue existiendo).
//  - La vista "Catálogos" permite agregar/editar/eliminar cada opción sin
//    tocar código; al guardar, se vuelve a aplicar a todos los <select>.
// ============================================================

const CATALOGOS_REST_URL = `${SUPABASE_URL}/rest/v1/catalogos`;

const CATALOGO_CONFIG = {
  'estatus_casos': { label: 'Estatus (Casos/Actividades)', selects: ['casoStatusFilter', 'cableStatusFilter', 'act_estatus', 'actEstatusFilter', 'c_status', 'cb_status'] },
  'causas': { label: 'Causas', selects: ['pl_causa', 'c_causa', 'h_causa', 'u_causa', 'cb_causa'] },
  'zonas_generales': { label: 'Zonas (Central/Occidente/Oriente)', selects: ['plEstatusZona', 'dashCumpZonaFilter', 'cumpZona', 'cb_zona'] },
  'zonas_cuadrilla': { label: 'Zonas de Cuadrilla (filtros)', selects: ['cuadrillaFilter', 'c_zona'] },
  'puestos': { label: 'Puestos', selects: ['puestoFilter', 'f_puesto'] },
  'estado_gps': { label: 'Estado GPS', selects: ['estadoGpsFilter', 'v_estado_gps'] },
  'estatus_hyve': { label: 'Estatus HYVE', selects: ['hyveStatusFilter', 'h_status'] },
  'tipo_afectacion': { label: 'Tipo de Afectación', selects: ['plEstatusTipoAfectacion', 'pl_tipo_afectacion'] },
  'cumplimiento_si_no': { label: 'Cumplimiento (Sí/No)', selects: ['cumpCumplimientoFilter', 'cumpCumplimiento'] },
  'zonas_accesos': { label: 'Zonas de Accesos', selects: ['accesoZonaFilter'] },
  'cumplimiento_proyecto': { label: 'Proyecto (Cumplimiento)', selects: ['cumpProyecto'] },
  'motivos_incumplimiento': { label: 'Motivos de Incumplimiento', selects: ['cumpMotivo'] },
  'actividades_proyecto': { label: 'Proyecto (Actividades)', selects: ['act_proyecto'] },
  'tipo_mantenimiento': { label: 'Tipo de Mantenimiento', selects: ['act_mantenimiento'] },
  'cuadrillas': { label: 'Cuadrillas', selects: ['f_cuadrilla'] },
  'inbuilding_outdoor': { label: 'Inbuilding / Outdoor', selects: ['s_inbuilding'] },
  'clasificacion_movistar': { label: 'Clasificación (Movistar)', selects: ['c_clasificacion'] },
  'red': { label: 'Red', selects: ['c_red'] },
  'clasificacion_udp': { label: 'Clasificación (UDP)', selects: ['u_clasificacion'] },
  'estatus_udp': { label: 'Estatus (UDP)', selects: ['u_status'] },
  'sub_categoria': { label: 'Sub Categoría', selects: [], especial: 'sub_categoria',
    nota: 'Se usa en: Casos Movistar, HYVE, UDP, Cable Color y Plantillas de Avance (buscador de Sub Categoría)' },
  // NOTA: 'velocidad_voz', 'plantillas_proyecto_filtro', 'plantillas_estado_filtro',
  // 'plantillas_avance_estado', 'plantillas_estatus_valor', 'plantillas_motivo_actualizacion',
  // 'tipo_operador' y 'roles_usuario' se excluyeron a propósito: sus <option value="..">
  // guardan un CÓDIGO interno distinto del texto que se muestra (ej. value="casos" pero
  // se ve "Casos Movistar"), y ese código lo usa el resto del sistema para filtrar y
  // tomar decisiones. Convertirlas en catálogo (texto editable) rompía esa lógica interna.
};
const CATALOGO_KEYS = Object.keys(CATALOGO_CONFIG);

let CATALOGOS_DATA = {};   // categoria -> [{id, valor, orden}, ...]
let catalogosLoaded = false;
let catalogoTabActiva = CATALOGO_KEYS[0];

/* ---- Carga desde Supabase ---- */
async function fetchCatalogos(force){
  if(catalogosLoaded && !force) return;
  try{
    const res = await fetch(`${CATALOGOS_REST_URL}?select=*&order=categoria.asc,orden.asc,id.asc`, { headers: sbHeaders });
    if(!res.ok) throw new Error(await res.text());
    const filas = await res.json();
    const agrupado = {};
    filas.forEach(f => {
      if(!agrupado[f.categoria]) agrupado[f.categoria] = [];
      agrupado[f.categoria].push(f);
    });
    CATALOGOS_DATA = agrupado;
    catalogosLoaded = true;
    aplicarCatalogosATodosLosSelects();
    if(document.getElementById('view-catalogos')?.classList.contains('active')){
      renderCatalogosTabs();
      renderCatalogoListaActiva();
    }
  }catch(err){
    console.error('No se pudieron cargar los catálogos:', err);
    // Si falla, no se hace nada: los <select> se quedan con las opciones
    // fijas que ya traía el HTML (respaldo automático).
  }
}

/* ---- Repuebla un <select> nativo con las opciones de una categoría,
   conservando el/los valores ya seleccionados si siguen existiendo.
   Si el select está registrado como filtro multi-selección (MS), se
   refresca también su versión visual (checkboxes). ---- */
function aplicarCatalogoASelect(selectId, categoria){
  const sel = document.getElementById(selectId);
  if(!sel) return;
  const datos = CATALOGOS_DATA[categoria];
  if(!datos || !datos.length) return; // sin datos: se deja el respaldo fijo del HTML

  const esMultiple = sel.multiple || (typeof MS !== 'undefined' && MS.wraps && MS.wraps[selectId]);
  const valoresPrevios = esMultiple
    ? Array.from(sel.selectedOptions).map(o => o.value)
    : [sel.value];

  // Conserva una primera opción "placeholder" si el select ya tenía una
  // (value="" o texto tipo "Todos/—/Selecciona..."), para no romper la UX.
  const primerOption = sel.options[0];
  const conservarPlaceholder = primerOption && primerOption.value === '' && !esMultiple;

  let html = '';
  if(conservarPlaceholder){
    html += `<option value="">${escapeHtml(primerOption.textContent)}</option>`;
  }
  html += datos.map(d => `<option value="${escapeHtml(d.valor)}">${escapeHtml(d.valor)}</option>`).join('');
  sel.innerHTML = html;

  const valoresValidos = new Set(Array.from(sel.options).map(o => o.value));
  if(esMultiple){
    Array.from(sel.options).forEach(o => { o.selected = valoresPrevios.includes(o.value); });
  } else if(valoresValidos.has(valoresPrevios[0])){
    sel.value = valoresPrevios[0];
  }

  if(typeof MS !== 'undefined' && MS.wraps && MS.wraps[selectId]){
    msRefresh(selectId);
  }
}

function aplicarCatalogosATodosLosSelects(){
  CATALOGO_KEYS.forEach(cat => {
    const cfg = CATALOGO_CONFIG[cat];
    if(cfg.especial === 'sub_categoria'){
      aplicarCatalogoSubCategoria();
      return;
    }
    cfg.selects.forEach(selId => aplicarCatalogoASelect(selId, cat));
  });
}

// Caso especial: Sub Categoría no vive en <option> fijas del HTML, sino en el
// arreglo SUB_CATEGORIA_OPCIONES (01-core.js), que 4 formularios + el buscador
// de Plantillas leen en el momento de abrirse. Se actualiza el mismo arreglo
// (sin reasignarlo) para que todos los que ya lo referencian vean los cambios.
function aplicarCatalogoSubCategoria(){
  if(typeof SUB_CATEGORIA_OPCIONES === 'undefined') return;
  const datos = CATALOGOS_DATA['sub_categoria'];
  if(!datos || !datos.length) return; // sin datos: se deja el respaldo fijo del arreglo
  const valores = datos.slice().sort((a,b) => (a.orden||0) - (b.orden||0)).map(d => d.valor);
  SUB_CATEGORIA_OPCIONES.length = 0;
  valores.forEach(v => SUB_CATEGORIA_OPCIONES.push(v));
}

/* ---- Vista de administración: Catálogos ---- */
function renderCatalogosTabs(){
  const wrap = document.getElementById('catalogosTabs');
  if(!wrap) return;
  wrap.innerHTML = CATALOGO_KEYS.map(key => `
    <button type="button" class="catalogo-tab-btn ${key === catalogoTabActiva ? 'active' : ''}" data-catalogo-tab="${key}">
      ${escapeHtml(CATALOGO_CONFIG[key].label)}
    </button>
  `).join('');
  wrap.querySelectorAll('[data-catalogo-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      catalogoTabActiva = btn.dataset.catalogoTab;
      renderCatalogosTabs();
      renderCatalogoListaActiva();
    });
  });
}

function renderCatalogoListaActiva(){
  const listWrap = document.getElementById('catalogoListaWrap');
  const inputEl = document.getElementById('catalogoNuevoValor');
  const usadoEnEl = document.getElementById('catalogoUsadoEn');
  if(!listWrap) return;

  const cfg = CATALOGO_CONFIG[catalogoTabActiva];
  if(usadoEnEl){
    usadoEnEl.textContent = cfg.nota || ('Se usa en: ' + cfg.selects.join(', '));
  }
  if(inputEl) inputEl.value = '';

  const filas = (CATALOGOS_DATA[catalogoTabActiva] || []).slice().sort((a,b) => (a.orden||0) - (b.orden||0));

  if(!filas.length){
    listWrap.innerHTML = '<div class="material-empty">Sin opciones registradas todavía. Agrega la primera arriba.</div>';
    return;
  }

  listWrap.innerHTML = filas.map(f => `
    <div class="catalogo-item" data-catalogo-id="${f.id}">
      <div class="catalogo-item-valor">${escapeHtml(f.valor)}</div>
      <div class="row-actions">
        <button class="icon-btn" data-catalogo-editar="${f.id}" title="Editar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button class="icon-btn danger" data-catalogo-borrar="${f.id}" title="Eliminar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    </div>
  `).join('');

  listWrap.querySelectorAll('[data-catalogo-editar]').forEach(btn => {
    btn.addEventListener('click', () => editarValorCatalogo(Number(btn.dataset.catalogoEditar)));
  });
  listWrap.querySelectorAll('[data-catalogo-borrar]').forEach(btn => {
    btn.addEventListener('click', () => eliminarValorCatalogo(Number(btn.dataset.catalogoBorrar)));
  });
}

async function agregarValorCatalogo(){
  const inputEl = document.getElementById('catalogoNuevoValor');
  const valor = (inputEl?.value || '').trim();
  if(!valor){ showToast('Escribe un valor antes de agregar', 'error'); return; }

  const yaExiste = (CATALOGOS_DATA[catalogoTabActiva] || [])
    .some(f => f.valor.toLowerCase() === valor.toLowerCase());
  if(yaExiste){ showToast('Esa opción ya existe en esta lista', 'error'); return; }

  const ordenSiguiente = (CATALOGOS_DATA[catalogoTabActiva] || []).length;
  const btn = document.getElementById('catalogoAgregarBtn');
  if(btn) btn.disabled = true;
  try{
    const res = await fetch(CATALOGOS_REST_URL, {
      method: 'POST',
      headers: { ...sbHeaders, 'Prefer': 'return=representation' },
      body: JSON.stringify({ categoria: catalogoTabActiva, valor, orden: ordenSiguiente })
    });
    if(!res.ok) throw new Error(await res.text());
    await fetchCatalogos(true);
    renderCatalogosTabs();
    renderCatalogoListaActiva();
    showToast('Opción agregada');
  }catch(err){
    showToast('No se pudo agregar: ' + err.message, 'error');
  }finally{
    if(btn) btn.disabled = false;
  }
}

async function editarValorCatalogo(id){
  const fila = (CATALOGOS_DATA[catalogoTabActiva] || []).find(f => f.id === id);
  if(!fila) return;
  const nuevoValor = prompt('Editar opción:', fila.valor);
  if(nuevoValor === null) return;
  const valor = nuevoValor.trim();
  if(!valor){ showToast('El valor no puede quedar vacío', 'error'); return; }
  try{
    const res = await fetch(`${CATALOGOS_REST_URL}?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, 'Prefer': 'return=representation' },
      body: JSON.stringify({ valor })
    });
    if(!res.ok) throw new Error(await res.text());
    await fetchCatalogos(true);
    renderCatalogosTabs();
    renderCatalogoListaActiva();
    showToast('Opción actualizada');
  }catch(err){
    showToast('No se pudo editar: ' + err.message, 'error');
  }
}

async function eliminarValorCatalogo(id){
  const fila = (CATALOGOS_DATA[catalogoTabActiva] || []).find(f => f.id === id);
  if(!fila) return;
  if(!confirm(`¿Eliminar la opción "${fila.valor}"? Los registros que ya la tengan guardada no se modifican.`)) return;
  try{
    const res = await fetch(`${CATALOGOS_REST_URL}?id=eq.${id}`, { method: 'DELETE', headers: sbHeaders });
    if(!res.ok) throw new Error(await res.text());
    await fetchCatalogos(true);
    renderCatalogosTabs();
    renderCatalogoListaActiva();
    showToast('Opción eliminada');
  }catch(err){
    showToast('No se pudo eliminar: ' + err.message, 'error');
  }
}

document.getElementById('catalogoAgregarBtn')?.addEventListener('click', agregarValorCatalogo);
document.getElementById('catalogoNuevoValor')?.addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); agregarValorCatalogo(); }
});

// Se piden los catálogos apenas carga el script (sesión ya podría estar activa
// si la página se refresca con localStorage); si aún no hay sesión, esta
// llamada simplemente no tendrá permisos y se reintenta desde opkIniciarSesion.
document.addEventListener('DOMContentLoaded', () => {
  if(typeof opkSesionActual !== 'undefined' && opkSesionActual){
    fetchCatalogos();
  }
});
