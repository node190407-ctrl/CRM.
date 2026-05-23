'use strict';

/* ═══════════════════════════════════════════════════════════════
   AUTH — Autenticación con roles (Admin / Ventas)
   ═══════════════════════════════════════════════════════════════ */

const AUTH_SESSION_KEY   = 'node_crm_session';
const AUTH_PASSWORDS_KEY = 'node_crm_passwords';

/** Estado en memoria */
const AUTH = { isAuth: false, role: null }; // 'admin' | 'ventas' /' co ventas'

/** Vistas permitidas por rol */
const ROLE_VIEWS = {
  admin:  ['dashboard','pipeline','contactos','actividades','configuracion'],
  ventas: ['dashboard','pipeline','contactos','actividades'],
  venta:  ['pipeline','contactos','actividades'],
};

const DEFAULT_PWD = { admin: 'admin', ventas: 'ventas' , venta: 'venta'};

/* ── Contraseñas ── */
function getPasswords() {
  try {
    const raw = localStorage.getItem(AUTH_PASSWORDS_KEY);
    return raw ? { ...DEFAULT_PWD, ...JSON.parse(raw) } : { ...DEFAULT_PWD };
  } catch { return { ...DEFAULT_PWD }; }
}
function persistPasswords(admin, ventas, venta ) {
  localStorage.setItem(AUTH_PASSWORDS_KEY, JSON.stringify({ admin, ventas, venta }));
}

/* ── Sesión (sessionStorage: se limpia al cerrar la pestaña) ── */
function restoreSession() {
  try {
    const raw = sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s?.role) return false;
    AUTH.isAuth = true; AUTH.role = s.role; return true;
  } catch { return false; }
}
function persistSession(role) { sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ role })); }
function clearSession()       { sessionStorage.removeItem(AUTH_SESSION_KEY); }

/* ── Guard ── */
function canAccess(view) {
  if (!AUTH.isAuth) return false;
  return (ROLE_VIEWS[AUTH.role] || []).includes(view);
}

