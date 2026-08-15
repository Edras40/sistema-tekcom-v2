// ============================================================
// 11-bloqueo-respuesta.js  —  Bloqueo de pantalla por Tiempo de Respuesta vencido
//
// Reglas (pedidas explícitamente):
//  - Aplica SOLO al usuario noc@tekcomca.com. Nadie más se ve afectado.
//  - Aplica a Casos Movistar, Casos Hyve y Cable Color (UDP queda fuera).
//  - El "Tiempo de Respuesta" es: Tiempo de Validación (t_validacion) en
//    Movistar/Hyve, y Tiempo de Respuesta (tiempo_respuesta) en Cable Color.
//  - Los 20 minutos se cuentan desde que el caso se CREÓ (created_at), que
//    es el momento en que la plantilla se finalizó y volcó el caso.
//  - Si pasan 20 min y ese dato sigue vacío (y el caso no está ya
//    Finalizado/Cancelado), se bloquea TODA la pantalla: solo se ven los
//    casos pendientes de ese dato, y no se puede navegar a otras pestañas
//    hasta resolverlos todos.
// ============================================================

const BLOQUEO_TR_USUARIO = 'noc@tekcomca.com';
const BLOQUEO_TR_MINUTOS = 20;
let bloqueoTrIntervalo = null;
let bloqueoTrRefrescoIntervalo = null;

function bloqueoTrUsuarioAplica(){
  const u = (opkSesionActual && opkSesionActual.usuario) ? String(opkSesionActual.usuario) : '';
  return u.trim().toLowerCase() === BLOQUEO_TR_USUARIO;
}

function bloqueoTrEstaCerrado(status){
  const s = (status || '').toLowerCase();
  return s.startsWith('final') || s === 'cancelado';
}

// Config por módulo: de dónde saca la lista ya cargada, cuál es el campo de
// Tiempo de Respuesta, y cómo abrir ese caso puntual para completarlo.
const BLOQUEO_TR_MODULOS = [
  {
    clave: 'casos', etiqueta: 'Casos Movistar', dataView: 'casos',
    lista: () => (typeof allCasos !== 'undefined' ? allCasos : []),
    campoTiempo: 't_validacion',
    folio: c => c.folio, nombre: c => c.casos,
    abrir: c => { if(typeof openCasoFormModal === 'function') openCasoFormModal(c); },
  },
  {
    clave: 'hyve', etiqueta: 'Casos Hyve', dataView: 'hyve',
    lista: () => (typeof allHyve !== 'undefined' ? allHyve : []),
    campoTiempo: 't_validacion',
    folio: c => c.ot, nombre: c => c.casos,
    abrir: c => { if(typeof openHyveFormModal === 'function') openHyveFormModal(c); },
  },
  {
    clave: 'cable', etiqueta: 'Cable Color', dataView: 'cable',
    lista: () => (typeof allCable !== 'undefined' ? allCable : []),
    campoTiempo: 'tiempo_respuesta',
    folio: c => c.numero, nombre: c => c.descripcion,
    abrir: c => { if(typeof openCableFormModal === 'function') openCableFormModal(c); },
  },
];

function bloqueoTrCasosVencidos(){
  if(!bloqueoTrUsuarioAplica()) return [];
  const ahora = Date.now();
  const limiteMs = BLOQUEO_TR_MINUTOS * 60000;
  const vencidos = [];

  BLOQUEO_TR_MODULOS.forEach(mod => {
    mod.lista().forEach(c => {
      if(bloqueoTrEstaCerrado(c.status)) return;
      if(c[mod.campoTiempo]) return; // ya tiene el dato: no bloquea
      const creadoMs = c.created_at ? new Date(c.created_at).getTime() : null;
      if(!creadoMs || isNaN(creadoMs)) return;
      if((ahora - creadoMs) >= limiteMs){
        vencidos.push({
          modulo: mod, caso: c,
          folio: mod.folio(c) || '—',
          nombre: mod.nombre(c) || '—',
          minutos: Math.floor((ahora - creadoMs) / 60000),
        });
      }
    });
  });

  return vencidos;
}

