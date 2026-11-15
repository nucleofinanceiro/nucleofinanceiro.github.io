"use strict";
/* =====================================================================
   Núcleo Financeiro — app web (Supabase)
   ===================================================================== */
const CFG = window.APP_CONFIG || {};
const APP_NAME = CFG.APP_NAME || "Núcleo Financeiro";

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const BRL = new Intl.NumberFormat("pt-BR", {style:"currency", currency:"BRL"});
const money = v => BRL.format(Number(v) || 0);
const r2 = v => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;
const numBR = v => (Number(v) || 0).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
function parseBR(s){
  if (typeof s === "number") return s;
  s = String(s ?? "").trim().replace(/R\$|\s/g, "");
  if (!s) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith("-")) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : (neg ? -n : n);
}
const pad = n => String(n).padStart(2, "0");
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const hojeMes = () => hoje().slice(0, 7);
function addMes(m, n){ let [y, mo] = m.split("-").map(Number); mo += n; while (mo > 12) { mo -= 12; y++; } while (mo < 1) { mo += 12; y--; } return `${y}-${pad(mo)}`; }
const MES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const MESF = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const labelMes = m => m ? `${MES[+m.slice(5,7)-1]}/${m.slice(0,4)}` : "";
const labelMesF = m => m ? `${MESF[+m.slice(5,7)-1]} de ${m.slice(0,4)}` : "";
const fmtData = d => d ? `${d.slice(8,10)}/${d.slice(5,7)}/${d.slice(0,4)}` : "—";
const nowISO = () => new Date().toISOString();
function compact(v){ const a = Math.abs(v); if (a >= 1e6) return (v/1e6).toLocaleString("pt-BR",{maximumFractionDigits:1})+" mi"; if (a >= 1e3) return (v/1e3).toLocaleString("pt-BR",{maximumFractionDigits:1})+" mil"; return Math.round(v).toLocaleString("pt-BR"); }
const ls = { get(k){ try { return localStorage.getItem(k); } catch { return null; } }, set(k, v){ try { localStorage.setItem(k, v); } catch {} } };

/* ---------- domínio ---------- */
const GRUPOS = {
  receita:{label:"Receita", tipo:"entrada"},
  despesa:{label:"Despesa", tipo:"saida"},
  imposto:{label:"Imposto", tipo:"saida"},
  prolabore:{label:"Pró-labore", tipo:"saida"},
  socios:{label:"Sócios", tipo:null},
  transferencia:{label:"Transferência", tipo:null}
};
const CATS = {
  receita:["Patrocínio e publicidade","YouTube / AdSense","Membros e doações","Venda de livros","Serviços editoriais (ghostwriting)","Eventos e debates","Prestação de serviços","Outras receitas"],
  despesa:["Equipamentos","Estúdio e aluguel","Software e assinaturas","Edição e produção de vídeo","Produção editorial (revisão, diagramação, capa)","Gráfica e impressão","ISBN, ficha e registros","Marketing e anúncios","Contabilidade e jurídico","Tarifas bancárias","Transporte e deslocamento","Outras despesas"],
  imposto:["DAS - Simples Nacional","INSS retido (pró-labore)","IRRF (pró-labore)","CPP patronal (Anexo IV)","ISS","Taxas e alvarás","Outros tributos"],
  prolabore:["Pró-labore"],
  socios:["Distribuição de lucros","Aporte dos sócios","Compra de participação societária"],
  transferencia:["Transferência entre contas","Aplicação / resgate"]
};
const DEF_PARAMS = {
  socios:[], inssAliq:0.11, tetoInss:8475.55, salarioMinimo:1621.00,
  descSimplificado:607.20, deducaoDependente:189.59, anexoIV:false, cppAliq:0.20
};
const IR_FAIXAS = [ // tabela progressiva mensal vigente desde maio/2025 (mantida em 2026)
  {ate:2428.80, aliq:0, ded:0},
  {ate:2826.65, aliq:0.075, ded:182.16},
  {ate:3751.05, aliq:0.15, ded:394.16},
  {ate:4664.68, aliq:0.225, ded:675.49},
  {ate:Infinity, aliq:0.275, ded:908.73}
];
function calcProlabore(bruto, dependentes, cfg){
  bruto = r2(bruto); dependentes = Math.max(0, parseInt(dependentes) || 0);
  const inss = r2(Math.min(bruto, cfg.tetoInss) * cfg.inssAliq);
  const dedLegal = inss + dependentes * cfg.deducaoDependente;
  const usaSimpl = cfg.descSimplificado > dedLegal;
  const deducao = r2(Math.max(dedLegal, cfg.descSimplificado));
  const base = r2(Math.max(0, bruto - deducao));
  const f = IR_FAIXAS.find(x => base <= x.ate);
  const irTabela = r2(Math.max(0, base * f.aliq - f.ded));
  let reducao = 0; // Lei 15.270/2025
  if (bruto <= 5000) reducao = Math.min(312.89, irTabela);
  else if (bruto <= 7350) reducao = Math.max(0, 978.62 - 0.133145 * bruto);
  reducao = r2(Math.min(reducao, irTabela));
  const irrf = r2(irTabela - reducao);
  const liquido = r2(bruto - inss - irrf);
  const cpp = cfg.anexoIV ? r2(bruto * cfg.cppAliq) : 0;
  return {bruto, inss, deducao, usaSimpl, base, aliq:f.aliq, irTabela, reducao, irrf, liquido, cpp, dependentes};
}
const mesCaixa = l => ((l.status === "pago" ? (l.data_pagamento || l.vencimento) : l.vencimento) || (l.competencia ? l.competencia + "-01" : "")).slice(0, 7);
const atrasado = l => l.status !== "pago" && l.vencimento && l.vencimento < hoje();
const statusOf = l => l.status === "pago" ? "pago" : (atrasado(l) ? "atrasado" : "pendente");
const STATUS_LBL = {pago:"Pago", pendente:"Pendente", atrasado:"Vencido"};
const sinal = l => l.tipo === "entrada" ? 1 : -1;
const socioNome = id => (S.cfg.socios.find(s => s.id === id) || {}).nome || "";
const PAPEL_LBL = {dono:"Dono", editor:"Editor", leitor:"Somente leitura"};

function sugerir(desc, valor){
  const d = (desc || "").toUpperCase();
  const t = (g, c) => ({grupo:g, categoria:c});
  if (/\bDAS\b|SIMPLES NAC|PGDAS/.test(d)) return t("imposto","DAS - Simples Nacional");
  if (/DCTFWEB|\bGPS\b|\bINSS\b|PREVID/.test(d)) return t("imposto","INSS retido (pró-labore)");
  if (/DARF|RECEITA FED|\bIRRF\b/.test(d)) return t("imposto","IRRF (pró-labore)");
  if (/\bISS\b|PREFEITURA|MUNICIP/.test(d)) return t("imposto","ISS");
  if (/PR[OÓ].?LABORE/.test(d)) return t("prolabore","Pró-labore");
  if (/TARIFA|\bTAR\b|PACOTE DE SERV|MANUT.*CONTA|ANUIDADE/.test(d)) return t("despesa","Tarifas bancárias");
  if (/APLICA|RESGATE|CDB|POUPAN/.test(d)) return t("transferencia","Aplicação / resgate");
  if (valor > 0){
    if (/GOOGLE|YOUTUBE|ADSENSE/.test(d)) return t("receita","YouTube / AdSense");
    if (/HOTMART|KIWIFY|EDUZZ|AMAZON|KDP|UICLAP|CLUBE DE AUTORES/.test(d)) return t("receita","Venda de livros");
    if (/APOIA|CATARSE|PADRIM|MEMBRO/.test(d)) return t("receita","Membros e doações");
    return t("receita","Outras receitas");
  }
  if (/GRAFICA|GRÁFICA|IMPRESS/.test(d)) return t("despesa","Gráfica e impressão");
  if (/ADOBE|CANVA|GOOGLE|APPLE|SPOTIFY|STREAMYARD|RIVERSIDE|NOTION|MICROSOFT|ZOOM/.test(d)) return t("despesa","Software e assinaturas");
  if (/META|FACEBK|FACEBOOK|ADS\b/.test(d)) return t("despesa","Marketing e anúncios");
  if (/UBER|99 ?APP|POSTO|COMBUST|ESTACION/.test(d)) return t("despesa","Transporte e deslocamento");
  if (/CONTAB/.test(d)) return t("despesa","Contabilidade e jurídico");
  return t("despesa","Outras despesas");
}

/* ---------- estado ---------- */
const S = {
  sb:null, user:null, membros:[], eid:null, papel:null, emp:null,
  cfg:{...DEF_PARAMS, nome:"", cnpj:"", banco:""},
  lanc:[], ext:[], chan:null,
  view:"painel", mounted:null, mes:hojeMes(), ano:+hojeMes().slice(0,4),
  filtro:{grupo:"", status:"", q:"", ano:false}, extSel:hojeMes(), cfgDirty:false, imp:null, recovery:false
};
const canEdit = () => S.papel === "dono" || S.papel === "editor";
const isDono = () => S.papel === "dono";