/* ── Login ── */
function login() {
  const roleEl  = document.querySelector('.role-card.active');
  const pwdEl   = document.getElementById('login-pwd');
  const errEl   = document.getElementById('login-error');
  const role    = roleEl?.dataset.role;
  const pwd     = pwdEl?.value || '';

  const showError = (msg) => {
    errEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ${msg}`;
    errEl.classList.remove('hidden');
    const card = document.querySelector('.login-card');
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 450);
    if (pwdEl) { pwdEl.value = ''; pwdEl.focus(); }
  };

  if (!role) return showError('Selecciona un rol de acceso.');
  if (!pwd)  return showError('Ingresa tu contraseña.');
  if (pwd !== getPasswords()[role]) return showError('Contraseña incorrecta. Intenta de nuevo.');

  // ✅ Éxito
  AUTH.isAuth = true; AUTH.role = role;
  persistSession(role);
  errEl.classList.add('hidden');
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  applyRole();
 wireUpButtons();
setupSearch();
setupQuickMenu();
setupKeyboard();
setupClock();

// Navegar a la primera vista permitida del rol (venta no tiene dashboard)
  const firstView = ROLE_VIEWS[AUTH.role]?.[0] || 'pipeline';
  navigate(firstView);
}

/* ── Logout ── */
function logout() {
  AUTH.isAuth = false; AUTH.role = null;
  clearSession();
  S.view='dashboard'; S.searchQuery=''; S.filterFuente=''; S.filterActTipo='';
  Object.values(S.charts).forEach(c => c?.destroy?.()); S.charts = {};
  S.sortables.forEach(s => s?.destroy?.()); S.sortables = [];
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  const pwdEl = document.getElementById('login-pwd');
  if (pwdEl) { pwdEl.value = ''; pwdEl.type = 'password'; }
  document.getElementById('login-error')?.classList.add('hidden');
  document.getElementById('eye-open')?.classList.remove('hidden');
  document.getElementById('eye-closed')?.classList.add('hidden');
}

/* ── Aplicar restricciones de rol a la UI ── */
function applyRole() {
  const role  = AUTH.role;
  const badge = document.getElementById('role-badge');

  // Metadatos de cada rol
  const ROLE_META = {
    admin:  { icon: '👑', label: 'Admin',       cls: 'role-admin',  nombre: S.config.usuario },
    ventas: { icon: '📈', label: 'Dir. Ventas', cls: 'role-ventas', nombre: 'Director Ventas' },
    venta:  { icon: '🎯', label: 'Venta NODE',  cls: 'role-venta',  nombre: 'Venta NODE' },
  };
  const meta = ROLE_META[role] || ROLE_META.ventas;

  // Badge del sidebar
  if (badge) {
    badge.textContent = meta.icon + ' ' + meta.label;
    badge.className   = 'role-badge ' + meta.cls;
  }

  // Ocultar vistas no permitidas en el nav
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.classList.toggle('hidden', !canAccess(btn.dataset.view));
  });

  // Nombre y avatar del sidebar
  document.getElementById('sidebar-user-name').textContent = meta.nombre;
  document.getElementById('sidebar-avatar').textContent    = initials(meta.nombre);
}

/* ── Guardar contraseñas (solo admin) ── */
function savePasswords() {
  if (AUTH.role !== 'admin') return;
  const ap = document.getElementById('cfg-pwd-admin')?.value.trim();
  const vp = document.getElementById('cfg-pwd-ventas')?.value.trim();
  if (!ap || !vp)          { toast('Campos requeridos','Rellena las dos contraseñas.','error'); return; }
  if (ap.length < 6 || vp.length < 6) { toast('Contraseña corta','Mínimo 6 caracteres.','error'); return; }
  persistPasswords(ap, vp);
  document.getElementById('cfg-pwd-admin').value  = '';
  document.getElementById('cfg-pwd-ventas').value = '';
  toast('Contraseñas actualizadas','Aplican al próximo inicio de sesión.','success');
}

/* ── Setup del login screen ── */
function setupLoginScreen() {
  document.querySelectorAll('.role-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.role-card').forEach(c => { c.classList.remove('active'); c.setAttribute('aria-checked','false'); });
      card.classList.add('active'); card.setAttribute('aria-checked','true');
      document.getElementById('login-pwd')?.focus();
    });
  });
  document.getElementById('btn-login')?.addEventListener('click', login);
  document.getElementById('login-pwd')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
    else document.getElementById('login-error')?.classList.add('hidden');
  });
  document.getElementById('btn-toggle-pwd')?.addEventListener('click', () => {
    const inp = document.getElementById('login-pwd');
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    document.getElementById('eye-open')?.classList.toggle('hidden', show);
    document.getElementById('eye-closed')?.classList.toggle('hidden', !show);
  });
}

/* ── 1. CONSTANTES ─────────────────────────────────────────── */

/* ── Etapas — 3 Fases · 14 Etapas ──────────────────────────── */
const ETAPAS = [
  // ── FASE 1: PROSPECCIÓN (5 etapas) ──────────────────────────
  { id:'prospecto_id',  label:'Prospecto Identificado', emoji:'🔍', fase:'prospeccion',
    color:'#818CF8', bg:'#EEF2FF', tc:'#4338CA',
    gate:'Pain visible, sin contacto aún' },
  { id:'contacto_env',  label:'Contacto Enviado',        emoji:'📩', fase:'prospeccion',
    color:'#6366F1', bg:'#E0E7FF', tc:'#3730A3',
    gate:'Mensaje personalizado <24h de identificar' },
  { id:'conv_activa',   label:'Conversación Activa',     emoji:'💬', fase:'prospeccion',
    color:'#4F46E5', bg:'#E0E7FF', tc:'#3730A3',
    gate:'Prospecto respondió, diálogo abierto' },
  { id:'diag_agendado', label:'Diagnóstico Agendado',    emoji:'📅', fase:'prospeccion',
    color:'#4338CA', bg:'#C7D2FE', tc:'#312E81',
    gate:'Fecha y hora de llamada confirmada' },
  { id:'opor_cal',      label:'Oportunidad Calificada',  emoji:'⭐', fase:'prospeccion',
    color:'#3730A3', bg:'#C7D2FE', tc:'#312E81',
    gate:'MEDDIC ≥4/6 post-llamada' },
  // ── FASE 2: CIERRE (4 etapas) ───────────────────────────────
  { id:'propuesta_env', label:'Propuesta Enviada',       emoji:'📄', fase:'cierre',
    color:'#F59E0B', bg:'#FEF3C7', tc:'#B45309',
    gate:'Propuesta enviada <24h post-llamada' },
  { id:'negociacion',   label:'En Negociación',          emoji:'🤝', fase:'cierre',
    color:'#F97316', bg:'#FFF7ED', tc:'#C2410C',
    gate:'Prospecto respondió, hay diálogo activo' },
  { id:'ganado',        label:'Cerrado Ganado ✅',        emoji:'✅', fase:'cierre',
    color:'#10B981', bg:'#D1FAE5', tc:'#065F46',
    gate:'Anticipo 50% recibido + contrato firmado' },
  { id:'perdido',       label:'Cerrado Perdido ❌',       emoji:'❌', fase:'cierre',
    color:'#EF4444', bg:'#FEE2E2', tc:'#B91C1C',
    gate:'No explícito O 14 días sin respuesta' },
  // ── FASE 3: POST-VENTA (5 etapas) ───────────────────────────
  { id:'onboarding',    label:'Onboarding Activo',       emoji:'🚀', fase:'postventa',
    color:'#0D9488', bg:'#F0FDFB', tc:'#0F766E',
    gate:'Plan de 14 días activado post-entrega' },
  { id:'mantenimiento', label:'Mantenimiento Activo',    emoji:'🔧', fase:'postventa',
    color:'#0F766E', bg:'#CCFBF1', tc:'#134E4A',
    gate:'Contrato R1/R2 activo y pagando' },
  { id:'upsell',        label:'Candidato a Upsell',      emoji:'📈', fase:'postventa',
    color:'#10B981', bg:'#D1FAE5', tc:'#065F46',
    gate:'NPS ≥8 + necesidad adicional identificada' },
  { id:'reactivacion',  label:'En Reactivación',         emoji:'♻️',  fase:'postventa',
    color:'#F59E0B', bg:'#FEF3C7', tc:'#B45309',
    gate:'Cliente inactivo >30 días, recontactado' },
  { id:'referido',      label:'Referido Generado',       emoji:'🌟', fase:'postventa',
    color:'#8B5CF6', bg:'#F5F3FF', tc:'#7C3AED',
    gate:'Cliente refirió a 1+ prospecto verificado' },
];

/* ── Fases ──────────────────────────────────────────────────── */
const FASES = [
  { id:'prospeccion', label:'PROSPECCIÓN', n:1,
    color:'#4338CA', bg:'#EEF2FF', tc:'#312E81',
    desc:'Identificar y calificar al prospecto correcto' },
  { id:'cierre',      label:'CIERRE',      n:2,
    color:'#B45309', bg:'#FEF3C7', tc:'#92400E',
    desc:'Convertir la oportunidad en cliente pagante' },
  { id:'postventa',   label:'POST-VENTA',  n:3,
    color:'#0F766E', bg:'#CCFBF1', tc:'#134E4A',
    desc:'Retención, crecimiento y generación de referidos' },
];

const ACT_ICONS  = { whatsapp:'💬', llamada:'📞', email:'📧', reunion:'🤝', propuesta:'📄', nota:'📝' };
const ACT_LABELS = { whatsapp:'WhatsApp', llamada:'Llamada', email:'Email', reunion:'Reunión', propuesta:'Propuesta', nota:'Nota' };
const ACT_BG     = { whatsapp:'#D1FAE5', llamada:'#EFF6FF', email:'#EEF2FF', reunion:'#F5F3FF', propuesta:'#FEF3C7', nota:'#F8F9FB' };

const STORAGE_KEY = 'node_crm_v2';

const PAGE_META = {
  dashboard:     { title:'Dashboard',    sub:'Resumen de tu pipeline y actividades' },
  pipeline:      { title:'Pipeline',      sub:'Gestiona tus deals en el Kanban' },
  contactos:     { title:'Contactos',     sub:'Tu cartera de prospectos y clientes' },
  actividades:   { title:'Actividades',   sub:'Historial completo de interacciones' },
  configuracion: { title:'Configuración', sub:'Ajustes de cuenta y exportación de datos' },
};

/* ── 2. ESTADO ─────────────────────────────────────────────── */

const S = {
  view:          'dashboard',
  contactos:     [],
  deals:         [],
  actividades:   [],
  config:        { empresa:'NODE Soluciones Tecnológicas', usuario:'CEO NODE', whatsapp:'', moneda:'MXN' },
  searchQuery:   '',
  filterFuente:  '',
  filterActTipo: '',
  charts:        {},
  sortables:     [],
};

/* ── 3. PERSISTENCIA ───────────────────────────────────────── */

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      contactos:   S.contactos,
      deals:       S.deals,
      actividades: S.actividades,
      config:      S.config,
    }));
  } catch(e) { console.warn('Storage write error:', e); }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    S.contactos   = d.contactos   || [];
    S.deals       = d.deals       || [];
    S.actividades = d.actividades || [];
    S.config      = Object.assign({}, S.config, d.config || {});
    return true;
  } catch(e) { return false; }
}

/* ── 4. DATOS DE MUESTRA ───────────────────────────────────── */

function seedData() {
  const now = Date.now();
  const ago = (days) => now - days * 86_400_000;

  S.contactos = [
    { id:'c1', nombre:'Ana García',        empresa:'Fotografía AG',          whatsapp:'5512345671', email:'ana@fotografiaag.mx',    fuente:'Instagram', monto:8000,  notas:'Fotógrafa de bodas, quiere presencia profesional en web.', creadoEn:ago(15), actualizadoEn:ago(2)  },
    { id:'c2', nombre:'Roberto Hernández', empresa:'Taller Hernández',       whatsapp:'5523456782', email:'roberto@tallerhz.mx',     fuente:'Referido',  monto:5500,  notas:'Taller mecánico, necesita cotizador para sus servicios.',   creadoEn:ago(20), actualizadoEn:ago(5)  },
    { id:'c3', nombre:'Sofía López',       empresa:'Consultoría Fiscal SL',  whatsapp:'5534567893', email:'sofia@cfiscal.mx',         fuente:'LinkedIn',  monto:17200, notas:'Contadora independiente, clientes piden CFDI 4.0.',        creadoEn:ago(10), actualizadoEn:ago(1)  },
    { id:'c4', nombre:'Carlos Martínez',   empresa:'Pastelería Martínez',    whatsapp:'5545678904', email:'carlos@pasteleriam.mx',    fuente:'Facebook',  monto:4500,  notas:'Vende artesanalmente por Instagram y pedidos por WA.',      creadoEn:ago(8),  actualizadoEn:ago(3)  },
    { id:'c5', nombre:'Diana Ruiz',        empresa:'DR Diseño Gráfico',      whatsapp:'5556789015', email:'diana@drdisenio.mx',       fuente:'Instagram', monto:12500, notas:'Diseñadora freelance, cotiza todo por WhatsApp.',           creadoEn:ago(30), actualizadoEn:ago(7)  },
    { id:'c6', nombre:'Pedro Sánchez',     empresa:'Estudio Pilates PS',     whatsapp:'5567890126', email:'pedro@estudiops.mx',       fuente:'LinkedIn',  monto:6500,  notas:'Instructor, emite facturas RESICO de forma manual.',        creadoEn:ago(40), actualizadoEn:ago(0)  },
    { id:'c7', nombre:'Marina Torres',     empresa:'Clínica Dental Torres',  whatsapp:'5578901237', email:'marina@clinicatorres.mx',  fuente:'Google',    monto:8000,  notas:'Odontóloga, pacientes corporativos exigen factura.',         creadoEn:ago(25), actualizadoEn:ago(10) },
    { id:'c8', nombre:'Luis Vega',         empresa:'Vega Construcción',      whatsapp:'5589012348', email:'luis@vegaconstruccion.mx', fuente:'Referido',  monto:8500,  notas:'Constructor, cotizaciones en PDF manual sin proceso.',       creadoEn:ago(12), actualizadoEn:ago(4)  },
  ];

  S.deals = [
    { id:'d1', titulo:'Landing Page Pro',         contactoId:'c1', valor:8000,  etapa:'propuesta_env', fechaLimite:'2026-06-20', proximaAccion:'Enviar contrato firmado',      notas:'',                           creadoEn:ago(14), actualizadoEn:ago(2)  },
    { id:'d2', titulo:'Cotizador Digital Pro',    contactoId:'c2', valor:5500,  etapa:'diag_agendado', fechaLimite:'2026-06-10', proximaAccion:'Demo miércoles 10am',           notas:'',                           creadoEn:ago(18), actualizadoEn:ago(5)  },
    { id:'d3', titulo:'Bundle Vende Más (B2)',    contactoId:'c3', valor:17200, etapa:'negociacion',   fechaLimite:'2026-06-08', proximaAccion:'Revisar términos de pago',      notas:'Quiere pago en 2 parcialidades.', creadoEn:ago(9),  actualizadoEn:ago(1)  },
    { id:'d4', titulo:'Landing Page Básica',      contactoId:'c4', valor:4500,  etapa:'prospecto_id',  fechaLimite:'2026-07-01', proximaAccion:'Enviar mensaje personalizado',  notas:'',                           creadoEn:ago(7),  actualizadoEn:ago(3)  },
    { id:'d5', titulo:'NODE CRM P6',              contactoId:'c5', valor:12500, etapa:'contacto_env',  fechaLimite:'2026-06-25', proximaAccion:'Agendar diagnóstico',           notas:'',                           creadoEn:ago(28), actualizadoEn:ago(6)  },
    { id:'d6', titulo:'Facturador CFDI Básico',   contactoId:'c6', valor:6500,  etapa:'onboarding',    fechaLimite:'2026-05-30', proximaAccion:'D+3: ofrecer mantenimiento R1', notas:'Anticipo 50% recibido.',    creadoEn:ago(38), actualizadoEn:ago(2)  },
    { id:'d7', titulo:'Landing Page Pro',         contactoId:'c7', valor:8000,  etapa:'perdido',       fechaLimite:'2026-05-15', proximaAccion:'—',                            notas:'Eligió agencia local más barata.', creadoEn:ago(23), actualizadoEn:ago(10) },
    { id:'d8', titulo:'Bundle STARTER (B1)',      contactoId:'c8', valor:8500,  etapa:'propuesta_env', fechaLimite:'2026-06-18', proximaAccion:'Follow-up mañana temprano',    notas:'',                           creadoEn:ago(11), actualizadoEn:ago(4)  },
    { id:'d9', titulo:'Cotizador + Landing Pro',  contactoId:'c1', valor:14000, etapa:'conv_activa',   fechaLimite:'2026-07-10', proximaAccion:'Agendar diagnóstico esta semana', notas:'Segunda oportunidad con Ana.', creadoEn:ago(3), actualizadoEn:ago(1)  },
    { id:'d10',titulo:'Mantenimiento Anual',      contactoId:'c6', valor:14400, etapa:'mantenimiento', fechaLimite:'2027-05-30', proximaAccion:'Renovar en 30 días',           notas:'R2 activo desde junio.',     creadoEn:ago(35), actualizadoEn:ago(0)  },
    { id:'d11',titulo:'Bundle PRO Upsell',        contactoId:'c3', valor:14500, etapa:'upsell',        fechaLimite:'2026-07-15', proximaAccion:'Proponer bundle PRO en llamada', notas:'NPS 9. Lista para crecer.', creadoEn:ago(5),  actualizadoEn:ago(0)  },
    { id:'d12',titulo:'Opor. Calificada — POS',   contactoId:'c2', valor:9500,  etapa:'opor_cal',      fechaLimite:'2026-06-30', proximaAccion:'Enviar propuesta P7 + POS',    notas:'MEDDIC 5/6.',               creadoEn:ago(4),  actualizadoEn:ago(1)  },
  ];

  S.actividades = [
    { id:'a1',  tipo:'whatsapp',  contactoId:'c3', descripcion:'Revisó la propuesta B2. Pide pago en 2 parcialidades, avaluamos acepta.',   creadoEn:ago(1)  },
    { id:'a2',  tipo:'llamada',   contactoId:'c2', descripcion:'Confirmó demo del cotizador para el miércoles 10am. Muy entusiasmado.',      creadoEn:ago(2)  },
    { id:'a3',  tipo:'email',     contactoId:'c3', descripcion:'Envié contrato preliminar para revisión. Pendiente firma del cliente.',      creadoEn:ago(3)  },
    { id:'a4',  tipo:'reunion',   contactoId:'c4', descripcion:'Visita a su local. Le gustó la propuesta de landing básica.',                creadoEn:ago(4)  },
    { id:'a5',  tipo:'whatsapp',  contactoId:'c1', descripcion:'Ana aprobó el diseño. Solicita ajuste en el texto del hero section.',        creadoEn:ago(5)  },
    { id:'a6',  tipo:'nota',      contactoId:'c8', descripcion:'Luis llegó por referencia de Pedro. Excelente prospecto para Bundle B1.',    creadoEn:ago(6)  },
    { id:'a7',  tipo:'propuesta', contactoId:'c8', descripcion:'Envié propuesta formal del Bundle STARTER (P1+P3) por $8,500 MXN.',          creadoEn:ago(7)  },
    { id:'a8',  tipo:'email',     contactoId:'c6', descripcion:'Pedro realizó pago del 50% anticipo — $3,250 MXN. Iniciamos esta semana.',   creadoEn:ago(0)  },
    { id:'a9',  tipo:'whatsapp',  contactoId:'c5', descripcion:'Diana preguntó funciones del CRM. Le expliqué pipeline y cotizador.',        creadoEn:ago(8)  },
    { id:'a10', tipo:'llamada',   contactoId:'c7', descripcion:'Marina confirmó que no continúa. Eligió agencia local. Post-mortem hecho.',  creadoEn:ago(10) },
  ];
}

/* ── 5. HELPERS ────────────────────────────────────────────── */

const uid = () => '_' + Math.random().toString(36).slice(2, 10);

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

function fmtMXN(n) {
  return new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN', maximumFractionDigits:0 }).format(n || 0);
}

function fmtDate(val) {
  if (!val) return '—';
  const d = val instanceof Date ? val : new Date(typeof val === 'number' ? val : val + 'T00:00:00');
  return d.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 2)  return 'Justo ahora';
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `Hace ${d}d`;
  return fmtDate(ts);
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr + 'T00:00:00') < new Date();
}

function escapeHTML(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

const getEtapa      = (id) => ETAPAS.find(e => e.id === id) || ETAPAS[0];
const getContacto   = (id) => S.contactos.find(c => c.id === id);
const dealsByEtapa  = (id) => S.deals.filter(d => d.etapa === id);
const actsByContact = (id) => S.actividades.filter(a => a.contactoId === id).sort((a,b) => b.creadoEn - a.creadoEn);
const dealsByContact= (id) => S.deals.filter(d => d.contactoId === id);

/* ── 6. ROUTER ─────────────────────────────────────────────── */

function navigate(view) {
  // Clean up previous charts & sortables
  Object.values(S.charts).forEach(c => c?.destroy?.());
  S.charts = {};
  S.sortables.forEach(s => s?.destroy?.());
  S.sortables = [];
  // Reset drill-down al salir del dashboard
  if (view !== 'dashboard') CHART_STATE.expandedFase = null;
  S.view = view;

  // Nav highlight
  document.querySelectorAll('.nav-item[data-view]').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });

  // Page heading
  const meta = PAGE_META[view] || {};
  document.getElementById('page-title').textContent = meta.title || view;
  document.getElementById('page-sub').textContent   = meta.sub   || '';

  // Render with animation
  const content = document.getElementById('content');
  content.innerHTML = '';
  content.classList.remove('view-enter');
  void content.offsetWidth;
  content.classList.add('view-enter');

  const views = { dashboard, pipeline, contactos, actividades, configuracion };
  views[view]?.();
}

/* ── 7. DASHBOARD ──────────────────────────────────────────── */

function dashboard() {
  const active      = S.deals.filter(d => d.etapa !== 'ganado' && d.etapa !== 'perdido');
  const pipeValue   = active.reduce((s, d) => s + (d.valor || 0), 0);
  const thisMonth   = new Date().getMonth();
  const wonMonth    = S.deals.filter(d => d.etapa === 'ganado' && new Date(d.actualizadoEn).getMonth() === thisMonth).length;  const weekAgo     = Date.now() - 7 * 86_400_000;
  const actsWeek    = S.actividades.filter(a => a.creadoEn >= weekAgo).length;

  const recentActs  = [...S.actividades].sort((a,b) => b.creadoEn - a.creadoEn).slice(0, 5);
  const topDeals    = [...active].sort((a,b) => b.valor - a.valor).slice(0, 5);

  document.getElementById('content').innerHTML = `
  <div class="stats-grid">
    ${mkStatCard('🎯','Leads activos',       active.length,     '#EEF2FF','#4338CA')}
    ${mkStatCard('💰','Valor del pipeline',  fmtMXN(pipeValue), '#F0FDFB','#0D9488')}
    ${mkStatCard('✅','Ganados este mes',     wonMonth,          '#D1FAE5','#10B981')}
    ${mkStatCard('📋','Actividades / semana',actsWeek,          '#FEF3C7','#F59E0B')}
  </div>

  <div class="dashboard-cols">
    <div class="chart-card">
      <div class="chart-title">Pipeline por etapa</div>
      <div class="chart-sub">Valor de deals activos por etapa (MXN)</div>
      <div class="chart-canvas"><canvas id="chart-bar"></canvas></div>
    </div>
    <div class="chart-card">
      <div class="chart-title">Distribución de deals</div>
      <div class="chart-sub">Cantidad de deals por estado actual</div>
      <div class="chart-canvas"><canvas id="chart-donut"></canvas></div>
    </div>
  </div>

  <div class="dashboard-bottom">
    <div class="chart-card">
      <div class="panel-title">Actividades recientes</div>
      ${recentActs.length
        ? recentActs.map(a => miniActHTML(a)).join('')
        : emptyState('📋','Sin actividades','Registra tu primera interacción.')}
    </div>
    <div class="chart-card">
      <div class="panel-title">Top deals en pipeline</div>
      ${topDeals.length
        ? topDeals.map(d => miniDealHTML(d)).join('')
        : emptyState('⭐','Sin deals activos','Agrega deals al pipeline.')}
    </div>
  </div>`;

  requestAnimationFrame(buildCharts);
}

function mkStatCard(icon, label, value, bg, iconColor) {
  return `<div class="stat-card">
    <div class="stat-icon" style="background:${bg}"><span style="font-size:20px">${icon}</span></div>
    <div class="stat-label">${label}</div>
    <div class="stat-value" style="color:${iconColor}">${value}</div>
  </div>`;
}

function emptyState(icon, title, desc) {
  return `<div class="empty" style="padding:24px 16px">
    <div class="empty-icon">${icon}</div>
    <p class="empty-title">${title}</p>
    <p class="empty-desc" style="margin-bottom:0">${desc}</p>
  </div>`;
}

function miniActHTML(a) {
  const c = getContacto(a.contactoId);
  return `<div class="act-mini">
    <div class="act-icon" style="background:${ACT_BG[a.tipo]||'#f8f9fb'}">${ACT_ICONS[a.tipo]||'📌'}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:12px;font-weight:600;color:var(--ink)">${escapeHTML(c?.nombre||'—')}
        <span style="font-size:11px;font-weight:400;color:var(--n-500)"> · ${ACT_LABELS[a.tipo]||a.tipo}</span>
      </div>
      <div class="act-desc">${escapeHTML(a.descripcion)}</div>
    </div>
    <div class="act-time">${timeAgo(a.creadoEn)}</div>
  </div>`;
}

function miniDealHTML(d) {
  const c = getContacto(d.contactoId);
  const e = getEtapa(d.etapa);
  return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--n-100)">
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(d.titulo)}</div>
      <div style="font-size:11px;color:var(--n-500)">${escapeHTML(c?.nombre||'—')}</div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div class="money" style="font-size:14px;font-weight:700;color:var(--indigo)">${fmtMXN(d.valor)}</div>
      <span class="badge" style="background:${e.bg};color:${e.tc};font-size:10px;padding:1px 7px">${e.label}</span>
    </div>
  </div>`;
}

/* ── Estado del drill-down de gráficas ── */
const CHART_STATE = { expandedFase: null }; // null = vista de 3 fases agrupadas

function buildCharts() {
  buildBarChart();
  buildDonutChart();
}

/* ── BAR CHART: vista agrupada por fase o desglosada por etapa ── */
function buildBarChart() {
  const barEl = document.getElementById('chart-bar');
  if (!barEl) return;

  // Destruir instancia previa
  if (S.charts.bar) { S.charts.bar.destroy(); S.charts.bar = null; }

  const expanded = CHART_STATE.expandedFase;

  // ── Vista agrupada: 3 fases ───────────────────────────────────
  if (!expanded) {
    const faseData = FASES.map(f => {
      const etapasIds = ETAPAS.filter(e => e.fase === f.id).map(e => e.id);
      const valor     = S.deals.filter(d => etapasIds.includes(d.etapa)).reduce((s,d) => s+(d.valor||0), 0);
      return { label: f.label, valor, color: f.color, bg: f.bg, tc: f.tc, id: f.id };
    });

    // Inyectar hint de click
    const wrap = barEl.closest('.chart-card');
    let hint = wrap.querySelector('.chart-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'chart-hint';
      hint.textContent = '👆 Haz clic en una barra para desglosar sus etapas';
      wrap.querySelector('.chart-sub').after(hint);
    }

    S.charts.bar = new Chart(barEl, {
      type: 'bar',
      data: {
        labels: faseData.map(f => f.label),
        datasets: [{
          data:            faseData.map(f => f.valor),
          backgroundColor: faseData.map(f => f.bg),
          borderColor:     faseData.map(f => f.color),
          borderWidth: 2,
          borderRadius: 8,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_evt, elements) => {
          if (!elements.length) return;
          const idx = elements[0].index;
          CHART_STATE.expandedFase = faseData[idx].id;
          // Redibujar ambas gráficas en modo desglose
          if (S.charts.bar)   { S.charts.bar.destroy();   S.charts.bar   = null; }
          if (S.charts.donut) { S.charts.donut.destroy();  S.charts.donut = null; }
          buildBarChart();
          buildDonutChart();
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ' ' + fmtMXN(ctx.raw) } }
        },
        scales: {
          x: { grid: { color: '#E4E8F0' }, ticks: { callback: v => fmtMXN(v), font: { family: 'Space Grotesk, system-ui', size: 10 } } },
          y: { grid: { display: false },   ticks: { font: { family: 'Space Grotesk, system-ui', size: 12, weight: '600' } } }
        }
      }
    });
    return;
  }

  // ── Vista desglosada: etapas de la fase seleccionada ─────────
  const fase     = FASES.find(f => f.id === expanded);
  const etapas   = ETAPAS.filter(e => e.fase === expanded);
  const vals     = etapas.map(e => S.deals.filter(d => d.etapa === e.id).reduce((s,d) => s+(d.valor||0), 0));

  // Botón "volver"
  const wrap = barEl.closest('.chart-card');
  let backBtn = wrap.querySelector('.chart-back-btn');
  if (!backBtn) {
    backBtn = document.createElement('button');
    backBtn.className = 'chart-back-btn';
    backBtn.innerHTML = '← Volver a fases';
    backBtn.onclick = () => {
      CHART_STATE.expandedFase = null;
      if (S.charts.bar)   { S.charts.bar.destroy();   S.charts.bar   = null; }
      if (S.charts.donut) { S.charts.donut.destroy();  S.charts.donut = null; }
      // Limpiar UI dinámica
      wrap.querySelector('.chart-back-btn')?.remove();
      wrap.querySelector('.chart-hint')?.remove();
      wrap.querySelector('.chart-fase-label')?.remove();
      const wrap2 = document.querySelector('#chart-donut')?.closest('.chart-card');
      wrap2?.querySelector('.chart-back-btn')?.remove();
      wrap2?.querySelector('.chart-fase-label')?.remove();
      buildBarChart();
      buildDonutChart();
    };
    wrap.querySelector('.chart-sub').after(backBtn);
  }

  // Label de fase activa
  let faseLabel = wrap.querySelector('.chart-fase-label');
  if (!faseLabel) {
    faseLabel = document.createElement('div');
    faseLabel.className = 'chart-fase-label';
    backBtn.after(faseLabel);
  }
  faseLabel.innerHTML = `<span style="background:${fase.bg};color:${fase.tc};border:1px solid ${fase.color}33" class="fase-pill">F${fase.n} ${fase.label}</span> — etapas`;

  // Quitar hint si quedó
  wrap.querySelector('.chart-hint')?.remove();

  S.charts.bar = new Chart(barEl, {
    type: 'bar',
    data: {
      labels: etapas.map(e => `${e.emoji} ${e.label}`),
      datasets: [{
        data:            vals,
        backgroundColor: etapas.map(e => e.bg),
        borderColor:     etapas.map(e => e.color),
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + fmtMXN(ctx.raw) } }
      },
      scales: {
        x: { grid: { color: '#E4E8F0' }, ticks: { callback: v => fmtMXN(v), font: { family: 'Space Grotesk, system-ui', size: 10 } } },
        y: { grid: { display: false },   ticks: { font: { family: 'Space Grotesk, system-ui', size: 10 } } }
      }
    }
  });
}