function bloqueoTrCrearOverlay(){
  if(document.getElementById('bloqueoTrOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'bloqueoTrOverlay';
  overlay.style.cssText = `
    position:fixed; inset:0; z-index:999999; background:rgba(15,23,42,.92);
    display:flex; align-items:center; justify-content:center; padding:24px;
  `;
  overlay.innerHTML = `
    <div style="background:#FFFFFF; border-radius:14px; max-width:640px; width:100%; max-height:85vh; overflow-y:auto; padding:26px 28px; box-shadow:0 20px 60px rgba(0,0,0,.4);">
      <div style="font-size:34px; margin-bottom:4px;">⏱️</div>
      <div style="font-size:17px; font-weight:700; color:#111827; margin-bottom:6px;">Tienes casos sin Tiempo de Respuesta</div>
      <div style="font-size:13.5px; color:#4B5563; margin-bottom:18px; line-height:1.5;">
        Pasaron más de ${BLOQUEO_TR_MINUTOS} minutos desde que se crearon y todavía no tienen ese dato.
        No podrás usar el resto del sistema hasta completarlos.
      </div>
      <div id="bloqueoTrLista"></div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function bloqueoTrRenderLista(vencidos){
  const wrap = document.getElementById('bloqueoTrLista');
  if(!wrap) return;
  wrap.innerHTML = vencidos.map((v, i) => `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 14px; border:1px solid #FCA5A5; background:#FEF2F2; border-radius:10px; margin-bottom:8px;">
      <div style="min-width:0;">
        <div style="font-size:12px; font-weight:700; color:#991B1B;">${escapeHtml(v.modulo.etiqueta)} · ${escapeHtml(v.folio)}</div>
        <div style="font-size:13px; color:#111827; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:360px;">${escapeHtml(v.nombre)}</div>
        <div style="font-size:11.5px; color:#B91C1C;">Lleva ${v.minutos} min sin Tiempo de Respuesta</div>
      </div>
      <button type="button" class="btn btn-primary" data-bloqueo-tr-abrir="${i}" style="white-space:nowrap;">Abrir caso</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-bloqueo-tr-abrir]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = vencidos[Number(btn.dataset.bloqueoTrAbrir)];
      if(!v) return;
      const navItem = document.querySelector(`.nav-item[data-view="${v.modulo.dataView}"]`);
      if(navItem) navItem.click();
      document.getElementById('bloqueoTrOverlay')?.remove();
      setTimeout(() => v.modulo.abrir(v.caso), 80);
    });
  });
}

// Si el operador ya está adentro llenando el formulario de un caso (Movistar/Hyve/
// Cable Color), el overlay se hace a un lado para no taparle la pantalla mientras
// trabaja. En cuanto cierra ese formulario (guarda o cancela), el chequeo de los
// 15s lo vuelve a mostrar si todavía hace falta.
function bloqueoTrHayFormularioCasoAbierto(){
  return ['casoFormModalOverlay', 'hyveFormModalOverlay', 'cableFormModalOverlay']
    .some(id => document.getElementById(id)?.classList.contains('active'));
}

function bloqueoTrEvaluar(){
  const vencidos = bloqueoTrCasosVencidos();
  const overlay = document.getElementById('bloqueoTrOverlay');
  if(vencidos.length === 0 || bloqueoTrHayFormularioCasoAbierto()){
    if(overlay) overlay.remove();
    return;
  }
  bloqueoTrCrearOverlay();
  bloqueoTrRenderLista(vencidos);
}

function bloqueoTrIniciar(){
  if(!bloqueoTrUsuarioAplica()) return;
  // Se asegura de tener datos frescos de los 3 módulos aunque el usuario no
  // haya entrado a esas pestañas todavía.
  if(typeof fetchCasos === 'function') fetchCasos();
  if(typeof fetchHyve === 'function') fetchHyve();
  if(typeof fetchCable === 'function') fetchCable();

  if(bloqueoTrIntervalo) clearInterval(bloqueoTrIntervalo);
  if(bloqueoTrRefrescoIntervalo) clearInterval(bloqueoTrRefrescoIntervalo);

  bloqueoTrEvaluar();
  bloqueoTrIntervalo = setInterval(bloqueoTrEvaluar, 15000); // revisa cada 15s
  bloqueoTrRefrescoIntervalo = setInterval(() => {
    if(typeof fetchCasos === 'function') fetchCasos();
    if(typeof fetchHyve === 'function') fetchHyve();
    if(typeof fetchCable === 'function') fetchCable();
  }, 90000); // trae datos nuevos cada 90s
}

function bloqueoTrDetener(){
  if(bloqueoTrIntervalo) clearInterval(bloqueoTrIntervalo);
  if(bloqueoTrRefrescoIntervalo) clearInterval(bloqueoTrRefrescoIntervalo);
  bloqueoTrIntervalo = null;
  bloqueoTrRefrescoIntervalo = null;
  document.getElementById('bloqueoTrOverlay')?.remove();
}

// Se re-evalúa también justo después de guardar un caso en cualquiera de los
// 3 módulos, para que el overlay desaparezca al instante sin esperar los 15s.
document.addEventListener('click', (e) => {
  if(e.target.closest('#casoFormSaveBtn, #hyveFormSaveBtn, #cableFormSaveBtn')){
    setTimeout(bloqueoTrEvaluar, 600);
  }
  if(e.target.closest('#casoFormModalClose, #casoFormModalCancel, #hyveFormModalClose, #hyveFormModalCancel, #cableFormModalClose, #cableFormModalCancel')){
    setTimeout(bloqueoTrEvaluar, 200);
  }
});