/* ---------- interface comum ---------- */
let toastT;
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 4200); }
function setSync(kind, msg){ const s = $("#sync"); s.className = "sync " + kind; s.querySelector("span").textContent = msg; }
function openDlg(html, wide){ const d = $("#dlg"); d.className = "dlg" + (wide ? " wide" : ""); d.innerHTML = html; $("#ovl").hidden = false; const f = d.querySelector("input:not([type=radio]):not([type=checkbox]),select,button"); if (f) f.focus(); }
function closeDlg(){ $("#ovl").hidden = true; $("#dlg").innerHTML = ""; S.imp = null; }
$("#ovl").addEventListener("click", e => { if (e.target.id === "ovl") closeDlg(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#ovl").hidden) closeDlg(); });
const mpick = act => `<div class="mpick"><button type="button" data-act="${act}" data-d="-1" aria-label="Anterior">‹</button><span>${act === "ano" ? S.ano : esc(labelMesF(S.mes))}</span><button type="button" data-act="${act}" data-d="1" aria-label="Próximo">›</button></div>`;
const pill = st => `<span class="pill ${st}">${STATUS_LBL[st]}</span>`;
function armDanger(btn, txt = "Confirmar"){ if (btn.classList.contains("armed")) return true; btn.classList.add("armed"); btn.dataset.orig = btn.textContent; btn.textContent = txt; setTimeout(() => { if (btn.isConnected){ btn.classList.remove("armed"); btn.textContent = btn.dataset.orig; } }, 4000); return false; }
function msgErro(e){
  const m = (e && (e.message || e.error_description)) || "";
  if (e && (e.code === "42501" || /row-level security|permission denied/i.test(m))) return "Você não tem permissão para fazer isso nesta empresa.";
  if (/JWT|session|token/i.test(m)) return "Sua sessão expirou. Entre de novo.";
  if (e && e.code === "23505") return "Esse registro já existe.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão com a internet.";
  return m || "Algo deu errado. Tente de novo.";
}
async function W(fn, okMsg, opts = {}){
  if (!opts.semPermissao && !canEdit()){ toast("Seu acesso a esta empresa é somente leitura."); return null; }
  try {
    const {data, error} = await fn();
    if (error) throw error;
    if (okMsg) toast(okMsg);
    return data ?? true;
  } catch (e){ console.error(e); toast(msgErro(e)); return null; }
}
function upsertLocal(arr, row){ const i = arr.findIndex(x => x.id === row.id); if (i >= 0) arr[i] = row; else arr.push(row); }
const normLanc = l => Object.assign({}, l, {valor:Number(l.valor) || 0});
const normExt = e => Object.assign({}, e, {saldo_inicial:e.saldo_inicial == null ? null : Number(e.saldo_inicial), saldo_final:e.saldo_final == null ? null : Number(e.saldo_final), arquivos:Array.isArray(e.arquivos) ? e.arquivos : []});
function baixar(nome, conteudo, tipo){ const b = new Blob([conteudo], {type:tipo}); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

/* ---------- autenticação ---------- */
function showScreen(id){ ["boot","auth","onb","app"].forEach(x => $("#" + x).hidden = x !== id); }
function authMode(){ return $("#authTabs input:checked").value; }
function setAuthMode(m){
  const inp = $(`#authTabs input[value="${m}"]`); if (inp) inp.checked = true;
  const rec = m === "recuperar", nova = m === "nova";
  $("#authTabs").hidden = nova;
  $("#wEmail").hidden = nova;
  $("#wSenha").hidden = rec;
  $("#wSenha2").hidden = !(m === "criar" || nova);
  $("#aEsqueci").hidden = !(m === "entrar" || rec);
  $("#aEsqueci").textContent = rec ? "Voltar para entrar" : "Esqueci a senha";
  $("#aSenha").autocomplete = m === "entrar" ? "current-password" : "new-password";
  $("#aGo").textContent = {entrar:"Entrar", criar:"Criar conta", recuperar:"Enviar link para nova senha", nova:"Salvar nova senha"}[m];
  $("#aMsg").textContent = ""; $("#aMsg").className = "msg";
  $("#fAuth").dataset.mode = m;
}
$$("#authTabs input").forEach(i => i.addEventListener("change", () => setAuthMode(i.value)));
$("#aEsqueci").addEventListener("click", () => setAuthMode($("#fAuth").dataset.mode === "recuperar" ? "entrar" : "recuperar"));
function aMsg(txt, kind){ const m = $("#aMsg"); m.textContent = txt; m.className = "msg " + (kind || ""); }
$("#fAuth").addEventListener("submit", async e => {
  e.preventDefault();
  const mode = $("#fAuth").dataset.mode || "entrar";
  const email = $("#aEmail").value.trim(), senha = $("#aSenha").value, senha2 = $("#aSenha2").value;
  const redirect = location.origin + location.pathname;
  const btn = $("#aGo"); btn.disabled = true;
  try {
    if (mode !== "nova" && !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Digite um e-mail válido.");
    if (mode === "entrar"){
      const {error} = await S.sb.auth.signInWithPassword({email, password:senha});
      if (error) throw new Error(/invalid login/i.test(error.message) ? "E-mail ou senha incorretos." : /not confirmed/i.test(error.message) ? "Confirme seu e-mail pelo link que enviamos antes de entrar." : error.message);
    } else if (mode === "criar"){
      if (senha.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
      if (senha !== senha2) throw new Error("As senhas não conferem.");
      const {data, error} = await S.sb.auth.signUp({email, password:senha, options:{emailRedirectTo:redirect}});
      if (error) throw new Error(/registered/i.test(error.message) ? "Esse e-mail já tem conta. Use a aba Entrar." : error.message);
      if (!data.session) aMsg("Conta criada. Abra o link de confirmação que enviamos para o seu e-mail e depois entre aqui.", "ok");
    } else if (mode === "recuperar"){
      const {error} = await S.sb.auth.resetPasswordForEmail(email, {redirectTo:redirect});
      if (error) throw error;
      aMsg("Se houver conta com esse e-mail, você vai receber um link para criar uma nova senha.", "ok");
    } else if (mode === "nova"){
      if (senha.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
      if (senha !== senha2) throw new Error("As senhas não conferem.");
      const {error} = await S.sb.auth.updateUser({password:senha});
      if (error) throw error;
      S.recovery = false; toast("Senha alterada.");
      const {data} = await S.sb.auth.getSession();
      await entrou(data.session);
    }
  } catch (err){ aMsg(err.message || String(err), "bad"); }
  btn.disabled = false;
});

async function entrou(session){
  if (!session){ S.user = null; pararTempoReal(); showScreen("auth"); setAuthMode(S.recovery ? "nova" : "entrar"); return; }
  if (S.recovery){ showScreen("auth"); setAuthMode("nova"); return; }
  if (S.user && S.user.id === session.user.id && S.eid) return;
  if (S.entrando) return;
  S.entrando = true;
  try { await entrar2(session); } finally { S.entrando = false; }
}
async function entrar2(session){
  S.user = session.user;
  $("#meEmail").textContent = S.user.email || "";
  $("#onbUser").textContent = "Conectado como " + (S.user.email || "");
  const pend = sessionStorage.getItem("convite");
  if (pend){
    sessionStorage.removeItem("convite");
    const eid = await W(() => S.sb.rpc("aceitar_convite", {p_codigo:pend}), "Convite aceito. Bem-vindo à empresa.", {semPermissao:true});
    if (eid) ls.set("empresaAtual", eid);
  }
  await carregarEmpresas();
}

async function carregarEmpresas(prefer){
  const {data, error} = await S.sb.from("membros").select("empresa_id,papel,empresas(id,nome,cnpj,banco,config)").eq("user_id", S.user.id);
  if (error){ showScreen("onb"); toast(msgErro(error)); return; }
  S.membros = (data || []).filter(m => m.empresas).sort((a, b) => a.empresas.nome.localeCompare(b.empresas.nome));
  if (!S.membros.length){ S.eid = null; showScreen("onb"); $("#onbVoltar").hidden = true; return; }
  const alvo = prefer || ls.get("empresaAtual");
  const m = S.membros.find(x => x.empresa_id === alvo) || S.membros[0];
  await abrirEmpresa(m.empresa_id);
}

function aplicarEmpresa(emp){
  S.emp = emp;
  const c = emp.config && typeof emp.config === "object" ? emp.config : {};
  S.cfg = Object.assign({}, DEF_PARAMS, c, {nome:emp.nome, cnpj:emp.cnpj || "", banco:emp.banco || ""});
  if (!Array.isArray(S.cfg.socios)) S.cfg.socios = [];
}

async function abrirEmpresa(eid){
  const m = S.membros.find(x => x.empresa_id === eid); if (!m) return;
  S.eid = eid; S.papel = m.papel; aplicarEmpresa(m.empresas);
  ls.set("empresaAtual", eid);
  document.body.classList.toggle("ro", !canEdit());
  $("#empSel").innerHTML = S.membros.map(x => `<option value="${esc(x.empresa_id)}" ${x.empresa_id === eid ? "selected" : ""}>${esc(x.empresas.nome)}</option>`).join("") + `<option value="__nova">+ Outra empresa ou convite…</option>`;
  $("#papelLbl").textContent = PAPEL_LBL[S.papel];
  S.lanc = []; S.ext = []; S.cfgDirty = false; S.mounted = null;
  showScreen("app"); setSync("warn", "Carregando dados…"); route();
  await recarregar();
  iniciarTempoReal();
}
$("#empSel").addEventListener("change", e => {
  if (e.target.value === "__nova"){ e.target.value = S.eid; pararTempoReal(); showScreen("onb"); $("#onbVoltar").hidden = false; return; }
  abrirEmpresa(e.target.value);
});
$("#onbVoltar").addEventListener("click", () => { showScreen("app"); iniciarTempoReal(); });

async function fetchAll(table){
  let out = [], from = 0;
  for (;;){
    const {data, error} = await S.sb.from(table).select("*").eq("empresa_id", S.eid).range(from, from + 999);
    if (error) throw error;
    out = out.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}
let recarregando = null;
async function recarregar(){
  const eid = S.eid;
  try {
    const [lanc, ext, emp] = await Promise.all([fetchAll("lancamentos"), fetchAll("extratos"), S.sb.from("empresas").select("id,nome,cnpj,banco,config").eq("id", eid).single()]);
    if (eid !== S.eid) return;
    S.lanc = lanc.map(normLanc); S.ext = ext.map(normExt);
    if (emp.data){ aplicarEmpresa(emp.data); const m = S.membros.find(x => x.empresa_id === eid); if (m) m.empresas = emp.data; }
    setSync("ok", "Dados sincronizados");
  } catch (e){ console.error(e); setSync("bad", "Não foi possível carregar: " + msgErro(e)); }
  render();
}
function recarregarDepois(){ clearTimeout(recarregando); recarregando = setTimeout(recarregar, 700); }
function iniciarTempoReal(){
  pararTempoReal();
  if (!S.eid) return;
  const f = "empresa_id=eq." + S.eid;
  S.chan = S.sb.channel("emp-" + S.eid)
    .on("postgres_changes", {event:"*", schema:"public", table:"lancamentos", filter:f}, recarregarDepois)
    .on("postgres_changes", {event:"*", schema:"public", table:"extratos", filter:f}, recarregarDepois)
    .on("postgres_changes", {event:"*", schema:"public", table:"empresas", filter:"id=eq." + S.eid}, recarregarDepois)
    .subscribe();
}
function pararTempoReal(){ if (S.chan){ try { S.sb.removeChannel(S.chan); } catch {} S.chan = null; } }

/* Onboarding */
$("#fNovaEmp").addEventListener("submit", async e => {
  e.preventDefault();
  const nome = $("#nNome").value.trim();
  if (!nome){ toast("Informe o nome da empresa."); $("#nNome").focus(); return; }
  const eid = await W(() => S.sb.rpc("criar_empresa", {p_nome:nome, p_cnpj:$("#nCnpj").value.trim(), p_banco:$("#nBanco").value.trim(), p_config:DEF_PARAMS}), "Empresa criada.", {semPermissao:true});
  if (eid){ $("#fNovaEmp").reset(); location.hash = "#configuracoes"; await carregarEmpresas(eid); }
});
$("#fConvite").addEventListener("submit", async e => {
  e.preventDefault();
  const cod = $("#cCodigo").value.trim();
  if (!cod){ toast("Cole o código do convite."); return; }
  const eid = await W(() => S.sb.rpc("aceitar_convite", {p_codigo:cod}), "Convite aceito.", {semPermissao:true});
  if (eid){ $("#fConvite").reset(); await carregarEmpresas(eid); }
});

/* ---------- formulário de lançamento ---------- */
function catOptions(grupo, sel){ return (CATS[grupo] || []).map(c => `<option ${c === sel ? "selected" : ""}>${esc(c)}</option>`).join(""); }
function socioOptions(sel){ return `<option value="">—</option>` + S.cfg.socios.map(s => `<option value="${esc(s.id)}" ${s.id === sel ? "selected" : ""}>${esc(s.nome)}</option>`).join(""); }
function openLanc(id, preset = {}){
  const old = id ? S.lanc.find(l => l.id === id) : null;
  const l = Object.assign({tipo:"saida", grupo:"despesa", categoria:"", descricao:"", valor:"", competencia:S.mes, vencimento:"", status:"pendente", data_pagamento:"", socio_id:"", obs:""}, preset, old || {});
  if (!l.categoria) l.categoria = CATS[l.grupo][0];
  const ro = !canEdit();
  openDlg(`
  <form id="fLanc" class="form" novalidate>
    <div class="full head"><h2>${old ? (ro ? "Lançamento" : "Editar lançamento") : "Novo lançamento"}</h2>
      <div class="seg" role="radiogroup" aria-label="Tipo">
        <label><input type="radio" name="tipo" value="entrada" ${l.tipo === "entrada" ? "checked" : ""}>Entrada</label>
        <label><input type="radio" name="tipo" value="saida" ${l.tipo !== "entrada" ? "checked" : ""}>Saída</label>
      </div></div>
    <label class="f">Grupo<select id="lGrupo">${Object.entries(GRUPOS).map(([k, g]) => `<option value="${k}" ${k === l.grupo ? "selected" : ""}>${g.label}</option>`).join("")}</select></label>
    <label class="f">Categoria<select id="lCat">${catOptions(l.grupo, l.categoria)}</select></label>
    <label class="f full">Descrição<input type="text" id="lDesc" value="${esc(l.descricao)}" placeholder="Ex.: Patrocínio episódio 42"></label>
    <label class="f">Valor (R$)<input type="text" id="lValor" inputmode="decimal" value="${l.valor !== "" ? esc(numBR(l.valor)) : ""}" placeholder="0,00"></label>
    <label class="f">Competência<input type="month" id="lComp" value="${esc(l.competencia)}"></label>
    <label class="f">Vencimento<input type="date" id="lVenc" value="${esc(l.vencimento || "")}"></label>
    <label class="f">Situação<select id="lStatus"><option value="pendente" ${l.status !== "pago" ? "selected" : ""}>Pendente</option><option value="pago" ${l.status === "pago" ? "selected" : ""}>Pago / recebido</option></select></label>
    <label class="f" id="wrapPag">Data do pagamento<input type="date" id="lPag" value="${esc(l.data_pagamento || "")}"></label>
    <label class="f" id="wrapSocio">Sócio<select id="lSocio">${socioOptions(l.socio_id)}</select></label>
    <label class="f full">Observação<input type="text" id="lObs" value="${esc(l.obs || "")}" placeholder="Opcional: nº da nota, código da guia, etc."></label>
    <div class="full actions">
      <div class="row">${old && !ro ? `<button type="button" class="btn danger" data-act="lanc-del" data-id="${esc(old.id)}">Excluir</button>` : ""}</div>
      <div class="row"><button type="button" class="btn" data-act="dlg-close">${ro ? "Fechar" : "Cancelar"}</button>${ro ? "" : `<button type="submit" class="btn pri" id="lSave">Salvar</button>`}</div>
    </div>
  </form>`);
  const f = $("#fLanc");
  if (ro) $$("input,select", f).forEach(x => x.disabled = true);
  const sync = () => {
    $("#wrapPag").style.display = $("#lStatus").value === "pago" ? "" : "none";
    const g = $("#lGrupo").value;
    $("#wrapSocio").style.display = (g === "prolabore" || g === "socios") ? "" : "none";
  };
  $("#lGrupo").addEventListener("change", () => {
    const g = $("#lGrupo").value;
    $("#lCat").innerHTML = catOptions(g);
    if (GRUPOS[g].tipo) f.querySelector(`input[name=tipo][value=${GRUPOS[g].tipo}]`).checked = true;
    sync();
  });
  $("#lStatus").addEventListener("change", () => { if ($("#lStatus").value === "pago" && !$("#lPag").value) $("#lPag").value = $("#lVenc").value && $("#lVenc").value <= hoje() ? $("#lVenc").value : hoje(); sync(); });
  sync();
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const valor = Math.abs(r2(parseBR($("#lValor").value)));
    const desc = $("#lDesc").value.trim(), comp = $("#lComp").value;
    if (!desc){ toast("Preencha a descrição."); $("#lDesc").focus(); return; }
    if (!valor){ toast("Informe um valor maior que zero."); $("#lValor").focus(); return; }
    if (!comp){ toast("Informe a competência."); $("#lComp").focus(); return; }
    const status = $("#lStatus").value;
    const row = {
      empresa_id:S.eid, tipo:f.querySelector("input[name=tipo]:checked").value,
      grupo:$("#lGrupo").value, categoria:$("#lCat").value, descricao:desc, valor,
      competencia:comp, vencimento:$("#lVenc").value || null, status,
      data_pagamento:status === "pago" ? ($("#lPag").value || $("#lVenc").value || hoje()) : null,
      socio_id:$("#lSocio").value || null, obs:$("#lObs").value.trim(), atualizado_em:nowISO()
    };
    const btn = $("#lSave"); btn.disabled = true; btn.textContent = "Salvando…";
    const q = old ? S.sb.from("lancamentos").update(row).eq("id", old.id) : S.sb.from("lancamentos").insert(row);
    const data = await W(() => q.select().single(), old ? "Lançamento atualizado." : "Lançamento salvo.");
    if (data){ upsertLocal(S.lanc, normLanc(data)); closeDlg(); render(); }
    else { btn.disabled = false; btn.textContent = "Salvar"; }
  });
}

/* ---------- views ---------- */
const V = {};

V["painel"] = {
  mount(el){ el.innerHTML = `<div class="view" id="vp"></div>`; },
  update(){
    const m = S.mes, L = S.lanc.filter(l => l.grupo !== "transferencia");
    const doMes = L.filter(l => mesCaixa(l) === m);
    const ent = doMes.filter(l => l.tipo === "entrada" && l.status === "pago").reduce((a, l) => a + l.valor, 0);
    const sai = doMes.filter(l => l.tipo === "saida" && l.status === "pago").reduce((a, l) => a + l.valor, 0);
    const pend = S.lanc.filter(l => l.status !== "pago" && l.tipo === "saida" && mesCaixa(l) <= m);
    const pendVal = pend.reduce((a, l) => a + l.valor, 0);
    const venc = pend.filter(atrasado).length;
    const aReceber = doMes.filter(l => l.tipo === "entrada" && l.status !== "pago").reduce((a, l) => a + l.valor, 0);
    const meses = Array.from({length:12}, (_, i) => addMes(m, i - 11));
    const serie = meses.map(mm => { const x = L.filter(l => l.status === "pago" && mesCaixa(l) === mm); return {m:mm, e:x.filter(l => l.tipo === "entrada").reduce((a, l) => a + l.valor, 0), s:x.filter(l => l.tipo === "saida").reduce((a, l) => a + l.valor, 0)}; });
    const porCat = {};
    doMes.filter(l => l.tipo === "saida" && l.status === "pago").forEach(l => { const k = l.grupo === "despesa" ? l.categoria : GRUPOS[l.grupo].label; porCat[k] = (porCat[k] || 0) + l.valor; });
    const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const maxCat = cats.length ? cats[0][1] : 1;
    const prox = S.lanc.filter(l => l.status !== "pago" && l.vencimento).sort((a, b) => a.vencimento.localeCompare(b.vencimento)).slice(0, 7);
    const exts = S.ext.filter(e => e.mes === m);
    const nArq = exts.reduce((a, e) => a + e.arquivos.length, 0);
    $("#vp").innerHTML = `
      <div class="head"><div><h1>${esc(S.cfg.nome)}</h1><p>Regime de caixa: entradas e saídas contam no mês em que foram pagas ou recebidas.</p></div>
        <div class="row">${mpick("mes")}<button class="btn pri needs-edit" data-act="lanc-new">Novo lançamento</button></div></div>
      ${!S.lanc.length ? `<div class="card"><h2>Comece por aqui</h2><div class="steps">
        <div><b>1. Empresa e sócios</b>Confira os sócios, o CNPJ e o anexo do Simples em <a href="#configuracoes">Empresa e acesso</a>. Lá você também convida sócios e o contador.</div>
        <div><b>2. Extrato do mês</b>Anexe o PDF e importe o arquivo OFX do banco em <a href="#extratos">Extratos</a>. Os lançamentos entram já classificados.</div>
        <div><b>3. Guias e pró-labore</b>Lance o DAS em <a href="#impostos">Impostos</a> e calcule o pró-labore com INSS e IRRF em <a href="#pro-labore">Pró-labore</a>.</div>
      </div></div>` : ""}
      <div class="tiles">
        <div class="tile in"><small>Entradas recebidas</small><span class="big">${money(ent)}</span><span class="foot">${aReceber ? `${money(aReceber)} ainda a receber` : "no mês"}</span></div>
        <div class="tile out"><small>Saídas pagas</small><span class="big">${money(sai)}</span><span class="foot">no mês</span></div>
        <div class="tile res"><small>Resultado de caixa</small><span class="big ${ent - sai < 0 ? "neg" : ""}">${money(ent - sai)}</span><span class="foot">${ent ? `margem de ${Math.round((ent - sai) / ent * 100)}%` : "entradas menos saídas"}</span></div>
        <div class="tile due"><small>Contas em aberto</small><span class="big">${money(pendVal)}</span><span class="foot">${venc ? `<b class="neg">${venc} vencida${venc > 1 ? "s" : ""}</b>` : `${pend.length} pendente${pend.length === 1 ? "" : "s"} até este mês`}</span></div>
      </div>
      <div class="grid2">
        <div class="card chart"><h2>Entradas e saídas nos últimos 12 meses</h2>
          <div class="legend"><span><i style="background:var(--good)"></i>Entradas</span><span><i style="background:var(--bad)"></i>Saídas</span></div>${chartSVG(serie)}</div>
        <div class="card"><h2>Próximos vencimentos</h2>
          ${prox.length ? `<div class="list">${prox.map(l => `<div class="li"><div class="t"><b>${esc(l.descricao)}</b><span>${fmtData(l.vencimento)} · ${esc(l.categoria)}</span></div><div class="row"><span class="num">${money(l.valor)}</span>${pill(statusOf(l))}<button class="btn sm needs-edit" data-act="lanc-pay" data-id="${esc(l.id)}">Marcar pago</button></div></div>`).join("")}</div>` : `<div class="empty">Nenhuma conta pendente com vencimento.</div>`}</div>
      </div>
      <div class="grid2">
        <div class="card"><h2>Para onde foi o dinheiro em ${esc(labelMes(m))}</h2>
          ${cats.length ? `<div class="bars">${cats.map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><span class="num">${money(v)}</span><div class="track"><i style="width:${Math.max(2, v / maxCat * 100)}%"></i></div></div>`).join("")}</div>` : `<div class="empty">Sem saídas pagas neste mês.</div>`}</div>
        <div class="card"><h2>Extrato de ${esc(labelMes(m))}</h2>
          ${exts.length ? `<div class="list">${exts.map(e => `<div class="li"><div class="t"><b>${esc(e.banco)}</b><span>${e.arquivos.length} arquivo(s)${e.saldo_final != null ? ` · saldo final ${money(e.saldo_final)}` : ""}</span></div>${e.conciliado ? `<span class="pill pago">Conciliado</span>` : `<span class="pill pendente">A conciliar</span>`}</div>`).join("")}</div>`
          : `<div class="empty">${m < hojeMes() ? "O extrato deste mês ainda não foi anexado." : "Nenhum extrato anexado para este mês."}</div>`}
          <div class="row" style="margin-top:10px"><a class="btn" href="#extratos" data-act="go-ext">${nArq ? "Abrir extratos" : "Anexar extrato"}</a></div></div>
      </div>`;
  }
};
function chartSVG(serie){
  const W = 640, H = 230, L = 52, B = 26, T = 10, R = 8;
  const max = Math.max(...serie.map(s => Math.max(s.e, s.s)), 0);
  const nice = v => { if (v <= 0) return 1000; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };
  const top = nice(max), ih = H - B - T, iw = W - L - R, gw = iw / serie.length, bw = Math.min(16, gw * 0.32);
  const y = v => T + ih - (v / top) * ih;
  let g = "";
  for (let i = 0; i <= 4; i++){ const v = top * i / 4; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)">${compact(v)}</text>`; }
  serie.forEach((s, i) => {
    const cx = L + gw * i + gw / 2, last = i === serie.length - 1;
    g += `<rect x="${cx - bw - 1}" y="${y(s.e)}" width="${bw}" height="${Math.max(0, T + ih - y(s.e))}" rx="2" fill="var(--good)" opacity="${last ? 1 : .75}"><title>${labelMes(s.m)}: entradas ${money(s.e)}</title></rect>`;
    g += `<rect x="${cx + 1}" y="${y(s.s)}" width="${bw}" height="${Math.max(0, T + ih - y(s.s))}" rx="2" fill="var(--bad)" opacity="${last ? 1 : .75}"><title>${labelMes(s.m)}: saídas ${money(s.s)}</title></rect>`;
    g += `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="var(--muted)" font-weight="${last ? 700 : 400}">${MES[+s.m.slice(5) - 1]}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de entradas e saídas por mês">${g}</svg>`;
}

/* Lançamentos */
function filtrarLanc(){
  const f = S.filtro, q = f.q.trim().toLowerCase();
  return S.lanc.filter(l => {
    const mc = mesCaixa(l);
    if (f.ano ? mc.slice(0, 4) !== S.mes.slice(0, 4) : mc !== S.mes) return false;
    if (f.grupo && l.grupo !== f.grupo) return false;
    if (f.status && statusOf(l) !== f.status) return false;
    if (q && !(`${l.descricao} ${l.categoria} ${l.obs || ""}`.toLowerCase().includes(q))) return false;
    return true;
  }).sort((a, b) => (b.data_pagamento || b.vencimento || b.competencia).localeCompare(a.data_pagamento || a.vencimento || a.competencia));
}
V["lancamentos"] = {
  mount(el){
    el.innerHTML = `<div class="view">
      <div class="head"><div><h1>Lançamentos</h1><p>Receitas, despesas, guias e retiradas. Clique numa linha para ver ou editar.</p></div>
        <div class="row"><button class="btn" data-act="csv">Baixar CSV</button><button class="btn pri needs-edit" data-act="lanc-new">Novo lançamento</button></div></div>
      <div class="row" id="lTool"></div>
      <div class="card" style="padding:6px 8px"><div class="tbl-wrap" id="lTbl"></div></div></div>`;
  },
  update(){
    const f = S.filtro;
    if (!$("#lq")){
      $("#lTool").innerHTML = `<span id="lMp"></span>
        <label class="check"><input type="checkbox" id="lAno" ${f.ano ? "checked" : ""}> Ano inteiro</label>
        <select id="lG" aria-label="Grupo"><option value="">Todos os grupos</option>${Object.entries(GRUPOS).map(([k, g]) => `<option value="${k}" ${f.grupo === k ? "selected" : ""}>${g.label}</option>`).join("")}</select>
        <select id="lS" aria-label="Situação"><option value="">Todas as situações</option><option value="pago">Pago</option><option value="pendente">Pendente</option><option value="atrasado">Vencido</option></select>
        <input type="search" id="lq" placeholder="Buscar descrição ou categoria" value="${esc(f.q)}" aria-label="Buscar">`;
      $("#lS").value = f.status;
      $("#lAno").onchange = e => { f.ano = e.target.checked; V.lancamentos.update(); };
      $("#lG").onchange = e => { f.grupo = e.target.value; V.lancamentos.update(); };
      $("#lS").onchange = e => { f.status = e.target.value; V.lancamentos.update(); };
      $("#lq").oninput = e => { f.q = e.target.value; V.lancamentos.update(); };
    }
    $("#lMp").innerHTML = f.ano ? `<div class="mpick"><button data-act="mes" data-d="-12" aria-label="Ano anterior">‹</button><span>${S.mes.slice(0, 4)}</span><button data-act="mes" data-d="12" aria-label="Próximo ano">›</button></div>` : mpick("mes");
    const rows = filtrarLanc();
    const ent = rows.filter(l => l.tipo === "entrada").reduce((a, l) => a + l.valor, 0);
    const sai = rows.filter(l => l.tipo === "saida").reduce((a, l) => a + l.valor, 0);
    $("#lTbl").innerHTML = rows.length ? `<table><thead><tr><th>Data</th><th>Descrição</th><th>Grupo</th><th>Comp.</th><th>Situação</th><th class="v">Valor</th><th class="needs-edit"></th></tr></thead><tbody>
      ${rows.map(l => { const st = statusOf(l); return `<tr data-act="lanc-edit" data-id="${esc(l.id)}" style="cursor:pointer">
        <td class="num">${fmtData(l.status === "pago" ? l.data_pagamento : l.vencimento)}</td>
        <td><b>${esc(l.descricao)}</b><span class="cat">${esc(l.categoria)}${l.socio_id ? " · " + esc(socioNome(l.socio_id)) : ""}${l.origem === "extrato" ? " · importado do extrato" : ""}</span></td>
        <td><span class="chip">${GRUPOS[l.grupo] ? GRUPOS[l.grupo].label : esc(l.grupo)}</span></td>
        <td class="num">${esc(labelMes(l.competencia))}</td>
        <td>${pill(st)}</td>
        <td class="v ${l.tipo === "entrada" ? "pos" : "neg"}">${l.tipo === "entrada" ? "+" : "−"} ${money(l.valor)}</td>
        <td class="v needs-edit">${st !== "pago" ? `<button class="btn sm" data-act="lanc-pay" data-id="${esc(l.id)}">Marcar pago</button>` : `<button class="btn sm" data-act="lanc-unpay" data-id="${esc(l.id)}">Reabrir</button>`}</td></tr>`; }).join("")}
      </tbody><tfoot><tr><td colspan="5">${rows.length} lançamento(s) · entradas <span class="pos">${money(ent)}</span> · saídas <span class="neg">${money(sai)}</span></td><td class="v ${ent - sai < 0 ? "neg" : "pos"}">${money(ent - sai)}</td><td class="needs-edit"></td></tr></tfoot></table>`
      : `<div class="empty">Nenhum lançamento ${f.ano ? "neste ano" : "neste mês"} com esses filtros.</div>`;
  }
};

/* Impostos */
V["impostos"] = {
  mount(el){ el.innerHTML = `<div class="view" id="vi"></div>`; },
  update(){
    const ano = String(S.ano);
    const imp = S.lanc.filter(l => l.grupo === "imposto");
    const cel = (cat, mm) => imp.filter(l => l.categoria === cat && l.competencia === mm);
    const meses = Array.from({length:12}, (_, i) => `${ano}-${pad(i + 1)}`);
    const linhas = CATS.imposto.filter(c => c !== "CPP patronal (Anexo IV)" || S.cfg.anexoIV || imp.some(l => l.categoria === c));
    const pend = imp.filter(l => l.status !== "pago").sort((a, b) => (a.vencimento || "").localeCompare(b.vencimento || ""));
    const totAno = imp.filter(l => l.competencia.startsWith(ano)).reduce((a, l) => a + l.valor, 0);
    $("#vi").innerHTML = `
      <div class="head"><div><h1>Impostos e guias</h1><p>Mapa anual por competência. Clique numa célula para lançar ou abrir a guia daquele mês. Vencimento sugerido: dia 20 do mês seguinte (confira se cai em dia útil).</p></div>
        <div class="row">${mpick("ano")}<button class="btn needs-edit" data-act="imp-new" data-cat="Outros tributos">Outro tributo</button><button class="btn pri needs-edit" data-act="imp-new" data-cat="DAS - Simples Nacional">Lançar DAS</button></div></div>
      <div class="card" style="padding:8px"><div class="tbl-wrap"><table class="matrix"><thead><tr><th class="rowh">Tributo</th>${meses.map(m => `<th class="v">${MES[+m.slice(5) - 1]}</th>`).join("")}<th class="v">Total</th></tr></thead><tbody>
        ${linhas.map(cat => { let tot = 0; return `<tr><td class="rowh">${esc(cat)}</td>${meses.map(mm => { const x = cel(cat, mm); const v = x.reduce((a, l) => a + l.valor, 0); tot += v; const st = !x.length ? "vazio" : x.some(atrasado) ? "atrasado" : x.some(l => l.status !== "pago") ? "pendente" : "pago"; return `<td class="cell ${st}" data-act="imp-cell" data-cat="${esc(cat)}" data-m="${mm}" title="${esc(cat)} · ${labelMes(mm)}${x.length ? " · " + STATUS_LBL[st] : ""}">${x.length ? compact(v) : "·"}</td>`; }).join("")}<td class="v num"><b>${tot ? money(tot) : "—"}</b></td></tr>`; }).join("")}
      </tbody><tfoot><tr><td class="rowh">Total do mês</td>${meses.map(mm => { const v = imp.filter(l => l.competencia === mm).reduce((a, l) => a + l.valor, 0); return `<td class="v num">${v ? compact(v) : "—"}</td>`; }).join("")}<td class="v num">${money(totAno)}</td></tr></tfoot></table></div></div>
      <div class="row" style="font-size:.8rem;color:var(--muted);gap:16px"><span class="pos">● pago</span><span style="color:var(--warn)">● pendente</span><span class="neg">● vencido</span><span>valores em reais, abreviados</span></div>
      <div class="card"><h2>Guias em aberto</h2>
        ${pend.length ? `<div class="list">${pend.map(l => `<div class="li"><div class="t"><b>${esc(l.categoria)} · ${esc(labelMes(l.competencia))}</b><span>${l.vencimento ? "vence em " + fmtData(l.vencimento) : "sem vencimento"}${l.obs ? " · " + esc(l.obs) : ""}</span></div><div class="row"><span class="num">${money(l.valor)}</span>${pill(statusOf(l))}<button class="btn sm needs-edit" data-act="lanc-pay" data-id="${esc(l.id)}">Marcar pago</button><button class="btn sm" data-act="lanc-edit" data-id="${esc(l.id)}">Abrir</button></div></div>`).join("")}</div>` : `<div class="empty">Nenhuma guia em aberto.</div>`}
      </div>`;
  }
};

/* Pró-labore */
V["pro-labore"] = {
  mount(el){
    el.innerHTML = `<div class="view">
      <div class="head"><div><h1>Pró-labore</h1><p>Cálculo com os parâmetros de 2026: INSS de 11% limitado ao teto e IRRF pela tabela progressiva com a redução da Lei 15.270/2025. Ajuste os parâmetros em Empresa e acesso quando mudarem.</p></div></div>
      <div class="grid2">
        <div class="card"><h2>Registrar pró-labore</h2>
          <form id="fPl" class="form" novalidate>
            <label class="f">Sócio<select id="pSocio"></select></label>
            <label class="f">Competência<input type="month" id="pComp" value="${S.mes}"></label>
            <label class="f">Valor bruto (R$)<input type="text" id="pBruto" inputmode="decimal" placeholder="${esc(numBR(S.cfg.salarioMinimo))}"></label>
            <label class="f">Dependentes para IR<input type="number" id="pDep" min="0" step="1" value="0"></label>
            <label class="f">Data do pagamento<input type="date" id="pData" value=""></label>
            <label class="f">Situação<select id="pStatus"><option value="pendente">A pagar</option><option value="pago">Pago</option></select></label>
            <div class="full calc" id="pCalc"></div>
            <label class="check full needs-edit"><input type="checkbox" id="pGuias" checked> Lançar as guias de INSS e IRRF em Impostos (vencimento dia 20 do mês seguinte)</label>
            <div class="full row needs-edit" style="justify-content:flex-end"><button type="submit" class="btn pri" id="pSave">Registrar pró-labore</button></div>
          </form></div>
        <div class="card"><h2 id="pResTit"></h2><div id="pRes"></div></div>
      </div>
      <div class="card" style="padding:6px 8px"><div class="tbl-wrap" id="pHist"></div></div></div>`;
    const recalc = () => {
      const c = calcProlabore(parseBR($("#pBruto").value), $("#pDep").value, S.cfg);
      $("#pCalc").innerHTML = `<span>Pró-labore bruto</span><span class="num">${money(c.bruto)}</span>
        <span>INSS retido (${(S.cfg.inssAliq * 100).toLocaleString("pt-BR")}%${c.bruto > S.cfg.tetoInss ? ", no teto" : ""})</span><span class="num neg">− ${money(c.inss)}</span>
        <span>Base do IR (${c.usaSimpl ? "desconto simplificado" : "deduções legais"})</span><span class="num">${money(c.base)}</span>
        <span>IR pela tabela (${(c.aliq * 100).toLocaleString("pt-BR")}%)</span><span class="num">${money(c.irTabela)}</span>
        <span>Redução Lei 15.270/2025</span><span class="num">− ${money(c.reducao)}</span>
        <span>IRRF retido</span><span class="num neg">− ${money(c.irrf)}</span>
        ${S.cfg.anexoIV ? `<span>CPP patronal (custo da empresa, fora do DAS)</span><span class="num">${money(c.cpp)}</span>` : ""}
        <span class="tot">Líquido ao sócio</span><span class="tot num">${money(c.liquido)}</span>
        ${c.bruto && c.bruto < S.cfg.salarioMinimo ? `<span class="neg" style="grid-column:1/-1;font-size:.82rem">Abaixo do salário mínimo (${money(S.cfg.salarioMinimo)}), que é o piso do salário de contribuição.</span>` : ""}`;
    };
    ["pBruto", "pDep"].forEach(i => $("#" + i).addEventListener("input", recalc));
    $("#pStatus").addEventListener("change", () => { if ($("#pStatus").value === "pago" && !$("#pData").value) $("#pData").value = hoje(); });
    recalc();
    $("#fPl").addEventListener("submit", async e => {
      e.preventDefault();
      const sid = $("#pSocio").value, comp = $("#pComp").value;
      const c = calcProlabore(parseBR($("#pBruto").value), $("#pDep").value, S.cfg);
      if (!sid){ toast("Cadastre os sócios em Empresa e acesso e escolha um."); return; }
      if (!comp){ toast("Informe a competência."); return; }
      if (!c.bruto){ toast("Informe o valor bruto."); $("#pBruto").focus(); return; }
      const btn = $("#pSave"); btn.disabled = true; btn.textContent = "Registrando…";
      const nome = socioNome(sid), st = $("#pStatus").value, dt = $("#pData").value;
      const main = await W(() => S.sb.from("lancamentos").insert({
        empresa_id:S.eid, tipo:"saida", grupo:"prolabore", categoria:"Pró-labore", descricao:`Pró-labore ${nome} · ${labelMes(comp)}`,
        valor:c.liquido, competencia:comp, socio_id:sid, vencimento:dt || null, status:st, data_pagamento:st === "pago" ? (dt || hoje()) : null,
        detalhes:{bruto:c.bruto, inss:c.inss, irrf:c.irrf, liquido:c.liquido, cpp:c.cpp, dependentes:c.dependentes, reducaoLei15270:c.reducao}
      }).select().single());
      if (main){
        upsertLocal(S.lanc, normLanc(main));
        if ($("#pGuias").checked){
          const venc = addMes(comp, 1) + "-20";
          const guias = [["INSS retido (pró-labore)", c.inss], ["IRRF (pró-labore)", c.irrf]];
          if (S.cfg.anexoIV) guias.push(["CPP patronal (Anexo IV)", c.cpp]);
          const rows = guias.filter(g => g[1] > 0).map(([cat, v]) => ({empresa_id:S.eid, tipo:"saida", grupo:"imposto", categoria:cat, descricao:`${cat} · ${nome} · ${labelMes(comp)}`, valor:v, competencia:comp, socio_id:sid, vencimento:venc, status:"pendente", ref_prolabore:main.id}));
          if (rows.length){ const g = await W(() => S.sb.from("lancamentos").insert(rows).select()); if (g) g.forEach(x => upsertLocal(S.lanc, normLanc(x))); }
        }
        toast("Pró-labore registrado."); $("#pBruto").value = ""; recalc(); render();
      }
      btn.disabled = false; btn.textContent = "Registrar pró-labore";
    });
  },
  update(){
    const sel = $("#pSocio"), cur = sel.value;
    sel.innerHTML = S.cfg.socios.length ? S.cfg.socios.map(s => `<option value="${esc(s.id)}">${esc(s.nome)}</option>`).join("") : `<option value="">Cadastre os sócios em Empresa e acesso</option>`;
    if (cur && S.cfg.socios.some(s => s.id === cur)) sel.value = cur;
    $("#pBruto").dispatchEvent(new Event("input"));
    const ano = String(S.ano);
    const pl = S.lanc.filter(l => l.grupo === "prolabore").sort((a, b) => b.competencia.localeCompare(a.competencia));
    const doAno = pl.filter(l => l.competencia.startsWith(ano));
    $("#pResTit").innerHTML = `Totais por sócio em ${ano} <span style="float:right">${mpick("ano")}</span>`;
    $("#pRes").innerHTML = S.cfg.socios.length ? `<table><thead><tr><th>Sócio</th><th class="v">Bruto</th><th class="v">INSS</th><th class="v">IRRF</th><th class="v">Líquido</th></tr></thead><tbody>
      ${S.cfg.socios.map(s => { const x = doAno.filter(l => l.socio_id === s.id); const t = k => x.reduce((a, l) => a + Number((l.detalhes || {})[k] || 0), 0); return `<tr><td>${esc(s.nome)}<span class="cat">${x.length} mês(es)</span></td><td class="v">${money(t("bruto"))}</td><td class="v">${money(t("inss"))}</td><td class="v">${money(t("irrf"))}</td><td class="v"><b>${money(t("liquido"))}</b></td></tr>`; }).join("")}
      </tbody></table><p class="hint" style="margin-top:10px">Esses totais servem de base para o informe de rendimentos de cada sócio.</p>` : `<div class="empty">Nenhum sócio cadastrado.</div>`;
    $("#pHist").innerHTML = pl.length ? `<table><thead><tr><th>Competência</th><th>Sócio</th><th class="v">Bruto</th><th class="v">INSS</th><th class="v">IRRF</th><th class="v">Líquido</th><th>Situação</th><th></th></tr></thead><tbody>
      ${pl.map(l => { const d = l.detalhes || {}; return `<tr><td class="num">${esc(labelMes(l.competencia))}</td><td>${esc(socioNome(l.socio_id) || "—")}</td><td class="v">${money(d.bruto)}</td><td class="v">${money(d.inss)}</td><td class="v">${money(d.irrf)}</td><td class="v"><b>${money(l.valor)}</b></td><td>${pill(statusOf(l))}</td><td class="v"><button class="btn sm" data-act="lanc-edit" data-id="${esc(l.id)}">Abrir</button></td></tr>`; }).join("")}
      </tbody></table>` : `<div class="empty">Nenhum pró-labore registrado ainda.</div>`;
  }
};

/* Extratos */
function extStatus(mm){
  const ex = S.ext.filter(e => e.mes === mm);
  if (!ex.length) return mm < hojeMes() ? "falta" : "vazio";
  return ex.every(e => e.conciliado) ? "ok" : "anexo";
}
const EXT_LBL = {falta:"Sem extrato", vazio:"Aguardando", ok:"Conciliado", anexo:"A conciliar"};
V["extratos"] = {
  mount(el){ el.innerHTML = `<div class="view" id="ve"></div>`; },
  update(){
    const ano = String(S.ano), meses = Array.from({length:12}, (_, i) => `${ano}-${pad(i + 1)}`);
    if (!S.extSel.startsWith(ano)) S.extSel = ano === hojeMes().slice(0, 4) ? hojeMes() : meses[0];
    const mm = S.extSel, ex = S.ext.filter(e => e.mes === mm);
    const varExt = ex.reduce((a, e) => a + ((e.saldo_final ?? 0) - (e.saldo_inicial ?? 0)), 0);
    const temSaldos = ex.length && ex.every(e => e.saldo_final != null && e.saldo_inicial != null);
    const mov = S.lanc.filter(l => l.status === "pago" && (l.data_pagamento || "").startsWith(mm)).reduce((a, l) => a + sinal(l) * l.valor, 0);
    const dif = r2(varExt - mov);
    const ed = canEdit();
    $("#ve").innerHTML = `
      <div class="head"><div><h1>Extratos bancários</h1><p>Um cartão por mês. Anexe o PDF do extrato para guardar e o arquivo OFX ou CSV para importar os lançamentos automaticamente.</p></div><div class="row">${mpick("ano")}</div></div>
      <div class="months">${meses.map(m => { const st = extStatus(m); const n = S.ext.filter(e => e.mes === m).reduce((a, e) => a + e.arquivos.length, 0); return `<button class="mcard ${st}" data-act="ext-mes" data-m="${m}" aria-pressed="${m === mm}"><b>${MESF[+m.slice(5) - 1]}</b><span>${EXT_LBL[st]}${n ? ` · ${n} arq.` : ""}</span></button>`; }).join("")}</div>
      <div class="card">
        <div class="head" style="margin-bottom:12px"><h2>${esc(labelMesF(mm))}</h2>
          <form class="row needs-edit" id="fConta"><input type="text" id="novaConta" placeholder="Banco ou conta (ex.: Inter PJ)" value="${ex.length ? "" : esc(S.cfg.banco || "")}" aria-label="Banco ou conta"><button class="btn pri" type="submit">Adicionar conta</button></form></div>
        ${ex.length ? ex.map(e => `
          <div class="card" style="margin-bottom:12px;background:var(--bg)">
            <div class="head"><h3>${esc(e.banco)}</h3><div class="row"><label class="check"><input type="checkbox" data-chg="ext-conc" data-id="${esc(e.id)}" ${e.conciliado ? "checked" : ""} ${ed ? "" : "disabled"}> Conciliado</label><button class="btn sm danger needs-edit" data-act="ext-del" data-id="${esc(e.id)}">Remover conta</button></div></div>
            <div class="files">${e.arquivos.map((a, i) => `<div class="file"><button class="link" data-act="ext-open" data-id="${esc(e.id)}" data-i="${i}">${esc(a.nome)}</button><div class="row"><span class="chip">${Math.max(1, Math.round((a.tamanho || 0) / 1024))} KB</span>${/\.(ofx|csv|txt)$/i.test(a.nome) && ed ? `<button class="btn sm" data-act="ext-reimp" data-id="${esc(e.id)}" data-i="${i}">Importar</button>` : ""}<button class="btn sm danger needs-edit" data-act="ext-rmfile" data-id="${esc(e.id)}" data-i="${i}">Remover</button></div></div>`).join("") || `<span class="hint">Nenhum arquivo anexado.</span>`}</div>
            <div class="drop needs-edit"><span>PDF, imagem, OFX ou CSV · até 20 MB</span><input type="file" multiple accept=".pdf,.ofx,.csv,.txt,image/*" data-chg="ext-upload" data-id="${esc(e.id)}" aria-label="Anexar arquivo do extrato"></div>
            <div class="row" style="margin-top:12px">
              <label class="f">Saldo inicial<input type="text" inputmode="decimal" data-chg="ext-saldo" data-k="saldo_inicial" data-id="${esc(e.id)}" value="${e.saldo_inicial != null ? esc(numBR(e.saldo_inicial)) : ""}" placeholder="0,00" ${ed ? "" : "disabled"}></label>
              <label class="f">Saldo final<input type="text" inputmode="decimal" data-chg="ext-saldo" data-k="saldo_final" data-id="${esc(e.id)}" value="${e.saldo_final != null ? esc(numBR(e.saldo_final)) : ""}" placeholder="0,00" ${ed ? "" : "disabled"}></label>
            </div>
          </div>`).join("") : `<div class="empty">Nenhuma conta neste mês.${ed ? " Adicione o banco para anexar o extrato." : ""}</div>`}
        ${ex.length ? `<div class="calc" style="margin-top:4px">
          <span>Variação dos saldos no extrato</span><span class="num">${temSaldos ? money(varExt) : "informe os saldos"}</span>
          <span>Movimento lançado e pago no mês</span><span class="num">${money(mov)}</span>
          <span class="tot">Diferença</span><span class="tot num ${temSaldos && Math.abs(dif) >= 0.01 ? "neg" : "pos"}">${temSaldos ? (Math.abs(dif) < 0.01 ? "Conferido" : money(dif)) : "—"}</span></div>
          <p class="hint" style="margin-top:8px">Diferença zero indica que tudo o que passou pelo banco foi lançado. Se houver diferença, procure lançamentos faltando ou com data de pagamento errada.</p>` : ""}
      </div>`;
    const fc = $("#fConta");
    if (fc) fc.addEventListener("submit", async e => {
      e.preventDefault();
      const nome = $("#novaConta").value.trim();
      if (!nome){ toast("Digite o nome do banco ou conta."); return; }
      if (S.ext.some(x => x.mes === mm && x.banco.toLowerCase() === nome.toLowerCase())){ toast("Essa conta já está neste mês."); return; }
      const d = await W(() => S.sb.from("extratos").insert({empresa_id:S.eid, mes:mm, banco:nome}).select().single(), "Conta adicionada.");
      if (d){ upsertLocal(S.ext, normExt(d)); render(); }
    });
  }
};

/* Importação OFX/CSV */
async function readText(blob){
  const buf = await blob.arrayBuffer();
  let t = new TextDecoder("utf-8").decode(buf);
  if (t.includes(String.fromCharCode(0xFFFD))) t = new TextDecoder("windows-1252").decode(buf);
  return t;
}
function parseDateAny(s){
  s = String(s || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m){ const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  m = s.match(/^(\d{4})(\d{2})(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return "";
}
function parseOFX(text){
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const rows = blocks.map(b => {
    b = b.split(/<\/STMTTRN>/i)[0];
    const g = t => { const m = b.match(new RegExp("<" + t + ">\\s*([^<\\r\\n]+)", "i")); return m ? m[1].trim() : ""; };
    const amt = g("TRNAMT");
    const valor = amt.includes(",") ? parseBR(amt) : parseFloat(amt);
    const partes = [g("NAME"), g("MEMO")].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    return {data:parseDateAny(g("DTPOSTED")), valor:r2(valor), descricao:partes.join(" · ") || g("TRNTYPE"), fitid:g("FITID")};
  }).filter(r => r.data && !isNaN(r.valor) && r.valor !== 0);
  const bal = text.match(/<LEDGERBAL>[\s\S]*?<BALAMT>\s*([^<\r\n]+)/i);
  return {rows, saldoFinal: bal ? (bal[1].includes(",") ? parseBR(bal[1]) : parseFloat(bal[1])) : null};
}
function splitCSV(line, d){ const out = []; let cur = "", q = false; for (let i = 0; i < line.length; i++){ const c = line[i]; if (c === '"'){ if (q && line[i + 1] === '"'){ cur += '"'; i++; } else q = !q; } else if (c === d && !q){ out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out.map(s => s.trim()); }
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const sample = lines.slice(0, 8).join("\n");
  const delim = [";", "\t", ","].map(d => [d, sample.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = lines.map(l => splitCSV(l, delim));
  const h = rows.findIndex((r, i) => i < 20 && r.some(c => /^data/i.test(c)) && r.length >= 3);
  const header = h >= 0 ? rows[h] : (rows[0] || []).map((_, i) => `Coluna ${i + 1}`);
  const body = rows.slice(h >= 0 ? h + 1 : 0).filter(r => r.length >= 2);
  const find = re => header.findIndex(c => re.test(c));
  const map = {data:find(/^data/i), desc:find(/descri|hist[oó]rico|lan[çc]amento|memo|detalhe|estabelec/i), valor:find(/^valor|montante|quantia/i), cred:find(/cr[eé]dito|entrada/i), deb:find(/d[eé]bito|sa[ií]da/i)};
  if (map.data < 0) map.data = (body[0] || []).findIndex(c => parseDateAny(c));
  if (map.valor < 0 && map.cred < 0){ const r0 = body[0] || []; map.valor = r0.findIndex((c, i) => i !== map.data && /^-?[\d.,]+-?$/.test(c.replace(/R\$|\s/g, "")) && /\d/.test(c)); }
  if (map.desc < 0){ const r0 = body[0] || []; let best = -1, len = 0; r0.forEach((c, i) => { if (i !== map.data && i !== map.valor && c.length > len){ len = c.length; best = i; } }); map.desc = best; }
  return {header, body, map};
}
function rowsFromCSV(csv){
  const {body, map} = csv, seen = {};
  return body.map(r => {
    const valor = map.valor >= 0 ? parseBR(r[map.valor]) : Math.abs(parseBR(r[map.cred] || "")) - Math.abs(parseBR(r[map.deb] || ""));
    return {data:parseDateAny(r[map.data]), descricao:(r[map.desc] || "").trim(), valor:r2(valor)};
  }).filter(r => r.data && r.valor && !/^saldo/i.test(r.descricao)).map(r => {
    const k = `${r.data}|${r.valor}|${r.descricao}`; seen[k] = (seen[k] || 0) + 1;
    return Object.assign(r, {fitid:"csv:" + k.slice(0, 180) + "#" + seen[k]});
  });
}
function prepRows(rows, extId){
  return rows.map(r => {
    const sg = sugerir(r.descricao, r.valor);
    const dup = S.lanc.some(l => (r.fitid && l.fitid === r.fitid && l.extrato_id === extId) || (l.data_pagamento === r.data && Math.abs(l.valor - Math.abs(r.valor)) < 0.005 && (l.descricao || "").toLowerCase() === r.descricao.toLowerCase()));
    return Object.assign({}, r, sg, {sel:!dup, dup});
  });
}
function startImport(text, nome, extId){
  if (/<OFX>|OFXHEADER|<STMTTRN>/i.test(text)){
    const p = parseOFX(text);
    if (!p.rows.length){ toast(`Nenhuma transação encontrada em ${nome}.`); return; }
    S.imp = {extId, nome, kind:"ofx", rows:prepRows(p.rows, extId), saldoFinal:p.saldoFinal};
  } else {
    const csv = parseCSV(text);
    S.imp = {extId, nome, kind:"csv", csv, rows:prepRows(rowsFromCSV(csv), extId), saldoFinal:null};
  }
  renderImport();
}
function renderImport(){
  const I = S.imp; if (!I) return;
  const nSel = I.rows.filter(r => r.sel).length;
  const colSel = (k, lbl) => `<label class="f">${lbl}<select data-map="${k}"><option value="-1">—</option>${I.csv.header.map((h, i) => `<option value="${i}" ${I.csv.map[k] === i ? "selected" : ""}>${esc(h || "Coluna " + (i + 1))}</option>`).join("")}</select></label>`;
  openDlg(`
    <div class="head"><div><h2>Importar ${esc(I.nome)}</h2><p class="hint" style="margin-top:4px">${I.rows.length} transação(ões) lidas. Revise grupo e categoria antes de importar. Itens já lançados vêm desmarcados.</p></div></div>
    ${I.kind === "csv" ? `<div class="row">${colSel("data", "Coluna da data")}${colSel("desc", "Coluna da descrição")}${colSel("valor", "Coluna do valor")}${colSel("cred", "Ou crédito")}${colSel("deb", "e débito")}</div>` : ""}
    <div class="tbl-wrap" style="max-height:55vh;overflow:auto"><table><thead><tr><th><input type="checkbox" id="impAll" ${nSel === I.rows.length && nSel ? "checked" : ""} aria-label="Selecionar todas"></th><th>Data</th><th>Descrição</th><th class="v">Valor</th><th>Grupo</th><th>Categoria</th></tr></thead><tbody>
      ${I.rows.map((r, i) => `<tr><td><input type="checkbox" data-imp="sel" data-i="${i}" ${r.sel ? "checked" : ""} aria-label="Importar linha"></td><td class="num">${fmtData(r.data)}</td><td>${esc(r.descricao)}${r.dup ? ` <span class="pill neutro">já lançado</span>` : ""}</td><td class="v ${r.valor > 0 ? "pos" : "neg"}">${money(r.valor)}</td>
        <td><select data-imp="grupo" data-i="${i}" aria-label="Grupo">${Object.entries(GRUPOS).map(([k, g]) => `<option value="${k}" ${k === r.grupo ? "selected" : ""}>${g.label}</option>`).join("")}</select></td>
        <td><select data-imp="categoria" data-i="${i}" aria-label="Categoria">${catOptions(r.grupo, r.categoria)}</select></td></tr>`).join("") || `<tr><td colspan="6" class="empty">Ajuste as colunas acima para ler o arquivo.</td></tr>`}
    </tbody></table></div>
    <div class="actions"><span class="hint">${I.saldoFinal != null ? `Saldo final no arquivo: ${money(I.saldoFinal)}` : ""}</span>
      <div class="row"><button class="btn" data-act="dlg-close">Cancelar</button><button class="btn pri" id="impGo" ${nSel ? "" : "disabled"}>Importar ${nSel} lançamento(s)</button></div></div>`, true);
  const d = $("#dlg");
  d.querySelectorAll("[data-map]").forEach(s => s.addEventListener("change", () => { I.csv.map[s.dataset.map] = +s.value; I.rows = prepRows(rowsFromCSV(I.csv), I.extId); renderImport(); }));
  $("#impAll").addEventListener("change", e => { I.rows.forEach(r => r.sel = e.target.checked); renderImport(); });
  d.querySelectorAll("[data-imp]").forEach(c => c.addEventListener("change", () => {
    const r = I.rows[+c.dataset.i];
    if (c.dataset.imp === "sel"){ r.sel = c.checked; const n = I.rows.filter(x => x.sel).length; $("#impGo").textContent = `Importar ${n} lançamento(s)`; $("#impGo").disabled = !n; }
    if (c.dataset.imp === "grupo"){ r.grupo = c.value; r.categoria = CATS[c.value][0]; c.closest("tr").querySelector("[data-imp=categoria]").innerHTML = catOptions(r.grupo, r.categoria); }
    if (c.dataset.imp === "categoria") r.categoria = c.value;
  }));
  $("#impGo").addEventListener("click", doImport);
}
async function doImport(){
  const I = S.imp, btn = $("#impGo"), sel = I.rows.filter(r => r.sel);
  btn.disabled = true; btn.textContent = "Importando…";
  const rows = sel.map(r => {
    const tipo = r.valor > 0 ? "entrada" : "saida";
    return {empresa_id:S.eid, tipo, grupo:r.grupo, categoria:r.categoria, descricao:r.descricao || (tipo === "entrada" ? "Crédito" : "Débito"), valor:Math.abs(r.valor), competencia:r.data.slice(0, 7), vencimento:r.data, status:"pago", data_pagamento:r.data, origem:"extrato", fitid:r.fitid || null, extrato_id:I.extId || null};
  });
  let n = 0, erro = false;
  for (let i = 0; i < rows.length; i += 500){
    const d = await W(() => S.sb.from("lancamentos").upsert(rows.slice(i, i + 500), {onConflict:"empresa_id,extrato_id,fitid", ignoreDuplicates:true}).select());
    if (!d){ erro = true; break; }
    (Array.isArray(d) ? d : []).forEach(x => { upsertLocal(S.lanc, normLanc(x)); n++; });
  }
  const e = I.extId && S.ext.find(x => x.id === I.extId);
  if (e && I.saldoFinal != null && e.saldo_final == null){ const u = await W(() => S.sb.from("extratos").update({saldo_final:r2(I.saldoFinal)}).eq("id", e.id).select().single()); if (u) upsertLocal(S.ext, normExt(u)); }
  closeDlg(); render();
  toast(erro ? `${n} importado(s); a importação parou por um erro.` : `${n} lançamento(s) importado(s).`);
}

/* Open Finance */
V["open-finance"] = {
  mount(el){
    el.innerHTML = `<div class="view">
      <div class="head"><div><h1>Open Finance</h1><p>Situação da conexão automática com os bancos da empresa.</p></div><span class="pill pendente">Não conectado</span></div>
      <div class="notice">A conexão automática exige um agregador autorizado pelo Banco Central (como a Pluggy) e um pequeno serviço no servidor que guarde as chaves de acesso. Com o app já rodando no Supabase, dá para adicionar isso depois com uma função no próprio Supabase (Edge Function). Enquanto isso, a importação do arquivo do banco resolve.</div>
      <div class="prose">
        <div class="route"><span class="pill pago tag">Funciona agora</span><h3>Exportar o OFX do internet banking todo mês</h3><p>Quase todo banco PJ (Inter, Itaú, Bradesco, Santander, BB, Sicoob, Nubank PJ, C6) permite baixar o extrato em OFX, às vezes chamado de "Money" ou "arquivo para contabilidade". Em <a href="#extratos">Extratos</a>, anexe o OFX junto com o PDF: as transações entram classificadas, sem duplicar o que já foi lançado.</p></div>
        <div class="route"><span class="pill neutro tag">Próximo passo possível</span><h3>Pluggy via Edge Function do Supabase</h3><p>A Pluggy oferece o Meu Pluggy, gratuito para uso próprio, e planos pagos para oferecer a conexão aos seus clientes. A integração fica numa função do Supabase que busca as transações e grava em Lançamentos com as mesmas regras de privacidade.</p><p><a href="https://meu.pluggy.ai/" target="_blank" rel="noopener">meu.pluggy.ai</a> · <a href="https://docs.pluggy.ai/" target="_blank" rel="noopener">documentação</a></p></div>
      </div></div>`;
  },
  update(){}
};

/* Empresa e acesso */
const socioRow = s => `<div class="li" data-socio="${esc(s.id)}"><input type="text" value="${esc(s.nome)}" aria-label="Nome do sócio" style="flex:1" placeholder="Nome do sócio"><button type="button" class="btn sm danger" data-act="socio-rm">Remover</button></div>`;
V["configuracoes"] = {
  mount(el){ el.innerHTML = `<div class="view" id="vc"><div id="vcForm"></div><div id="vcAcesso" class="view"></div></div>`; },
  update(){
    if (!(S.cfgDirty && $("#fCfg"))){
      const c = S.cfg, dono = isDono(), dis = dono ? "" : "disabled";
      $("#vcForm").innerHTML = `
        <div class="head"><div><h1>Empresa e acesso</h1><p>${dono ? "Dados da empresa, sócios, parâmetros de cálculo e quem tem acesso." : "Somente o dono da empresa altera estes dados."} Os valores de INSS e IR são os de 2026.</p></div></div>
        <form id="fCfg" class="view" style="gap:16px;margin-top:16px">
          <div class="card"><h2>Empresa</h2><div class="form">
            <label class="f full">Nome<input type="text" id="cNome" value="${esc(c.nome)}" ${dis}></label>
            <label class="f">CNPJ<input type="text" id="cCnpj" value="${esc(c.cnpj)}" placeholder="00.000.000/0000-00" ${dis}></label>
            <label class="f">Banco principal<input type="text" id="cBanco" value="${esc(c.banco)}" placeholder="Ex.: Inter PJ" ${dis}></label>
            <label class="check full"><input type="checkbox" id="cAnexo" ${c.anexoIV ? "checked" : ""} ${dis}> Empresa tributada no Anexo IV do Simples (CPP patronal de 20% sobre o pró-labore paga fora do DAS)</label>
          </div></div>
          <div class="card"><h2>Sócios</h2><div id="cSocios" class="list">${c.socios.map(socioRow).join("") || `<span class="hint">Nenhum sócio cadastrado.</span>`}</div>
            ${dono ? `<div class="row" style="margin-top:10px"><button type="button" class="btn" data-act="socio-add">Adicionar sócio</button></div>` : ""}</div>
          <div class="card"><h2>Parâmetros de cálculo</h2><div class="form">
            <label class="f">Alíquota do INSS do sócio (%)<input type="text" inputmode="decimal" id="cInss" value="${esc(numBR(c.inssAliq * 100))}" ${dis}></label>
            <label class="f">Teto do INSS (R$)<input type="text" inputmode="decimal" id="cTeto" value="${esc(numBR(c.tetoInss))}" ${dis}></label>
            <label class="f">Salário mínimo (R$)<input type="text" inputmode="decimal" id="cMin" value="${esc(numBR(c.salarioMinimo))}" ${dis}></label>
            <label class="f">Desconto simplificado do IR (R$)<input type="text" inputmode="decimal" id="cSimp" value="${esc(numBR(c.descSimplificado))}" ${dis}></label>
            <label class="f">Dedução por dependente (R$)<input type="text" inputmode="decimal" id="cDep" value="${esc(numBR(c.deducaoDependente))}" ${dis}></label>
            <label class="f">CPP patronal Anexo IV (%)<input type="text" inputmode="decimal" id="cCpp" value="${esc(numBR(c.cppAliq * 100))}" ${dis}></label>
          </div></div>
          ${dono ? `<div class="row" style="justify-content:flex-end"><button type="submit" class="btn pri" id="cSave">Salvar</button></div>` : ""}
        </form>`;
      if (!dono) $$("#cSocios input, #cSocios button").forEach(x => { x.disabled = true; if (x.tagName === "BUTTON") x.remove(); });
      const f = $("#fCfg");
      f.addEventListener("input", () => S.cfgDirty = true);
      f.addEventListener("submit", async e => {
        e.preventDefault();
        const socios = $$("[data-socio]", f).map(r => ({id:r.dataset.socio, nome:r.querySelector("input").value.trim()})).filter(s => s.nome);
        const config = Object.assign({}, S.emp.config || {}, {socios, anexoIV:$("#cAnexo").checked,
          inssAliq:parseBR($("#cInss").value) / 100, tetoInss:parseBR($("#cTeto").value), salarioMinimo:parseBR($("#cMin").value),
          descSimplificado:parseBR($("#cSimp").value), deducaoDependente:parseBR($("#cDep").value), cppAliq:parseBR($("#cCpp").value) / 100});
        const row = {nome:$("#cNome").value.trim() || S.emp.nome, cnpj:$("#cCnpj").value.trim(), banco:$("#cBanco").value.trim(), config};
        const btn = $("#cSave"); btn.disabled = true;
        const d = await W(() => S.sb.from("empresas").update(row).eq("id", S.eid).select("id,nome,cnpj,banco,config").single(), "Dados da empresa salvos.");
        btn.disabled = false;
        if (d){ S.cfgDirty = false; aplicarEmpresa(d); const m = S.membros.find(x => x.empresa_id === S.eid); if (m) m.empresas = d; $("#empSel").querySelector(`option[value="${S.eid}"]`).textContent = d.nome; render(); }
      });
    }
    renderAcesso();
  }
};
async function renderAcesso(){
  const box = $("#vcAcesso"); if (!box) return;
  const eid = S.eid;
  const [mem, conv] = await Promise.all([
    S.sb.from("membros").select("user_id,papel,email,criado_em").eq("empresa_id", eid),
    isDono() ? S.sb.from("convites").select("*").eq("empresa_id", eid).is("usado_em", null).gt("expira_em", nowISO()).order("criado_em", {ascending:false}) : Promise.resolve({data:[]})
  ]);
  if (eid !== S.eid || !$("#vcAcesso")) return;
  const membros = mem.data || [], convites = conv.data || [], dono = isDono();
  const link = c => `${location.origin}${location.pathname}?convite=${c.codigo}`;
  box.innerHTML = `
    <div class="card"><h2>Quem tem acesso</h2>
      <p class="sub">Dono: tudo, inclusive convidar e excluir a empresa. Editor: lança e anexa extratos. Somente leitura: consulta, ideal para o contador.</p>
      <div class="list">${membros.map(m => `<div class="li"><div class="t"><b>${esc(m.email || "usuário")}</b><span>${m.user_id === S.user.id ? "você" : "desde " + fmtData((m.criado_em || "").slice(0, 10))}</span></div><div class="row">
        ${dono && m.user_id !== S.user.id ? `<select data-chg="papel" data-uid="${esc(m.user_id)}" aria-label="Papel">${Object.entries(PAPEL_LBL).map(([k, v]) => `<option value="${k}" ${k === m.papel ? "selected" : ""}>${v}</option>`).join("")}</select><button class="btn sm danger" data-act="membro-rm" data-uid="${esc(m.user_id)}">Remover</button>` : `<span class="chip">${PAPEL_LBL[m.papel]}</span>`}
      </div></div>`).join("")}</div></div>
    ${dono ? `<div class="card"><h2>Convidar pessoa</h2>
      <p class="sub">Gere um convite e envie o link para a pessoa. Ela cria a conta (ou entra) e já cai nesta empresa. Cada convite vale para uma pessoa, por 7 dias.</p>
      <div class="row"><select id="convPapel" aria-label="Papel do convidado"><option value="editor">Editor</option><option value="leitor">Somente leitura</option></select><button class="btn pri" data-act="conv-new">Gerar convite</button></div>
      ${convites.length ? `<div class="list" style="margin-top:10px">${convites.map(c => `<div class="li"><div class="t"><span class="code">${esc(c.codigo)}</span><span>${PAPEL_LBL[c.papel]} · vale até ${fmtData(c.expira_em.slice(0, 10))}</span></div><div class="row"><button class="btn sm" data-act="conv-copy" data-link="${esc(link(c))}">Copiar link</button><button class="btn sm danger" data-act="conv-rm" data-cod="${esc(c.codigo)}">Cancelar</button></div></div>`).join("")}</div>` : ""}
    </div>` : ""}
    <div class="card"><h2>${dono ? "Excluir empresa" : "Sair da empresa"}</h2>
      <p class="sub">${dono ? "Apaga a empresa, todos os lançamentos e extratos para todos os membros. Não dá para desfazer. Baixe o CSV antes." : "Você perde o acesso a esta empresa até receber um novo convite."}</p>
      <button class="btn danger" data-act="${dono ? "emp-del" : "emp-sair"}">${dono ? "Excluir empresa" : "Sair da empresa"}</button></div>`;
}

/* ---------- ações ---------- */
const ACT = {
  "dlg-close": () => closeDlg(),
  "sair": async () => { pararTempoReal(); await S.sb.auth.signOut(); S.user = null; S.eid = null; showScreen("auth"); setAuthMode("entrar"); },
  "lanc-new": () => openLanc(null),
  "lanc-edit": el => openLanc(el.dataset.id),
  "lanc-del": async el => { if (!armDanger(el, "Confirmar exclusão")) return; const id = el.dataset.id; if (await W(() => S.sb.from("lancamentos").delete().eq("id", id), "Lançamento excluído.")){ S.lanc = S.lanc.filter(l => l.id !== id); closeDlg(); render(); } },
  "lanc-pay": async el => { const l = S.lanc.find(x => x.id === el.dataset.id); if (!l) return; el.disabled = true; const d = await W(() => S.sb.from("lancamentos").update({status:"pago", data_pagamento:(l.vencimento && l.vencimento <= hoje()) ? l.vencimento : hoje(), atualizado_em:nowISO()}).eq("id", l.id).select().single(), "Marcado como pago."); if (d){ upsertLocal(S.lanc, normLanc(d)); render(); } else el.disabled = false; },
  "lanc-unpay": async el => { el.disabled = true; const d = await W(() => S.sb.from("lancamentos").update({status:"pendente", data_pagamento:null, atualizado_em:nowISO()}).eq("id", el.dataset.id).select().single(), "Lançamento reaberto."); if (d){ upsertLocal(S.lanc, normLanc(d)); render(); } else el.disabled = false; },
  "mes": el => { S.mes = addMes(S.mes, +el.dataset.d); S.ano = +S.mes.slice(0, 4); render(); },
  "ano": el => { S.ano += +el.dataset.d; render(); },
  "imp-new": el => { if (!canEdit()) return; openLanc(null, {grupo:"imposto", tipo:"saida", categoria:el.dataset.cat, competencia:addMes(hojeMes(), -1), vencimento:hojeMes() + "-20"}); },
  "imp-cell": el => { const x = S.lanc.filter(l => l.grupo === "imposto" && l.categoria === el.dataset.cat && l.competencia === el.dataset.m); if (x.length) openLanc(x[0].id); else if (canEdit()) openLanc(null, {grupo:"imposto", tipo:"saida", categoria:el.dataset.cat, competencia:el.dataset.m, vencimento:addMes(el.dataset.m, 1) + "-20"}); },
  "ext-mes": el => { S.extSel = el.dataset.m; V.extratos.update(); },
  "go-ext": () => { S.extSel = S.mes; S.ano = +S.mes.slice(0, 4); },
  "ext-del": async el => { const e = S.ext.find(x => x.id === el.dataset.id); if (!e) return; if (e.arquivos.length){ toast("Remova os arquivos antes de remover a conta."); return; } if (!armDanger(el)) return; if (await W(() => S.sb.from("extratos").delete().eq("id", e.id), "Conta removida.")){ S.ext = S.ext.filter(x => x.id !== e.id); render(); } },
  "ext-open": async el => {
    const e = S.ext.find(x => x.id === el.dataset.id), a = e && e.arquivos[+el.dataset.i]; if (!a) return;
    const w = window.open("", "_blank");
    const {data, error} = await S.sb.storage.from("extratos").createSignedUrl(a.path, 600);
    if (error || !data){ if (w) w.close(); toast(msgErro(error)); return; }
    if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
  },
  "ext-rmfile": async el => {
    const e = S.ext.find(x => x.id === el.dataset.id); if (!e) return; if (!armDanger(el)) return;
    const arr = e.arquivos.slice(); const [a] = arr.splice(+el.dataset.i, 1);
    const d = await W(() => S.sb.from("extratos").update({arquivos:arr}).eq("id", e.id).select().single(), "Arquivo removido.");
    if (d){ upsertLocal(S.ext, normExt(d)); render(); if (a) await S.sb.storage.from("extratos").remove([a.path]); }
  },
  "ext-reimp": async el => {
    const e = S.ext.find(x => x.id === el.dataset.id), a = e && e.arquivos[+el.dataset.i]; if (!a) return;
    const {data, error} = await S.sb.storage.from("extratos").download(a.path);
    if (error || !data){ toast(msgErro(error)); return; }
    startImport(await readText(data), a.nome, e.id);
  },
  "csv": () => {
    const rows = filtrarLanc();
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "﻿" + ["competencia;data_pagamento;tipo;grupo;categoria;descricao;socio;valor;situacao;vencimento"].concat(rows.map(l => [l.competencia, l.data_pagamento || "", l.tipo, (GRUPOS[l.grupo] || {}).label || l.grupo, l.categoria, l.descricao, socioNome(l.socio_id), numBR(l.valor), STATUS_LBL[statusOf(l)], l.vencimento || ""].map(q).join(";"))).join("\r\n");
    baixar(`lancamentos-${S.filtro.ano ? S.mes.slice(0, 4) : S.mes}.csv`, csv, "text/csv;charset=utf-8");
  },
  "socio-add": () => { const box = $("#cSocios"); if (box.querySelector(".hint")) box.innerHTML = ""; box.insertAdjacentHTML("beforeend", socioRow({id:"s" + Date.now().toString(36), nome:""})); S.cfgDirty = true; box.lastElementChild.querySelector("input").focus(); },
  "socio-rm": el => { el.closest("[data-socio]").remove(); S.cfgDirty = true; },
  "conv-new": async () => {
    const papel = $("#convPapel").value;
    const d = await W(() => S.sb.from("convites").insert({empresa_id:S.eid, papel}).select().single(), null, {semPermissao:true});
    if (d){ const link = `${location.origin}${location.pathname}?convite=${d.codigo}`; try { await navigator.clipboard.writeText(link); toast("Convite criado e link copiado. Envie para a pessoa."); } catch { toast("Convite criado. Use Copiar link."); } renderAcesso(); }
  },
  "conv-copy": async el => { try { await navigator.clipboard.writeText(el.dataset.link); toast("Link copiado."); } catch { openDlg(`<h2>Link do convite</h2><input type="text" readonly value="${esc(el.dataset.link)}" style="width:100%"><div class="actions"><span></span><button class="btn" data-act="dlg-close">Fechar</button></div>`); } },
  "conv-rm": async el => { if (await W(() => S.sb.from("convites").delete().eq("codigo", el.dataset.cod), "Convite cancelado.", {semPermissao:true})) renderAcesso(); },
  "membro-rm": async el => { if (!armDanger(el)) return; if (await W(() => S.sb.from("membros").delete().eq("empresa_id", S.eid).eq("user_id", el.dataset.uid), "Acesso removido.", {semPermissao:true})) renderAcesso(); },
  "emp-del": async el => {
    if (!armDanger(el, "Clique de novo para excluir tudo")) return;
    const paths = S.ext.flatMap(e => e.arquivos.map(a => a.path));
    if (paths.length) await S.sb.storage.from("extratos").remove(paths);
    if (await W(() => S.sb.from("empresas").delete().eq("id", S.eid), "Empresa excluída.", {semPermissao:true})){ pararTempoReal(); ls.set("empresaAtual", ""); S.eid = null; await carregarEmpresas(); }
  },
  "emp-sair": async el => {
    if (!armDanger(el)) return;
    if (await W(() => S.sb.from("membros").delete().eq("empresa_id", S.eid).eq("user_id", S.user.id), "Você saiu da empresa.", {semPermissao:true})){ pararTempoReal(); ls.set("empresaAtual", ""); S.eid = null; await carregarEmpresas(); }
  }
};
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  if (el.tagName !== "A") e.preventDefault();
  fn(el, e);
});
document.addEventListener("change", async e => {
  const el = e.target.closest("[data-chg]"); if (!el) return;
  const id = el.dataset.id, ex = S.ext.find(x => x.id === id);
  const salvaExt = async (campos, msg) => { const d = await W(() => S.sb.from("extratos").update(campos).eq("id", id).select().single(), msg); if (d){ upsertLocal(S.ext, normExt(d)); render(); } };
  if (el.dataset.chg === "papel"){ if (await W(() => S.sb.from("membros").update({papel:el.value}).eq("empresa_id", S.eid).eq("user_id", el.dataset.uid), "Papel alterado.", {semPermissao:true})) renderAcesso(); else renderAcesso(); return; }
  if (el.dataset.chg === "ext-conc") await salvaExt({conciliado:el.checked}, el.checked ? "Mês marcado como conciliado." : "Conciliação desmarcada.");
  if (el.dataset.chg === "ext-saldo") await salvaExt({[el.dataset.k]:el.value.trim() === "" ? null : r2(parseBR(el.value))});
  if (el.dataset.chg === "ext-upload" && ex){
    const files = Array.from(el.files || []); el.value = "";
    const arr = ex.arquivos.slice(); let mudou = false, paraImportar = null;
    for (const f of files){
      if (f.size > 20 * 1024 * 1024){ toast(`${f.name} passa de 20 MB.`); continue; }
      toast(`Enviando ${f.name}…`);
      const nomeSeguro = f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
      const path = `${S.eid}/${ex.id}/${Date.now()}-${nomeSeguro}`;
      const {error} = await S.sb.storage.from("extratos").upload(path, f, {contentType:f.type || "application/octet-stream", upsert:false});
      if (error) toast(`Não foi possível enviar ${f.name}: ${msgErro(error)}`);
      else { arr.push({path, nome:f.name, tamanho:f.size, tipo:f.type || "", enviado_em:nowISO()}); mudou = true; }
      if (/\.(ofx|csv|txt)$/i.test(f.name) && !paraImportar) paraImportar = f;
    }
    if (mudou) await salvaExt({arquivos:arr}, "Arquivo(s) anexado(s).");
    if (paraImportar) startImport(await readText(paraImportar), paraImportar.name, id);
  }
});

/* ---------- roteamento e render ---------- */
function route(){
  const h = (location.hash || "#painel").slice(1);
  S.view = V[h] ? h : "painel";
  $$("#navList a").forEach(a => a.setAttribute("aria-current", a.dataset.route === S.view ? "page" : "false"));
  if (S.eid) render(true);
}
function render(force){
  if (!S.eid || $("#app").hidden) return;
  const main = $("#main");
  if (force || S.mounted !== S.view){ V[S.view].mount(main); S.mounted = S.view; window.scrollTo(0, 0); }
  V[S.view].update();
  const imp = S.lanc.filter(l => l.grupo === "imposto" && l.status !== "pago");
  const venc = imp.filter(atrasado).length;
  const b = $("#bdgImp"); b.hidden = !imp.length; b.textContent = venc || imp.length; b.className = "badge" + (venc ? " bad" : "");
  const falta = [1, 2, 3].map(i => addMes(hojeMes(), -i)).filter(m => !S.ext.some(e => e.mes === m)).length;
  const be = $("#bdgExt"); be.hidden = !falta; be.textContent = falta; be.title = `${falta} mês(es) recentes sem extrato`;
}
window.addEventListener("hashchange", route);

/* ---------- início ---------- */
async function init(){
  document.title = APP_NAME;
  $$(".appName").forEach(x => x.textContent = APP_NAME);
  const params = new URLSearchParams(location.search);
  if (params.get("convite")){ sessionStorage.setItem("convite", params.get("convite")); params.delete("convite"); history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash); }
  if (!window.supabase || !CFG.SUPABASE_URL || /SEU-PROJETO/.test(CFG.SUPABASE_URL) || /COLE-AQUI/.test(CFG.SUPABASE_ANON_KEY || "")){
    $("#boot").innerHTML = `<div class="card" style="max-width:520px"><h2>Falta configurar o app</h2><p class="hint" style="margin-top:8px">Abra o arquivo <b>config.js</b> e cole a URL e a chave do seu projeto Supabase. O passo a passo está no README.</p></div>`;
    return;
  }
  S.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {auth:{flowType:"pkce", persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}});
  S.sb.auth.onAuthStateChange((ev, session) => {
    if (ev === "PASSWORD_RECOVERY"){ S.recovery = true; showScreen("auth"); setAuthMode("nova"); return; }
    if (ev === "SIGNED_OUT"){ S.user = null; S.eid = null; pararTempoReal(); showScreen("auth"); setAuthMode("entrar"); return; }
    if (ev === "SIGNED_IN" || ev === "INITIAL_SESSION") setTimeout(() => entrou(session), 0);
  });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
}
init();