/* ── DONUT CHART: por fase o por etapas de la fase seleccionada ── */
function buildDonutChart() {
  const donutEl = document.getElementById('chart-donut');
  if (!donutEl) return;
  if (S.charts.donut) { S.charts.donut.destroy(); S.charts.donut = null; }

  const expanded = CHART_STATE.expandedFase;
  const wrap     = donutEl.closest('.chart-card');

  // ── Vista agrupada: 3 fases ───────────────────────────────────
  if (!expanded) {
    // Limpiar elementos de desglose
    wrap.querySelector('.chart-back-btn')?.remove();
    wrap.querySelector('.chart-fase-label')?.remove();

    const faseData = FASES.map(f => {
      const etapasIds = ETAPAS.filter(e => e.fase === f.id).map(e => e.id);
      const count     = S.deals.filter(d => etapasIds.includes(d.etapa)).length;
      return { label: f.label, count, color: f.color, bg: f.bg };
    });

    if (faseData.every(f => f.count === 0)) {
      donutEl.closest('.chart-canvas').innerHTML = emptyState('📊','Sin datos','Agrega deals para ver la distribución.');
      return;
    }

    S.charts.donut = new Chart(donutEl, {
      type: 'doughnut',
      data: {
        labels:   faseData.map(f => f.label),
        datasets: [{ data: faseData.map(f => f.count), backgroundColor: faseData.map(f => f.bg), borderColor: faseData.map(f => f.color), borderWidth: 2 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: {
          legend: { position: 'right', labels: { font: { family: 'Space Grotesk, system-ui', size: 12, weight: '600' }, boxWidth: 14, padding: 12 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} deal${ctx.raw !== 1 ? 's' : ''}` } }
        }
      }
    });
    return;
  }

  // ── Vista desglosada: etapas de la fase ──────────────────────
  const fase   = FASES.find(f => f.id === expanded);
  const etapas = ETAPAS.filter(e => e.fase === expanded);
  const counts = etapas.map(e => S.deals.filter(d => d.etapa === e.id).length);

  // Label de fase activa en el donut
  let faseLabel = wrap.querySelector('.chart-fase-label');
  if (!faseLabel) {
    faseLabel = document.createElement('div');
    faseLabel.className = 'chart-fase-label';
    wrap.querySelector('.chart-sub').after(faseLabel);
  }
  faseLabel.innerHTML = `<span style="background:${fase.bg};color:${fase.tc};border:1px solid ${fase.color}33" class="fase-pill">F${fase.n} ${fase.label}</span>`;

  if (counts.every(v => v === 0)) {
    donutEl.closest('.chart-canvas').innerHTML = emptyState('📊','Sin deals','Esta fase no tiene deals aún.');
    return;
  }

  S.charts.donut = new Chart(donutEl, {
    type: 'doughnut',
    data: {
      labels:   etapas.map(e => `${e.emoji} ${e.label}`),
      datasets: [{ data: counts, backgroundColor: etapas.map(e => e.bg), borderColor: etapas.map(e => e.color), borderWidth: 2 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: {
        legend: { position: 'right', labels: { font: { family: 'Space Grotesk, system-ui', size: 11 }, boxWidth: 12, padding: 8 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} deal${ctx.raw !== 1 ? 's' : ''}` } }
      }
    }
  });
}

/* ── 8. PIPELINE KANBAN ─────────────────────────────────────── */

function pipeline() {
  const nonClosedIds  = ['ganado','perdido'];
  const totalActive   = S.deals.filter(d => !nonClosedIds.includes(d.etapa)).reduce((s,d) => s+(d.valor||0), 0);
  const totalGanado   = S.deals.filter(d => d.etapa === 'ganado').reduce((s,d) => s+(d.valor||0), 0);
  const totalDeals    = S.deals.filter(d => !nonClosedIds.includes(d.etapa)).length;

  let html = `
  <div class="pipeline-header">
    <div class="pipeline-stats">
      <span class="pipe-stat">
        <span class="pipe-stat-label">Pipeline activo</span>
        <strong class="pipe-stat-val indigo">${fmtMXN(totalActive)}</strong>
      </span>
      <span class="pipe-stat-sep"></span>
      <span class="pipe-stat">
        <span class="pipe-stat-label">Deals activos</span>
        <strong class="pipe-stat-val teal">${totalDeals}</strong>
      </span>
      <span class="pipe-stat-sep"></span>
      <span class="pipe-stat">
        <span class="pipe-stat-label">Ganado total</span>
        <strong class="pipe-stat-val green">${fmtMXN(totalGanado)}</strong>
      </span>
    </div>
    <button class="btn btn-primary" onclick="openDealModal()">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Nuevo deal
    </button>
  </div>

  <div class="pipeline-phases-container">`;

  FASES.forEach(fase => {
    const faseEtapas = ETAPAS.filter(e => e.fase === fase.id);
    const faseDeals  = S.deals.filter(d => faseEtapas.some(e => e.id === d.etapa));
    const faseValue  = faseDeals.reduce((s,d) => s+(d.valor||0), 0);

    html += `
    <div class="fase-group">
      <div class="fase-header" style="background:${fase.bg}">
        <div class="fase-header-left">
          <span class="fase-num" style="background:${fase.color}">F${fase.n}</span>
          <div>
            <div class="fase-title" style="color:${fase.tc}">${fase.label}</div>
            <div class="fase-desc" style="color:${fase.tc}aa">${fase.desc}</div>
          </div>
        </div>
        <div class="fase-header-right">
          <span class="fase-badge" style="background:${fase.color}1a;color:${fase.tc}">${faseDeals.length} deal${faseDeals.length !== 1 ? 's' : ''}</span>
          ${faseValue > 0 ? `<span class="fase-badge" style="background:${fase.color}1a;color:${fase.tc}">${fmtMXN(faseValue)}</span>` : ''}
        </div>
      </div>
      <div class="fase-cols">`;

    faseEtapas.forEach(e => {
      const deals    = dealsByEtapa(e.id);
      const colValue = deals.reduce((s,d) => s+(d.valor||0), 0);
      html += `
        <div class="kanban-col">
          <div class="kanban-head" style="background:${e.bg};color:${e.tc}">
            <span>${e.emoji} ${e.label}</span>
            <span class="col-count">${deals.length}</span>
          </div>
          <div class="kanban-gate-chip" title="Gate de entrada: ${e.gate}">
            <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
            ${e.gate}
          </div>
          ${colValue > 0 ? `<div class="col-value-row" style="color:${e.tc}">${fmtMXN(colValue)}</div>` : ''}
          <div class="kanban-cards" data-etapa="${e.id}">
            ${deals.map(d => dealCardHTML(d)).join('')}
          </div>
          <button class="kanban-add" onclick="openDealModal(null,'${e.id}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Añadir deal
          </button>
        </div>`;
    });

    html += `
      </div>
    </div>`;
  });

  html += `</div>`;
  document.getElementById('content').innerHTML = html;
  initKanbanSortable();
}

function dealCardHTML(d) {
  const c    = getContacto(d.contactoId);
  const over = isOverdue(d.fechaLimite) && d.etapa !== 'ganado' && d.etapa !== 'perdido';

  // Tracker aparece en onboarding Y en ganado
  const ETAPAS_CON_TRACKER = ['onboarding', 'ganado'];
  const tieneTracker = ETAPAS_CON_TRACKER.includes(d.etapa);

  let trackerHTML = '';
  if (tieneTracker) {
    const MS_DAY = 86_400_000;

    // Usar onboardingStartedAt si existe, si no actualizadoEn, si no creadoEn
    const inicio  = d.onboardingStartedAt || d.actualizadoEn || d.creadoEn;
    const daysSince = Math.floor((Date.now() - inicio) / MS_DAY);
    const progress  = Math.min(daysSince, 14);
    const pct       = Math.round((progress / 14) * 100);

    const milestones = [
      { d:0,  l:'D0',   desc:'Videollamada 45 min · entrega en vivo' },
      { d:1,  l:'D+1',  desc:'WhatsApp: ¿cómo le fue con su primer cliente?' },
      { d:3,  l:'D+3',  desc:'Ofrecer plan R1 o R2 con contexto del producto' },
      { d:7,  l:'D+7',  desc:'NPS 1-10 · si ≥8 pedir testimonio + referido' },
      { d:14, l:'D+14', desc:'Revisión 30 min · ¿qué resultado has visto?' },
    ];

    // Color según etapa
    const trackerColor = d.etapa === 'ganado' ? '#10B981' : '#0D9488';

    trackerHTML = `
    <div class="onboarding-tracker">
      <div class="ob-top">
        <span class="ob-label">Plan 14 días</span>
        <span class="ob-day" style="color:${trackerColor}">D+${progress}</span>
      </div>
      <div class="ob-bar-wrap">
        <div class="ob-bar" style="width:${pct}%;background:linear-gradient(90deg,${trackerColor},#06EDD8)"></div>
      </div>
      <div class="ob-milestones">
        ${milestones.map(m =>
          `<span class="ob-dot${progress >= m.d ? ' done' : ''}"
            style="${progress >= m.d ? `background:${trackerColor};color:#fff` : ''}"
            title="${m.desc}">${m.l}</span>`
        ).join('')}
      </div>
    </div>`;
  }

  // Chip de actividades para dar contexto visual
  const actCount = d.contactoId ? actsByContact(d.contactoId).length : 0;

  return `<div class="deal-card${tieneTracker ? ' deal-onboarding' : ''}"
    data-id="${d.id}"
    onclick="openDealDrawer('${d.id}')"
    ondblclick="event.stopPropagation();openDealModal('${d.id}')"
    title="Clic: ver actividades  ·  Doble clic: editar deal">
    <div class="deal-title">${escapeHTML(d.titulo)}</div>
    ${c ? `<div class="deal-contact-chip">
      <div class="mini-avatar">${initials(c.nombre)}</div>${escapeHTML(c.nombre)}
    </div>` : ''}
    <div class="deal-value">${fmtMXN(d.valor)}</div>
    ${actCount > 0 ? `<div class="deal-act-count">📋 <span>${actCount}</span> actividad${actCount !== 1 ? 'es' : ''}</div>` : ''}
    ${trackerHTML}
    <div class="deal-footer">
      <div class="deal-next">${d.proximaAccion ? '→ '+escapeHTML(d.proximaAccion) : ''}</div>
      ${d.fechaLimite ? `<div class="deal-date${over?' overdue':''}">${over?'⚠️ ':''}${fmtDate(d.fechaLimite)}</div>` : ''}
    </div>
  </div>`;
}

function initKanbanSortable() {
  if (typeof Sortable === 'undefined') return;
  document.querySelectorAll('.kanban-cards').forEach(el => {
    const inst = new Sortable(el, {
      group:       'kanban',
      animation:   200,
      ghostClass:  'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd(evt) {
        const dealId   = evt.item.dataset.id;
        const newEtapa = evt.to.dataset.etapa;
        if (!dealId || !newEtapa) return;
        const deal = S.deals.find(d => d.id === dealId);
        if (deal && deal.etapa !== newEtapa) {
          deal.etapa = newEtapa;
          deal.actualizadoEn = Date.now();
          deal.etapa = newEtapa;
         deal.actualizadoEn = Date.now();

         // ← AGREGAR: registrar cuándo inició el onboarding
        if (['ganado','onboarding'].includes(newEtapa) && !deal.onboardingStartedAt) {
         deal.onboardingStartedAt = Date.now();
         }
          saveState();
          // Refresh counts
          document.querySelectorAll('.kanban-col').forEach(col => {
            const etapa = col.querySelector('.kanban-cards')?.dataset?.etapa;
            const count = col.querySelectorAll('.deal-card').length;
            const badge = col.querySelector('.col-count');
            if (badge) badge.textContent = count;
          });
          toast('Deal movido', `→ ${getEtapa(newEtapa).label}`, 'success');
        }
      }
    });
    S.sortables.push(inst);
  });
}

/* ── 9. CONTACTOS ──────────────────────────────────────────── */

function contactos() {
  const q     = S.searchQuery.toLowerCase();
  const filt  = S.filterFuente;
  let list    = [...S.contactos];
  if (q)    list = list.filter(c => `${c.nombre} ${c.empresa} ${c.whatsapp}`.toLowerCase().includes(q));
  if (filt) list = list.filter(c => c.fuente === filt);
  list.sort((a,b) => b.actualizadoEn - a.actualizadoEn);

  const fuentes = [...new Set(S.contactos.map(c => c.fuente))];

  document.getElementById('content').innerHTML = `
  <div class="view-header">
    <span class="badge badge-neutral">${S.contactos.length} contactos</span>
    <div class="view-filters">
      <input type="search" class="filter-input" placeholder="🔍 Buscar..." value="${escapeHTML(q)}" oninput="filterContacts(this.value)">
      <select class="filter-input" onchange="filterFuente(this.value)">
        <option value="">Todas las fuentes</option>
        ${fuentes.map(f => `<option value="${f}"${filt===f?' selected':''}>${escapeHTML(f)}</option>`).join('')}
      </select>
      <button class="btn btn-ghost btn-sm" onclick="exportCSV('contactos')" title="Exportar CSV">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        CSV
      </button>
      <button class="btn btn-primary" onclick="openContactoModal()">+ Contacto</button>
    </div>
  </div>
  ${list.length === 0
    ? `<div class="empty"><div class="empty-icon">👥</div><p class="empty-title">Sin contactos</p><p class="empty-desc">Agrega tu primer prospecto para empezar.</p><button class="btn btn-primary" onclick="openContactoModal()">+ Nuevo contacto</button></div>`
    : `<div class="contacts-table-wrap">
        <table class="contacts-table">
          <thead><tr>
            <th>Contacto</th><th>Empresa</th><th>Fuente</th>
            <th>Monto est.</th><th>Actualización</th><th>Acciones</th>
          </tr></thead>
          <tbody>${list.map(contactRowHTML).join('')}</tbody>
        </table>
      </div>`
  }`;
}

function contactRowHTML(c) {
  // Etapa del deal más reciente del contacto
  const deals = dealsByContact(c.id)
    .sort((x, y) => y.actualizadoEn - x.actualizadoEn);

  const dealActivo = deals.find(d => d.etapa !== 'perdido') || deals[0];
  const etapa  = dealActivo ? getEtapa(dealActivo.etapa) : null;
  const rowBg  = etapa ? etapa.bg    : 'transparent';
  const rowTc  = etapa ? etapa.tc    : 'var(--n-600)';

  // Badge de etapa para la columna Fuente
  const etapaBadge = etapa
    ? `<span class="badge"
         style="background:${etapa.bg};color:${etapa.tc};
                border:1px solid ${etapa.color}33;margin-left:6px">
         ${etapa.emoji} ${etapa.label}
       </span>`
    : '';

  return `<tr onclick="openDetalleModal('${c.id}')"
    title="Ver detalle de ${escapeHTML(c.nombre)}"
    style="background:${rowBg}">
    <td><div class="contact-row-name">
      <div class="contact-avatar"
        style="background:${etapa?.color||'var(--indigo)'}">${initials(c.nombre)}</div>
      <div>
        <div class="contact-name">${escapeHTML(c.nombre)}</div>
        <div class="contact-email">${escapeHTML(c.email||'—')}</div>
      </div>
    </div></td>
    <td style="font-size:13px;color:var(--n-600)">${escapeHTML(c.empresa||'—')}</td>
    <td><span class="badge badge-indigo">${escapeHTML(c.fuente)}</span>${etapaBadge}</td>
    <td class="money" style="font-size:13px">${fmtMXN(c.monto)}</td>
    <td style="font-size:12px;color:var(--n-500)">${timeAgo(c.actualizadoEn)}</td>
    <td onclick="event.stopPropagation()"><div class="table-actions">
      <a href="https://wa.me/52${c.whatsapp}?text=Hola%20${encodeURIComponent(c.nombre)}%2C%20te%20contacto%20de%20NODE."
        target="_blank" rel="noopener noreferrer"
        class="contact-wa-btn" title="Abrir WhatsApp">💬</a>
      <button class="icon-btn" onclick="openContactoModal('${c.id}')" title="Editar">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="icon-btn danger" onclick="deleteContacto('${c.id}')" title="Eliminar">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div></td>
  </tr>`;
}

const filterContacts = (q) => { S.searchQuery = q; contactos(); };
const filterFuente   = (f) => { S.filterFuente = f; contactos(); };

/* ── 10. ACTIVIDADES ────────────────────────────────────────── */

function actividades() {
  const filt = S.filterActTipo;
  const list = (filt ? S.actividades.filter(a => a.tipo === filt) : [...S.actividades])
    .sort((a,b) => b.creadoEn - a.creadoEn);

  const filterBtns = [['','Todas','🗂️'], ...Object.keys(ACT_ICONS).map(k => [k, ACT_LABELS[k], ACT_ICONS[k]])]
    .map(([id, lbl, icon]) => `<button class="filter-btn${filt===id?' active':''}" onclick="filterActTipo('${id}')">${icon} ${lbl}</button>`)
    .join('');

  document.getElementById('content').innerHTML = `
  <div class="view-header" style="margin-bottom:12px">
    <span class="badge badge-neutral">${S.actividades.length} registros</span>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost btn-sm" onclick="exportCSV('actividades')">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        CSV
      </button>
      <button class="btn btn-primary" onclick="openActividadModal()">+ Actividad</button>
    </div>
  </div>
  <div class="activity-filters">${filterBtns}</div>
  ${list.length === 0
    ? `<div class="empty"><div class="empty-icon">📋</div><p class="empty-title">Sin actividades</p><p class="empty-desc">Registra tu primera interacción.</p><button class="btn btn-primary" onclick="openActividadModal()">+ Actividad</button></div>`
    : `<div class="activity-feed">${list.map(actItemHTML).join('')}</div>`
  }`;
}

function actItemHTML(a) {
  const c = getContacto(a.contactoId);
  return `<div class="activity-item">
    <div class="act-icon" style="background:${ACT_BG[a.tipo]||'#f8f9fb'}">${ACT_ICONS[a.tipo]||'📌'}</div>
    <div class="act-body">
      <div class="act-meta">
        <span class="act-contact">${escapeHTML(c?.nombre||'Contacto eliminado')}</span>
        <span class="act-type">${ACT_LABELS[a.tipo]||a.tipo}</span>
        <span class="act-time">${timeAgo(a.creadoEn)}</span>
      </div>
      <p class="act-desc">${escapeHTML(a.descripcion)}</p>
    </div>
    <button class="icon-btn danger" onclick="deleteActividad('${a.id}')" title="Eliminar">
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
    </button>
  </div>`;
}

const filterActTipo = (t) => { S.filterActTipo = t; actividades(); };

/* ── 11. CONFIGURACIÓN ─────────────────────────────────────── */

function configuracion() {
  const cfg = S.config;
  const exportRow = (lbl, key, count) => `
  <div class="export-zone">
    <div><div class="export-label">${lbl}</div><div class="export-sublabel">${count} registros · CSV</div></div>
    <button class="btn btn-secondary" onclick="exportCSV('${key}')">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Descargar
    </button>
  </div>`;

  document.getElementById('content').innerHTML = `
  <div class="config-grid">
    <div class="config-nav">
      <div style="font-size:11px;font-weight:600;color:var(--n-400);text-transform:uppercase;letter-spacing:.06em;padding:6px 12px;margin-bottom:4px">Secciones</div>
      <button class="config-nav-item active">🏢 Empresa</button>
      <button class="config-nav-item">📊 Pipeline</button>
      <button class="config-nav-item">📦 Exportar</button>
    </div>

    <div class="config-section">
      <div class="config-section-title">Datos de la empresa</div>
      <div class="card" style="display:flex;flex-direction:column;gap:16px">
        <div class="form-row">
          <div class="field">
            <label class="label" for="cfg-empresa">Empresa</label>
            <input type="text" id="cfg-empresa" class="input" value="${escapeHTML(cfg.empresa)}" placeholder="Tu empresa">
          </div>
          <div class="field">
            <label class="label" for="cfg-usuario">Tu nombre</label>
            <input type="text" id="cfg-usuario" class="input" value="${escapeHTML(cfg.usuario)}" placeholder="CEO / Dueño">
          </div>
        </div>
        <div class="field">
          <label class="label" for="cfg-whatsapp">WhatsApp de contacto (con lada)</label>
          <input type="tel" id="cfg-whatsapp" class="input" value="${escapeHTML(cfg.whatsapp||'')}" placeholder="5512345678">
        </div>
        <div><button class="btn btn-primary" onclick="saveConfig()">Guardar cambios</button></div>
      </div>

      <div class="config-section-title" style="margin-top:24px">Pipeline — 3 fases · 14 etapas</div>
      <div class="card">
        <div style="display:flex;flex-direction:column;gap:12px">
          ${FASES.map(fase => {
            const faseEtapas = ETAPAS.filter(e => e.fase === fase.id);
            return `
            <div>
              <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:${fase.bg};border-radius:8px;margin-bottom:4px">
                <span class="fase-num" style="background:${fase.color};font-size:10px;width:20px;height:20px">F${fase.n}</span>
                <span style="font-size:12px;font-weight:700;color:${fase.tc};text-transform:uppercase;letter-spacing:.05em">${fase.label}</span>
                <span style="font-size:11px;color:${fase.tc}88;margin-left:4px">${fase.desc}</span>
              </div>
              ${faseEtapas.map(e => `
              <div style="display:flex;align-items:center;gap:10px;padding:6px 10px 6px 20px;background:${e.bg};border-radius:6px;margin-bottom:3px">
                <span>${e.emoji}</span>
                <span style="font-size:12px;font-weight:600;color:${e.tc};flex:1">${e.label}</span>
                <span style="font-size:10px;color:${e.tc}88;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${e.gate}">${e.gate}</span>
                <span class="badge badge-neutral" style="font-size:10px">${dealsByEtapa(e.id).length} deals</span>
              </div>`).join('')}
            </div>`;
          }).join('')}
        </div>
        <p style="font-size:12px;color:var(--n-400);margin-top:10px">Edición visual de etapas disponible en Fase 2.</p>
      </div>

      <div class="config-section-title" style="margin-top:24px">Exportar datos</div>
      ${exportRow('Contactos',   'contactos',   S.contactos.length)}
      ${exportRow('Deals',       'deals',       S.deals.length)}
      ${exportRow('Actividades', 'actividades', S.actividades.length)}

      <div style="padding:14px 16px;background:var(--err-light);border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:8px">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--err-dark)">⚠️ Borrar todos los datos</div>
          <div style="font-size:12px;color:var(--err-dark)">Elimina contactos, deals y actividades permanentemente.</div>
        </div>
        <button class="btn btn-danger-outline" onclick="resetData()">Resetear CRM</button>
      </div>
    </div>
  </div>`;
}

function saveConfig() {
  S.config.empresa  = document.getElementById('cfg-empresa')?.value.trim()  || S.config.empresa;
  S.config.usuario  = document.getElementById('cfg-usuario')?.value.trim()  || S.config.usuario;
  S.config.whatsapp = document.getElementById('cfg-whatsapp')?.value.trim() || '';
  saveState();
  document.getElementById('sidebar-user-name').textContent = S.config.usuario;
  document.getElementById('sidebar-avatar').textContent    = initials(S.config.usuario);
  toast('Guardado', 'Datos de empresa actualizados.', 'success');
}

function resetData() {
  if (!confirm('¿Seguro? Esta acción borrará TODOS los contactos, deals y actividades.')) return;
  S.contactos = []; S.deals = []; S.actividades = [];
  saveState();
  navigate('dashboard');
  toast('CRM reiniciado', 'Todos los datos han sido eliminados.', 'warn');
}

/* ── 12. MODALES — control ─────────────────────────────────── */

function openModal(id) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-overlay').removeAttribute('aria-hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
  const anyOpen = [...document.querySelectorAll('.modal')].some(m => !m.classList.contains('hidden'));
  if (!anyOpen) closeAllModals();
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  const ov = document.getElementById('modal-overlay');
  ov.classList.add('hidden');
  ov.setAttribute('aria-hidden', 'true');
}

/* ── 13. MODAL — CONTACTO ──────────────────────────────────── */

function openContactoModal(id = null) {
  const c = id ? S.contactos.find(x => x.id === id) : null;
  document.getElementById('modal-contacto-title').textContent = c ? 'Editar Contacto' : 'Nuevo Contacto';
  document.getElementById('contacto-id').value = c?.id   || '';
  document.getElementById('c-nombre').value    = c?.nombre   || '';
  document.getElementById('c-empresa').value   = c?.empresa  || '';
  document.getElementById('c-whatsapp').value  = c?.whatsapp || '';
  document.getElementById('c-email').value     = c?.email    || '';
  document.getElementById('c-fuente').value    = c?.fuente   || 'Instagram';
  document.getElementById('c-monto').value     = c?.monto    || '';
  document.getElementById('c-notas').value     = c?.notas    || '';
  openModal('modal-contacto');
  setTimeout(() => document.getElementById('c-nombre').focus(), 80);
}

function saveContacto() {
  const nombre = document.getElementById('c-nombre').value.trim();
  const wa     = document.getElementById('c-whatsapp').value.trim();
  if (!nombre) { toast('Requerido', 'El nombre es obligatorio.', 'error'); return; }
  if (!wa)     { toast('Requerido', 'El WhatsApp es obligatorio.', 'error'); return; }

  const id  = document.getElementById('contacto-id').value;
  const now = Date.now();
  const data = {
    nombre,
    empresa:      document.getElementById('c-empresa').value.trim(),
    whatsapp:     wa,
    email:        document.getElementById('c-email').value.trim(),
    fuente:       document.getElementById('c-fuente').value,
    monto:        parseFloat(document.getElementById('c-monto').value) || 0,
    notas:        document.getElementById('c-notas').value.trim(),
    actualizadoEn:now,
  };

  if (id) {
    const i = S.contactos.findIndex(c => c.id === id);
    if (i >= 0) S.contactos[i] = { ...S.contactos[i], ...data };
    toast('Actualizado', nombre, 'success');
  } else {
    S.contactos.push({ id:'c'+uid(), creadoEn:now, ...data });
    toast('Contacto creado', nombre, 'success');
  }

  saveState(); closeAllModals();
  if (S.view === 'contactos') contactos();
  else if (S.view === 'dashboard') dashboard();
}

function deleteContacto(id) {
  const c = S.contactos.find(x => x.id === id);
  if (!c || !confirm(`¿Eliminar a ${c.nombre}? Sus deals y actividades también serán eliminados.`)) return;
  S.contactos   = S.contactos.filter(x => x.id !== id);
  S.deals       = S.deals.filter(d => d.contactoId !== id);
  S.actividades = S.actividades.filter(a => a.contactoId !== id);
  saveState(); closeAllModals();
  if (S.view === 'contactos') contactos();
  else navigate(S.view);
  toast('Eliminado', c.nombre, 'warn');
}

/* ── 14. MODAL — DEAL ──────────────────────────────────────── */

function openDealModal(id = null, etapaDefault = null) {
  const d = id ? S.deals.find(x => x.id === id) : null;

  document.getElementById('d-contacto').innerHTML =
    '<option value="">— Selecciona contacto —</option>' +
    S.contactos.map(c => `<option value="${c.id}"${d?.contactoId===c.id?' selected':''}>${escapeHTML(c.nombre)}</option>`).join('');

  document.getElementById('d-etapa').innerHTML =
    ETAPAS.map(e => `<option value="${e.id}"${(d?.etapa||etapaDefault||'prospecto_id')===e.id?' selected':''}>${e.emoji} ${e.label}</option>`).join('');

  document.getElementById('modal-deal-title').textContent = d ? 'Editar Deal' : 'Nuevo Deal';
  document.getElementById('deal-id').value     = d?.id            || '';
  document.getElementById('d-titulo').value    = d?.titulo        || '';
  document.getElementById('d-valor').value     = d?.valor         || '';
  document.getElementById('d-fecha').value     = d?.fechaLimite   || '';
  document.getElementById('d-proxima').value   = d?.proximaAccion || '';
  document.getElementById('d-notas').value     = d?.notas         || '';
  openModal('modal-deal');
  setTimeout(() => document.getElementById('d-titulo').focus(), 80);
}

function saveDeal() {
  const titulo     = document.getElementById('d-titulo').value.trim();
  const contactoId = document.getElementById('d-contacto').value;
  const valor      = parseFloat(document.getElementById('d-valor').value) || 0;
  if (!titulo)     { toast('Requerido','El título es obligatorio.','error'); return; }
  if (!contactoId) { toast('Requerido','Selecciona un contacto.','error');   return; }

  const id  = document.getElementById('deal-id').value;
  const now = Date.now();
  const data = {
    titulo, contactoId, valor,
    etapa:         document.getElementById('d-etapa').value,
    fechaLimite:   document.getElementById('d-fecha').value,
    proximaAccion: document.getElementById('d-proxima').value.trim(),
    notas:         document.getElementById('d-notas').value.trim(),
    actualizadoEn: now,
  };

  // Registrar inicio de onboarding al guardar desde el modal
  if (['ganado', 'onboarding'].includes(data.etapa)) {
    const existente = S.deals.find(d => d.id === id);
    if (!existente?.onboardingStartedAt) {
      data.onboardingStartedAt = now;
    }
  }

  if (id) {
    // ── Edición: actualizar deal ──────────────────────────────
    const i = S.deals.findIndex(d => d.id === id);
    if (i >= 0) S.deals[i] = { ...S.deals[i], ...data };
    toast('Deal actualizado', titulo, 'success');

    saveState(); closeAllModals();
    if      (S.view === 'pipeline')    pipeline();
    else if (S.view === 'dashboard')   dashboard();
    else if (S.view === 'actividades') actividades();

  } else {
    // ── Nuevo deal: guardar + registrar actividad automática ──
    const newDealId = 'd' + uid();
    S.deals.push({ id: newDealId, creadoEn: now, ...data });

    const etapaLabel = getEtapa(data.etapa).label;
    const partes = [
      `Deal creado: "${titulo}"`,
      `Etapa: ${etapaLabel}`,
      data.valor         ? `Valor: ${fmtMXN(data.valor)}`               : null,
      data.fechaLimite   ? `Fecha límite: ${fmtDate(data.fechaLimite)}` : null,
      data.proximaAccion ? `Próxima acción: ${data.proximaAccion}`       : null,
      data.notas         ? `Notas: ${data.notas}`                        : null,
    ].filter(Boolean);

    S.actividades.push({
      id:          'a' + uid(),
      tipo:        'nota',
      contactoId:  contactoId || null,
      descripcion: partes.join(' · '),
      creadoEn:    now,
    });

    // Actualizar timestamp del contacto
    if (contactoId) {
      const c = S.contactos.find(x => x.id === contactoId);
      if (c) c.actualizadoEn = now;
    }

    saveState(); closeAllModals();
    if      (S.view === 'pipeline')    { pipeline();    setTimeout(() => openDealDrawer(newDealId), 120); }
    else if (S.view === 'dashboard')   dashboard();
    else if (S.view === 'actividades') actividades();

    toast('Deal creado', titulo, 'success');
  }

}

function deleteDeal(id) {
  const d = S.deals.find(x => x.id === id);
  if (!d || !confirm(`¿Eliminar el deal "${d.titulo}"?`)) return;
  S.deals = S.deals.filter(x => x.id !== id);
  saveState(); closeAllModals();
  if (S.view === 'pipeline') pipeline();
  toast('Eliminado', d.titulo, 'warn');
}

/* ── 15. MODAL — ACTIVIDAD ─────────────────────────────────── */

function openActividadModal(preselContactoId = null) {
  document.getElementById('act-contacto').innerHTML =
    '<option value="">— Elige contacto —</option>' +
    S.contactos.map(c => `<option value="${c.id}"${preselContactoId===c.id?' selected':''}>${escapeHTML(c.nombre)}</option>`).join('');
  document.getElementById('act-descripcion').value = '';
  document.getElementById('act-tipo').value = 'whatsapp';
  openModal('modal-actividad');
  setTimeout(() => document.getElementById('act-descripcion').focus(), 80);
}

function saveActividad() {
  const desc = document.getElementById('act-descripcion').value.trim();
  if (!desc) { toast('Requerido', 'La descripción es obligatoria.', 'error'); return; }

  const now  = Date.now();
  const cid  = document.getElementById('act-contacto').value || null;
  const act  = { id:'a'+uid(), tipo:document.getElementById('act-tipo').value, contactoId:cid, descripcion:desc, creadoEn:now };
  S.actividades.push(act);

  if (cid) {
    const c = S.contactos.find(x => x.id === cid);
    if (c) c.actualizadoEn = now;
  }

  saveState(); closeAllModals();
  if (S.view === 'actividades') actividades();
  else if (S.view === 'dashboard') dashboard();
  toast('Actividad registrada', ACT_LABELS[act.tipo], 'success');
}

function deleteActividad(id) {
  S.actividades = S.actividades.filter(a => a.id !== id);
  saveState(); actividades();
  toast('Eliminada', '', 'warn');
}

/* ── DEAL DRAWER — Panel lateral de actividades ────────────── */

function openDealDrawer(dealId) {
  const d = S.deals.find(x => x.id === dealId);
  if (!d) return;
  const c = getContacto(d.contactoId);
  const e = getEtapa(d.etapa);

  // Header
  document.getElementById('drawer-deal-title').textContent = d.titulo;
  document.getElementById('drawer-deal-meta').innerHTML = `
    <span class="badge" style="background:${e.bg};color:${e.tc};font-size:10px">${e.emoji} ${e.label}</span>
    ${c ? `<span style="font-size:11px;color:var(--n-500)">· ${escapeHTML(c.nombre)}</span>` : ''}`;

  // Stats row
  const over = isOverdue(d.fechaLimite) && d.etapa !== 'ganado' && d.etapa !== 'perdido';
  document.getElementById('drawer-deal-stats').innerHTML = `
    <div class="drawer-stat">
      <div class="drawer-stat-val">${fmtMXN(d.valor)}</div>
      <div class="drawer-stat-lbl">Valor</div>
    </div>
    <div class="drawer-stat">
      <div class="drawer-stat-val" style="${over ? 'color:var(--error)' : ''}">${d.fechaLimite ? fmtDate(d.fechaLimite) : '—'}</div>
      <div class="drawer-stat-lbl">Fecha límite</div>
    </div>
    <div class="drawer-stat">
      <div class="drawer-stat-val" style="font-size:12px;color:var(--n-600)">${d.proximaAccion ? escapeHTML(d.proximaAccion.slice(0,22))+(d.proximaAccion.length>22?'…':'') : '—'}</div>
      <div class="drawer-stat-lbl">Próxima acción</div>
    </div>`;

  // Actividades del contacto
  const acts = c ? actsByContact(c.id) : [];
  document.getElementById('drawer-act-count').textContent = acts.length;

  document.getElementById('drawer-act-list').innerHTML = acts.length === 0
    ? `<div class="drawer-empty">
        <div class="drawer-empty-icon">📋</div>
        Sin actividades para este contacto.
        <br><button class="btn btn-secondary btn-sm" style="margin-top:12px" onclick="drawerAddActividad()">+ Primera actividad</button>
       </div>`
    : acts.map(a => `
        <div class="drawer-act-item">
          <div class="drawer-act-icon" style="background:${ACT_BG[a.tipo]||'#f8f9fb'}">${ACT_ICONS[a.tipo]||'📌'}</div>
          <div class="drawer-act-body">
            <div class="drawer-act-tipo">${ACT_LABELS[a.tipo]||a.tipo}</div>
            <div class="drawer-act-desc">${escapeHTML(a.descripcion)}</div>
            <div class="drawer-act-time">${timeAgo(a.creadoEn)}</div>
          </div>
        </div>`).join('');

  // Guardar referencias activas en el drawer
  document.getElementById('deal-drawer').dataset.dealId     = dealId;
  document.getElementById('deal-drawer').dataset.contactoId = d.contactoId || '';

  document.getElementById('deal-drawer').classList.add('open');
  document.getElementById('drawer-backdrop').classList.add('open');
}

function closeDealDrawer() {
  document.getElementById('deal-drawer').classList.remove('open');
  document.getElementById('drawer-backdrop').classList.remove('open');
}

function drawerAddActividad() {
  const cid = document.getElementById('deal-drawer').dataset.contactoId;
  closeDealDrawer();
  openActividadModal(cid || null);
}

function setupDrawer() {
  document.getElementById('drawer-close').addEventListener('click', closeDealDrawer);
  document.getElementById('drawer-backdrop').addEventListener('click', closeDealDrawer);
  document.getElementById('drawer-btn-actividad').addEventListener('click', drawerAddActividad);
  document.getElementById('drawer-btn-deal').addEventListener('click', () => {
    const did = document.getElementById('deal-drawer').dataset.dealId;
    closeDealDrawer();
    openDealModal(did);
  });
}

/* ── 16. MODAL — DETALLE CONTACTO ─────────────────────────── */

function openDetalleModal(cid) {
  const c = S.contactos.find(x => x.id === cid);
  if (!c) return;

  document.getElementById('detalle-nombre').textContent  = c.nombre;
  document.getElementById('detalle-empresa').textContent = c.empresa || '—';
  document.getElementById('detalle-avatar').textContent  = initials(c.nombre);

  // Info block
  document.getElementById('detalle-info-block').innerHTML = `
  <div>${[
    ['📱 WhatsApp', c.whatsapp||'—'],
    ['📧 Email',    c.email||'—'],
    ['🏢 Empresa',  c.empresa||'—'],
    ['📣 Fuente',   c.fuente||'—'],
    ['💰 Monto est.',fmtMXN(c.monto)],
    ['📅 Creado',   fmtDate(c.creadoEn)],
  ].map(([k,v]) => `<div class="info-row"><strong>${k}</strong><span>${escapeHTML(String(v))}</span></div>`).join('')}
  </div>
  ${c.notas ? `<div style="background:var(--n-50);border-radius:8px;padding:10px 12px;font-size:13px;color:var(--n-600);border:1px solid var(--n-200);margin-top:8px">${escapeHTML(c.notas)}</div>` : ''}`;

  // Deals block
  const deals = dealsByContact(cid);
  document.getElementById('detalle-deals-block').innerHTML = `
  <div class="detalle-col-title">Deals <span class="badge badge-neutral" style="font-size:10px">${deals.length}</span></div>
  ${deals.length === 0
    ? '<p style="font-size:12px;color:var(--n-400)">Sin deals registrados.</p>'
    : deals.map(d => {
        const e = getEtapa(d.etapa);
        return `<div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--n-50);border-radius:8px;border:1px solid var(--n-200);margin-bottom:6px">
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600">${escapeHTML(d.titulo)}</div>
            <span class="badge" style="background:${e.bg};color:${e.tc};font-size:10px">${e.label}</span>
          </div>
          <div class="money" style="font-size:14px;font-weight:700;color:var(--indigo)">${fmtMXN(d.valor)}</div>
        </div>`;
      }).join('')
  }
  <button class="btn btn-secondary btn-sm" style="width:100%;margin-top:6px" onclick="openDealModal(null,null);setTimeout(()=>{document.getElementById('d-contacto').value='${cid}'},50)">+ Nuevo deal</button>`;

  // Activities
  const acts = actsByContact(cid).slice(0, 8);
  document.getElementById('detalle-act-list').innerHTML = acts.length === 0
    ? '<p style="font-size:12px;color:var(--n-400)">Sin actividades registradas.</p>'
    : acts.map(a => `<div class="act-mini">
        <div class="act-icon" style="background:${ACT_BG[a.tipo]||'#f8f9fb'}">${ACT_ICONS[a.tipo]||'📌'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:600;color:var(--n-600)">${ACT_LABELS[a.tipo]||a.tipo}</div>
          <div class="act-desc">${escapeHTML(a.descripcion)}</div>
        </div>
        <div class="act-time">${timeAgo(a.creadoEn)}</div>
      </div>`).join('');

  // Footer button handlers
  document.getElementById('btn-edit-from-detalle').onclick    = () => { closeAllModals(); openContactoModal(cid); };
  document.getElementById('btn-delete-from-detalle').onclick  = () => deleteContacto(cid);
  document.getElementById('btn-add-act-detalle').onclick      = () => { closeAllModals(); openActividadModal(cid); };
  document.getElementById('btn-detalle-wa').onclick           = () => window.open(`https://wa.me/52${c.whatsapp}?text=Hola%20${encodeURIComponent(c.nombre)}%2C%20te%20contacto%20de%20NODE.`,'_blank','noopener');

  openModal('modal-detalle');
}

/* ── 17. EXPORTAR CSV ──────────────────────────────────────── */

function exportCSV(type) {
  let rows = [], filename = '';

  if (type === 'contactos') {
    filename = 'node-crm-contactos.csv';
    rows = [['ID','Nombre','Empresa','WhatsApp','Email','Fuente','Monto MXN','Notas','Creado']];
    S.contactos.forEach(c => rows.push([c.id, c.nombre, c.empresa, c.whatsapp, c.email, c.fuente, c.monto, c.notas, fmtDate(c.creadoEn)]));
  } else if (type === 'deals') {
    filename = 'node-crm-deals.csv';
    rows = [['ID','Título','Contacto','Valor MXN','Etapa','Fecha Límite','Próxima Acción','Notas']];
    S.deals.forEach(d => rows.push([d.id, d.titulo, getContacto(d.contactoId)?.nombre||'', d.valor, getEtapa(d.etapa).label, d.fechaLimite, d.proximaAccion, d.notas]));
  } else if (type === 'actividades') {
    filename = 'node-crm-actividades.csv';
    rows = [['ID','Tipo','Contacto','Descripción','Fecha']];
    S.actividades.forEach(a => rows.push([a.id, ACT_LABELS[a.tipo]||a.tipo, getContacto(a.contactoId)?.nombre||'', a.descripcion, fmtDate(a.creadoEn)]));
  }

  const csv  = rows.map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href:url, download:filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('CSV exportado', filename, 'success');
}

/* ── 18. BÚSQUEDA ──────────────────────────────────────────── */

function setupSearch() {
  const inp = document.getElementById('global-search');

  inp.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    q ? showSearchResults(q) : closeSearchDropdown();
  });

  inp.addEventListener('keydown', e => {
    if (e.key === 'Escape') { inp.value = ''; closeSearchDropdown(); inp.blur(); }
  });

  document.addEventListener('click', e => {
    if (!inp.closest('.search-wrap').contains(e.target)) closeSearchDropdown();
  });
}

function showSearchResults(q) {
  closeSearchDropdown();
  const contacts = S.contactos.filter(c => `${c.nombre} ${c.empresa}`.toLowerCase().includes(q)).slice(0, 4);
  const deals    = S.deals.filter(d => d.titulo.toLowerCase().includes(q)).slice(0, 3);
  if (!contacts.length && !deals.length) return;

  const box = document.createElement('div');
  box.className = 'search-results'; box.id = 'search-dropdown';
  let html = '';

  if (contacts.length) {
    html += '<div class="sr-section">Contactos</div>';
    contacts.forEach(c => {
      html += `<div class="sr-item" onclick="openDetalleModal('${c.id}');closeSearchDropdown()">
        <div style="width:26px;height:26px;border-radius:50%;background:var(--indigo-100);color:var(--indigo);font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${initials(c.nombre)}</div>
        <span style="flex:1">${escapeHTML(c.nombre)}</span>
        <span style="font-size:11px;color:var(--n-400)">${escapeHTML(c.empresa||'')}</span>
        <span class="sr-tag">Contacto</span>
      </div>`;
    });
  }
  if (deals.length) {
    html += '<div class="sr-section">Deals</div>';
    deals.forEach(d => {
      const e = getEtapa(d.etapa);
      html += `<div class="sr-item" onclick="openDealModal('${d.id}');closeSearchDropdown()">
        <span style="flex:1">${escapeHTML(d.titulo)}</span>
        <span class="sr-tag" style="background:${e.bg};color:${e.tc}">${e.label}</span>
      </div>`;
    });
  }

  box.innerHTML = html;
  document.querySelector('.search-wrap').appendChild(box);
}

const closeSearchDropdown = () => document.getElementById('search-dropdown')?.remove();

/* ── 19. MENÚ RÁPIDO ───────────────────────────────────────── */

function setupQuickMenu() {
  const btn  = document.getElementById('btn-quick-add');
  const menu = document.getElementById('quick-menu');

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const r = btn.getBoundingClientRect();
    menu.style.top   = (r.bottom + 6) + 'px';
    menu.style.right = (window.innerWidth - r.right) + 'px';
    menu.classList.toggle('hidden');
  });

  document.getElementById('qa-contacto')?.addEventListener('click', () => { closeQuickMenu(); openContactoModal(); });
  document.getElementById('qa-deal')?.addEventListener('click',     () => { closeQuickMenu(); openDealModal(); });
  document.getElementById('qa-actividad')?.addEventListener('click',() => { closeQuickMenu(); openActividadModal(); });

  document.addEventListener('click', closeQuickMenu);
}

const closeQuickMenu = () => document.getElementById('quick-menu')?.classList.add('hidden');

/* ── 20. ATAJOS DE TECLADO ─────────────────────────────────── */

function setupKeyboard() {
  document.addEventListener('keydown', e => {
    const inField = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);

    // Alt + 1–5 — navegación
    if (e.altKey && e.key >= '1' && e.key <= '5') {
      e.preventDefault();
      const v = ['dashboard','pipeline','contactos','actividades','configuracion'][+e.key - 1];
      if (v) navigate(v);
      return;
    }

    // Esc — cerrar todo
    if (e.key === 'Escape') {
      closeAllModals(); closeQuickMenu(); closeDealDrawer();
      document.getElementById('shortcuts-panel')?.classList.add('hidden');
      closeSearchDropdown();
      return;
    }

    if (inField) return;

    switch (e.key) {
      case '?': document.getElementById('shortcuts-panel')?.classList.toggle('hidden'); break;
      case 'n': case 'N': openContactoModal(); break;
      case 'd': case 'D': openDealModal();     break;
      case 'a': case 'A': openActividadModal();break;
      default:
        if ((e.ctrlKey||e.metaKey) && e.key==='k') {
          e.preventDefault();
          document.getElementById('global-search').focus();
        }
    }
  });
}

/* ── 21. TOASTS ────────────────────────────────────────────── */

function toast(title, msg='', type='success') {
  const ICONS = { success:'✅', error:'❌', warn:'⚠️', info:'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <span class="toast-icon">${ICONS[type]||'📌'}</span>
    <div class="toast-body">
      <div class="toast-title">${escapeHTML(title)}</div>
      ${msg ? `<div class="toast-msg">${escapeHTML(msg)}</div>` : ''}
    </div>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, 3500);
}

/* ── 22. WIRING ────────────────────────────────────────────── */
/* ── RELOJ EN TIEMPO REAL ── */
function setupClock() {
  const DIAS   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const MESES  = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

  function tick() {
    const now  = new Date();
    const hh   = String(now.getHours()).padStart(2,'0');
    const mm   = String(now.getMinutes()).padStart(2,'0');
    const ss   = String(now.getSeconds()).padStart(2,'0');
    const dia  = DIAS[now.getDay()];
    const fecha= `${dia} ${now.getDate()} ${MESES[now.getMonth()]} ${now.getFullYear()}`;

    const elTime = document.getElementById('clock-time');
    const elDate = document.getElementById('clock-date');
    if (elTime) elTime.textContent = `${hh}:${mm}:${ss}`;
    if (elDate) elDate.textContent = fecha;
  }

  tick(); // mostrar inmediatamente
  // Actualizar cada segundo
  if (window._clockInterval) clearInterval(window._clockInterval);
  window._clockInterval = setInterval(tick, 1000);
}

function wireUpButtons() {
  // Cierre de sesión
  document.getElementById('btn-logout')?.addEventListener('click', logout);
  // Sidebar nav
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });

  // Modal close — data-close buttons
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  // Modal overlay click-outside
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAllModals();
  });

  // Save buttons
  document.getElementById('btn-save-contacto')?.addEventListener('click', saveContacto);
  document.getElementById('btn-save-deal')?.addEventListener('click',     saveDeal);
  document.getElementById('btn-save-actividad')?.addEventListener('click', saveActividad);

  // Enter inside forms (except textarea)
  document.querySelectorAll('.modal form').forEach(form => {
    form.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        form.closest('.modal')?.querySelector('.btn-primary')?.click();
      }
    });
  });

  // Shortcuts panel
  document.getElementById('btn-shortcuts')?.addEventListener('click', () => {
    document.getElementById('shortcuts-panel')?.classList.toggle('hidden');
  });
  document.getElementById('shortcuts-close')?.addEventListener('click', () => {
    document.getElementById('shortcuts-panel')?.classList.add('hidden');
  });
  document.getElementById('shortcuts-backdrop')?.addEventListener('click', () => {
    document.getElementById('shortcuts-panel')?.classList.add('hidden');
  });

  // Deal drawer
  setupDrawer();
}

/* ── 23. INIT ──────────────────────────────────────────────── */

function init() {

  setupLoginScreen();

  const hasData = loadState();
  if (!hasData) seedData();

  // Restaurar sesión activa (recarga de pestaña)
  if (restoreSession()) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    applyRole();
    wireUpButtons();
    setupSearch();
    setupQuickMenu();
    setupKeyboard();
    setupClock();

    // Navegar a primera vista permitida del rol restaurado
    const firstView = ROLE_VIEWS[AUTH.role]?.[0] || 'pipeline';
    navigate(firstView);

  } else {
    // Sin sesión → mostrar login
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  }
}

document.addEventListener('DOMContentLoaded', init);
