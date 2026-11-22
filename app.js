'use strict';
/* =========================================================================
   Meu App de Saúde: diário alimentar, metas, treino, peso e artigos.
   Todos os dados ficam no localStorage do aparelho.
   ========================================================================= */

// ---------- Estado e armazenamento ----------
const CHAVE = 'saude.v1';
const PADRAO = { perfil: null, ajusteKcal: 0, diario: {}, pesos: {}, treino: { config: null, sessoes: [] }, config: { chave: '', modelo: '' } };
let S = carregar();
function carregar() {
  try { return Object.assign(structuredClone(PADRAO), JSON.parse(localStorage.getItem(CHAVE)) || {}); }
  catch { return structuredClone(PADRAO); }
}
function salvar() { localStorage.setItem(CHAVE, JSON.stringify(S)); }

// ---------- Utilitários ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r0 = (n) => Math.round(Number(n) || 0);
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const hojeISO = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local
const somaDias = (iso, d) => { const t = new Date(iso + 'T12:00:00'); t.setDate(t.getDate() + d); return t.toLocaleDateString('sv-SE'); };
const fmtData = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------- Navegação por abas ----------
const TITULOS = { hoje: 'Hoje', treino: 'Treino', peso: 'Peso', artigos: 'Artigos', perfil: 'Perfil' };
document.querySelectorAll('.abas button').forEach((b) => b.addEventListener('click', () => abrirTela(b.dataset.tela)));
function abrirTela(t) {
  document.querySelectorAll('.tela').forEach((s) => s.classList.toggle('ativa', s.id === 'tela-' + t));
  document.querySelectorAll('.abas button').forEach((b) => b.classList.toggle('ativa', b.dataset.tela === t));
  $('titulo').textContent = TITULOS[t];
  window.scrollTo(0, 0);
  ({ hoje: renderHoje, treino: renderTreino, peso: renderPeso, artigos: renderArtigos, perfil: renderPerfil })[t]();
}

// ---------- Modal ----------
function abrirModal(titulo, html) { $('modal-titulo').textContent = titulo; $('modal-corpo').innerHTML = html; $('modal').hidden = false; }
function fecharModal() { $('modal').hidden = true; $('modal-corpo').innerHTML = ''; }
$('modal-fechar').onclick = fecharModal;
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') fecharModal(); });

/* =========================================================================
   METAS (base científica)
   - Gasto basal: Mifflin-St Jeor (1990), a equação mais precisa em adultos.
   - Proteína: ~2,0 g/kg. Morton et al. (2018) mostram benefício até ~1,6 g/kg
     (IC até 2,2). Em déficit, valores mais altos ajudam a preservar massa
     magra (Helms et al., 2014).
   - Gordura: ~25% das kcal (mínimo 0,6 g/kg). Carboidrato: o restante.
   ========================================================================= */
const OBJETIVOS = {
  recomp: { fator: 0.85, prot: 2.0, nome: 'Recomposição (déficit ~15%)' },
  cut:    { fator: 0.78, prot: 2.2, nome: 'Emagrecer (déficit ~22%)' },
  manter: { fator: 1.0,  prot: 1.8, nome: 'Manutenção' },
  bulk:   { fator: 1.08, prot: 1.8, nome: 'Ganho de massa (superávit ~8%)' },
};
function calcularMetas(p, ajuste = 0) {
  if (!p) return null;
  const tmb = 10 * p.peso + 6.25 * p.altura - 5 * p.idade + (p.sexo === 'm' ? 5 : -161);
  const get = tmb * p.atividade;
  const obj = OBJETIVOS[p.objetivo] || OBJETIVOS.recomp;
  let kcal = get * obj.fator + ajuste;
  const minimo = p.sexo === 'm' ? 1500 : 1200;
  const abaixoMinimo = kcal < minimo;
  if (abaixoMinimo) kcal = minimo;
  const imc = p.peso / (p.altura / 100) ** 2;
  // Com IMC alto, a proteína é calculada sobre um "peso de referência" (IMC 25),
  // para não superestimar a necessidade.
  const pesoRef = imc >= 30 ? 25 * (p.altura / 100) ** 2 : p.peso;
  const prot = obj.prot * pesoRef;
  const gord = Math.max(0.6 * p.peso, (kcal * 0.25) / 9);
  const carb = Math.max(0, (kcal - prot * 4 - gord * 9) / 4);
  return { tmb, get, kcal, prot, carb, gord, imc, pesoRef, abaixoMinimo, obj };
}
const metas = () => calcularMetas(S.perfil, S.ajusteKcal);

/* =========================================================================
   TELA HOJE: diário alimentar
   ========================================================================= */
let diaAtual = hojeISO();
const REFEICOES = ['Café da manhã', 'Almoço', 'Lanche', 'Jantar', 'Ceia'];
$('dia-ant').onclick = () => { diaAtual = somaDias(diaAtual, -1); renderHoje(); };
$('dia-prox').onclick = () => { diaAtual = somaDias(diaAtual, 1); renderHoje(); };

function refeicaoSugerida() {
  const h = new Date().getHours();
  return h < 10 ? 'Café da manhã' : h < 15 ? 'Almoço' : h < 18 ? 'Lanche' : h < 22 ? 'Jantar' : 'Ceia';
}
function itensDoDia(d = diaAtual) { return S.diario[d] || []; }
function totais(itens) {
  return itens.reduce((t, i) => ({ kcal: t.kcal + i.kcal, p: t.p + i.p, c: t.c + i.c, g: t.g + i.g }), { kcal: 0, p: 0, c: 0, g: 0 });
}
function barra(valor, meta, classe = '') {
  const pct = meta ? Math.min(100, (valor / meta) * 100) : 0;
  const exc = meta && valor > meta * 1.05 ? ' excesso' : '';
  return `<div class="barra ${classe}${exc}"><i style="width:${pct}%"></i></div>`;
}

function renderHoje() {
  $('data-atual').textContent = diaAtual === hojeISO() ? 'Hoje, ' + fmtData(diaAtual) : fmtData(diaAtual);
  const m = metas();
  const t = totais(itensDoDia());
  if (!m) {
    $('resumo-dia').innerHTML = `<p>Comece preenchendo seus dados em <b>Perfil</b> para calcular suas metas.</p><button class="btn primario" onclick="abrirTela('perfil')">Ir para Perfil</button>`;
  } else {
    const resta = m.kcal - t.kcal;
    $('resumo-dia').innerHTML = `
      <div class="kcal-grande"><span><b>${r0(t.kcal)}</b> / ${r0(m.kcal)} kcal</span>
      <span class="${resta < 0 ? 'erro' : ''}">${resta >= 0 ? 'Restam ' + r0(resta) : 'Passou ' + r0(-resta)}</span></div>
      ${barra(t.kcal, m.kcal)}
      <div class="macros">
        <div>Proteína<br><b>${r0(t.p)}</b>/${r0(m.prot)} g${barra(t.p, m.prot, 'prot')}</div>
        <div>Carbo<br><b>${r0(t.c)}</b>/${r0(m.carb)} g${barra(t.c, m.carb, 'carb')}</div>
        <div>Gordura<br><b>${r0(t.g)}</b>/${r0(m.gord)} g${barra(t.g, m.gord, 'gord')}</div>
      </div>`;
  }
  const itens = itensDoDia();
  $('lista-refeicoes').innerHTML = REFEICOES.map((ref) => {
    const lst = itens.filter((i) => i.refeicao === ref);
    if (!lst.length) return '';
    const tt = totais(lst);
    return `<div class="card"><h2>${ref} <span class="dica">· ${r0(tt.kcal)} kcal</span></h2>
      ${lst.map((i) => `<div class="item">
        <div><div class="nome">${esc(i.nome)}</div><div class="det">${r0(i.gramas)} g · P ${r0(i.p)} · C ${r0(i.c)} · G ${r0(i.g)}${i.fonte ? ' · ' + esc(i.fonte) : ''}</div></div>
        <span class="kc">${r0(i.kcal)}</span>
        <button class="btn-icone" aria-label="Remover" onclick="removerItem('${i.id}')">🗑</button></div>`).join('')}
    </div>`;
  }).join('') || '<p class="dica" style="text-align:center">Nenhum alimento registrado neste dia.</p>';
}
function adicionarItens(lista) {
  S.diario[diaAtual] = itensDoDia().concat(lista.map((i) => ({ id: uid(), ...i })));
  salvar(); renderHoje();
}
window.removerItem = (id) => {
  if (!confirm('Remover este item?')) return;
  S.diario[diaAtual] = itensDoDia().filter((i) => i.id !== id);
  salvar(); renderHoje();
};
function seletorRefeicao(id = 'sel-refeicao') {
  const sug = refeicaoSugerida();
  return `<label>Refeição<select id="${id}">${REFEICOES.map((r) => `<option ${r === sug ? 'selected' : ''}>${r}</option>`).join('')}</select></label>`;
}

// ----- Buscar (TACO + Open Food Facts) -----
const TACO_IDX = TACO.map((f) => norm(f[0]));
$('btn-buscar').onclick = () => {
  abrirModal('Buscar alimento', `
    <input type="search" id="bs-texto" placeholder="ex: arroz cozido, frango grelhado, ovo">
    <div class="chips"><button class="chip" id="bs-off">🌐 Buscar produtos industrializados</button>
    <button class="chip" id="bs-codigo">🔢 Código de barras</button></div>
    <div id="bs-res" style="margin-top:8px"></div>`);
  const inp = $('bs-texto'); inp.focus();
  inp.oninput = () => buscarTACO(inp.value);
  $('bs-off').onclick = () => buscarOFF(inp.value);
  $('bs-codigo').onclick = () => {
    const cod = prompt('Digite os números do código de barras:');
    if (cod) buscarCodigo(cod.replace(/\D/g, ''));
  };
};
function buscarTACO(q) {
  const termos = norm(q).split(/\s+/).filter(Boolean);
  if (!termos.length) { $('bs-res').innerHTML = ''; return; }
  const res = [];
  for (let i = 0; i < TACO.length && res.length < 40; i++) if (termos.every((t) => TACO_IDX[i].includes(t))) res.push(TACO[i]);
  // Alimentos cozidos e prontos primeiro, porque é o que normalmente se come
  res.sort((a, b) => (/cru/i.test(a[0]) ? 1 : 0) - (/cru/i.test(b[0]) ? 1 : 0));
  $('bs-res').innerHTML = res.length
    ? '<p class="dica">Tabela TACO (valores por 100 g)</p>' + res.map((f) => linhaAlimento({ nome: f[0], kcal: f[1], p: f[2], c: f[3], g: f[4], fonte: 'TACO' })).join('')
    : '<p class="dica">Nada na TACO. Tente “Buscar produtos industrializados” ou descreva com IA.</p>';
}
let ultimosResultados = [];
function linhaAlimento(a) {
  ultimosResultados.push(a);
  const idx = ultimosResultados.length - 1;
  return `<div class="item clicavel" onclick="escolherAlimento(${idx})">
    <div><div class="nome">${esc(a.nome)}</div><div class="det">${r0(a.kcal)} kcal · P ${r1(a.p)} · C ${r1(a.c)} · G ${r1(a.g)} /100 g</div></div><span>＋</span></div>`;
}
async function buscarOFF(q) {
  if (!q.trim()) { alert('Digite o nome do produto primeiro.'); return; }
  $('bs-res').innerHTML = '<p class="carregando">Buscando no Open Food Facts…</p>';
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&json=1&page_size=20&fields=product_name,brands,nutriments`;
    const d = await (await fetch(url)).json();
    const lst = (d.products || []).map(offParaAlimento).filter(Boolean);
    $('bs-res').innerHTML = lst.length ? '<p class="dica">Open Food Facts (por 100 g)</p>' + lst.map(linhaAlimento).join('') : '<p class="dica">Nenhum produto encontrado.</p>';
  } catch (e) { $('bs-res').innerHTML = `<p class="erro">Erro na busca: ${esc(e.message)}</p>`; }
}
async function buscarCodigo(cod) {
  $('bs-res').innerHTML = '<p class="carregando">Procurando o código…</p>';
  try {
    const d = await (await fetch(`https://world.openfoodfacts.org/api/v2/product/${cod}.json?fields=product_name,brands,nutriments`)).json();
    const a = d.status === 1 && offParaAlimento(d.product);
    $('bs-res').innerHTML = a ? linhaAlimento(a) : '<p class="dica">Produto não encontrado nesse banco de dados.</p>';
  } catch (e) { $('bs-res').innerHTML = `<p class="erro">Erro: ${esc(e.message)}</p>`; }
}
function offParaAlimento(p) {
  const n = p.nutriments || {};
  const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : null);
  if (kcal == null || !p.product_name) return null;
  return { nome: p.product_name + (p.brands ? ' (' + p.brands.split(',')[0] + ')' : ''), kcal, p: n.proteins_100g || 0, c: n.carbohydrates_100g || 0, g: n.fat_100g || 0, fonte: 'OFF' };
}
window.escolherAlimento = (idx) => {
  const a = ultimosResultados[idx];
  abrirModal('Quantidade', `
    <p><b>${esc(a.nome)}</b></p>
    <label>Quantidade (gramas)<input type="number" id="qt-g" value="100" inputmode="decimal"></label>
    <p class="dica">Referências: 1 colher de sopa de arroz ≈ 25 g · 1 concha de feijão ≈ 80 g · 1 ovo ≈ 50 g · 1 filé de frango ≈ 120 g · 1 pão francês ≈ 50 g</p>
    ${seletorRefeicao()}
    <p id="qt-prev"></p>
    <button class="btn primario" id="qt-ok" style="width:100%">Adicionar</button>`);
  const prev = () => { const g = +$('qt-g').value || 0; $('qt-prev').innerHTML = `<b>${r0(a.kcal * g / 100)} kcal</b> · P ${r1(a.p * g / 100)} g · C ${r1(a.c * g / 100)} g · G ${r1(a.g * g / 100)} g`; };
  $('qt-g').oninput = prev; prev();
  $('qt-ok').onclick = () => {
    const g = +$('qt-g').value || 0; if (!g) return;
    adicionarItens([{ nome: a.nome, gramas: g, kcal: a.kcal * g / 100, p: a.p * g / 100, c: a.c * g / 100, g: a.g * g / 100, refeicao: $('sel-refeicao').value, fonte: a.fonte }]);
    fecharModal();
  };
};

/* =========================================================================
   GEMINI: foto e texto livre
   ========================================================================= */
const API_GEMINI = 'https://generativelanguage.googleapis.com/v1beta/';
// Traduz os erros mais comuns da API para algo que dê para resolver
function erroGemini(status, d) {
  const msg = d?.error?.message || '';
  const motivo = JSON.stringify(d?.error?.details || '') + ' ' + (d?.error?.status || '');
  if (/API_KEY_INVALID|API key not valid/i.test(msg + motivo)) return 'Chave inválida. Gere uma nova em aistudio.google.com → "Get API key" e cole sem espaços.';
  if (status === 403 || /PERMISSION_DENIED/.test(motivo)) return 'A chave não tem permissão para a API do Gemini. Crie a chave pelo aistudio.google.com (não pelo Google Cloud Console). Detalhe: ' + msg;
  if (status === 429 || /RESOURCE_EXHAUSTED/.test(motivo)) return 'Limite gratuito atingido para este modelo. Espere 1 minuto, ou toque em "Testar" para o app escolher outro modelo. Detalhe: ' + msg;
  if (/location is not supported|User location/i.test(msg)) return 'A API do Gemini não está disponível na sua região/conta. Detalhe: ' + msg;
  if (status === 404 || /not found|not supported/i.test(msg)) return 'MODELO_INVALIDO';
  if (status >= 500) return 'O servidor do Google está instável agora. Tente de novo em alguns segundos.';
  return msg || 'Erro HTTP ' + status;
}
// Lista os modelos que a SUA chave pode usar e ordena do melhor para este app
async function listarModelos(chave) {
  let resp;
  try { resp = await fetch(`${API_GEMINI}models?pageSize=200&key=${encodeURIComponent(chave)}`); }
  catch { throw new Error('Sem conexão com o Google. Verifique a internet.'); }
  const d = await resp.json().catch(() => ({}));
  if (!resp.ok) { const e = erroGemini(resp.status, d); throw new Error(e === 'MODELO_INVALIDO' ? 'Não consegui listar os modelos.' : e); }
  const nota = (n) => (/flash/.test(n) ? 100 : /pro/.test(n) ? 50 : 0) - (/lite/.test(n) ? 10 : 0) - (/preview|exp/.test(n) ? 20 : 0)
    + (parseFloat((n.match(/gemini-(\d+(\.\d+)?)/) || [])[1]) || 0) * 5 + (/latest/.test(n) ? 3 : 0);
  return (d.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /^gemini/.test(n) && !/tts|image|embed|live|audio|thinking|computer|robotics|veo|imagen|nano/i.test(n))
    .sort((x, y) => nota(y) - nota(x));
}
async function chamarModelo(modelo, chave, parts, json) {
  let resp;
  try {
    resp = await fetch(`${API_GEMINI}models/${encodeURIComponent(modelo)}:generateContent?key=${encodeURIComponent(chave)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: json ? { responseMimeType: 'application/json', temperature: 0.2 } : { temperature: 0.3 } }),
    });
  } catch { throw new Error('Sem conexão com o Google. Verifique a internet.'); }
  const d = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(erroGemini(resp.status, d));
  const txt = (d.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
  if (!txt) throw new Error('A IA não retornou resposta (talvez bloqueada por filtro de segurança). Tente outra foto ou descrição.');
  if (!json) return txt;
  try { return JSON.parse(txt.replace(/^\s*```(json)?\s*|\s*```\s*$/g, '')); }
  catch { throw new Error('A IA respondeu num formato inesperado. Tente de novo.'); }
}
async function gemini(parts, json = true) {
  const chave = (S.config.chave || '').trim();
  if (!chave) throw new Error('Configure sua chave do Gemini na aba Perfil.');
  const modelo = (S.config.modelo || 'gemini-2.5-flash').trim();
  try { return await chamarModelo(modelo, chave, parts, json); }
  catch (e) {
    if (e.message !== 'MODELO_INVALIDO') throw e;
    // Modelo não existe para esta chave: descobre um que exista e salva
    const lista = await listarModelos(chave);
    if (!lista.length) throw new Error('Sua chave não tem nenhum modelo Gemini disponível.');
    S.config.modelo = lista[0]; salvar();
    return chamarModelo(lista[0], chave, parts, json);
  }
}
const PROMPT_ALIMENTOS = `Você é um nutricionista brasileiro. Identifique cada alimento e estime a porção em gramas e os valores nutricionais dessa porção.
Use como referência a Tabela TACO (Brasil) quando possível. Seja realista nas porções e, na dúvida, considere uma porção típica de um adulto brasileiro.
Responda APENAS com JSON no formato:
{"itens":[{"nome":"string em português","gramas":number,"kcal":number,"proteina":number,"carboidrato":number,"gordura":number}],"observacao":"string curta sobre incertezas (ex: óleo de preparo não visível)"}`;

$('btn-foto').onclick = () => {
  if (!S.config.chave) { alert('Para usar a foto, configure a chave do Gemini na aba Perfil.'); abrirTela('perfil'); return; }
  $('input-foto').click();
};
$('input-foto').onchange = async (e) => {
  const arq = e.target.files[0]; e.target.value = '';
  if (!arq) return;
  abrirModal('Analisando foto…', '<p class="carregando">Reduzindo a imagem e enviando para o Gemini…</p>');
  try {
    const { base64, url } = await reduzirImagem(arq, 1024);
    $('modal-corpo').innerHTML = `<img src="${url}" style="width:100%;border-radius:10px"><p class="carregando">A IA está identificando os alimentos…</p>`;
    const r = await gemini([{ text: PROMPT_ALIMENTOS + '\nAnalise a foto do prato.' }, { inline_data: { mime_type: 'image/jpeg', data: base64 } }]);
    mostrarRevisao(r, 'Foto IA', url);
  } catch (err) { $('modal-corpo').innerHTML = `<p class="erro">${esc(err.message)}</p>`; }
};
$('btn-texto').onclick = () => {
  if (!S.config.chave) { alert('Para descrever com IA, configure a chave do Gemini na aba Perfil. Sem a chave, use “Buscar”.'); return; }
  abrirModal('Descrever refeição', `
    <p class="dica">Escreva do seu jeito. Ex: “2 ovos mexidos com 1 colher de manteiga, 1 pão francês e café com leite”.</p>
    <textarea id="tx-desc" rows="4" style="width:100%;font-size:16px;padding:10px;border-radius:10px;border:1px solid var(--borda);background:var(--bg);color:var(--txt)"></textarea>
    <button class="btn primario" id="tx-ok" style="width:100%;margin-top:8px">Calcular</button><div id="tx-res"></div>`);
  $('tx-ok').onclick = async () => {
    const desc = $('tx-desc').value.trim(); if (!desc) return;
    $('tx-res').innerHTML = '<p class="carregando">Calculando…</p>';
    try { mostrarRevisao(await gemini([{ text: PROMPT_ALIMENTOS + '\nRefeição descrita pelo usuário: ' + desc }]), 'Texto IA'); }
    catch (err) { $('tx-res').innerHTML = `<p class="erro">${esc(err.message)}</p>`; }
  };
};
function reduzirImagem(arq, max) {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => {
      const fator = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * fator); c.height = Math.round(img.height * fator);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.82);
      URL.revokeObjectURL(img.src);
      ok({ url, base64: url.split(',')[1] });
    };
    img.onerror = () => falha(new Error('Não consegui abrir a imagem.'));
    img.src = URL.createObjectURL(arq);
  });
}
// Mostra o que a IA encontrou para você revisar e ajustar as gramas antes de salvar
function mostrarRevisao(r, fonte, imgUrl) {
  const itens = (r.itens || []).map((i) => ({ nome: i.nome, gramas: +i.gramas || 0, kcal: +i.kcal || 0, p: +i.proteina || 0, c: +i.carboidrato || 0, g: +i.gordura || 0 }));
  // valores por grama, para recalcular quando a quantidade mudar
  const base = itens.map((i) => ({ k: i.kcal / (i.gramas || 1), p: i.p / (i.gramas || 1), c: i.c / (i.gramas || 1), g: i.g / (i.gramas || 1) }));
  abrirModal('Confira e ajuste', `
    ${imgUrl ? `<img src="${imgUrl}" style="width:100%;max-height:200px;object-fit:cover;border-radius:10px">` : ''}
    ${itens.length ? '' : '<p class="erro">Nenhum alimento identificado.</p>'}
    <table><tr><th></th><th>Alimento</th><th style="width:80px">g</th><th>kcal</th></tr>
    ${itens.map((i, n) => `<tr><td><input type="checkbox" checked id="rv-on-${n}"></td><td>${esc(i.nome)}<div class="dica" id="rv-m-${n}"></div></td>
      <td><input type="number" id="rv-g-${n}" value="${r0(i.gramas)}" inputmode="decimal"></td><td id="rv-k-${n}"></td></tr>`).join('')}
    </table>
    ${r.observacao ? `<p class="dica">⚠️ ${esc(r.observacao)}</p>` : ''}
    <p class="dica">Estimativas de IA podem errar a porção em 20–30% ou mais. Ajuste as gramas se souber o peso.</p>
    ${seletorRefeicao()}
    <button class="btn primario" id="rv-ok" style="width:100%">Adicionar ao diário</button>`);
  const atualiza = (n) => {
    const g = +$('rv-g-' + n).value || 0, b = base[n];
    $('rv-k-' + n).textContent = r0(b.k * g);
    $('rv-m-' + n).textContent = `P ${r0(b.p * g)} · C ${r0(b.c * g)} · G ${r0(b.g * g)}`;
  };
  itens.forEach((_, n) => { atualiza(n); $('rv-g-' + n).oninput = () => atualiza(n); });
  $('rv-ok').onclick = () => {
    const ref = $('sel-refeicao').value;
    const lst = itens.map((i, n) => {
      if (!$('rv-on-' + n).checked) return null;
      const g = +$('rv-g-' + n).value || 0, b = base[n];
      return { nome: i.nome, gramas: g, kcal: b.k * g, p: b.p * g, c: b.c * g, g: b.g * g, refeicao: ref, fonte };
    }).filter(Boolean);
    adicionarItens(lst); fecharModal();
  };
}

/* =========================================================================
   TREINO
   Diretrizes: 10–20 séries semanais por músculo (Schoenfeld et al., 2017),
   cada músculo treinado 2x/semana, 6–15 repetições terminando a 1–3 reps
   da falha (RIR 1–3) e progressão dupla (primeiro reps, depois carga).
   ========================================================================= */
// [nome, tipo] tipo: c = composto (menos reps), i = isolado (mais reps)
const EXS = {
  academia: {
    'Corpo todo A': [['Agachamento livre ou Leg press', 'c'], ['Supino reto com halteres', 'c'], ['Remada curvada ou Remada baixa', 'c'], ['Desenvolvimento com halteres', 'c'], ['Mesa flexora', 'i'], ['Prancha (segundos)', 'i']],
    'Corpo todo B': [['Levantamento terra romeno (Stiff)', 'c'], ['Puxada frontal', 'c'], ['Supino inclinado', 'c'], ['Passada / Afundo', 'c'], ['Elevação lateral', 'i'], ['Rosca direta', 'i'], ['Tríceps na polia', 'i']],
    'Superior': [['Supino reto', 'c'], ['Remada baixa', 'c'], ['Desenvolvimento com halteres', 'c'], ['Puxada frontal', 'c'], ['Elevação lateral', 'i'], ['Rosca direta', 'i'], ['Tríceps na polia', 'i']],
    'Inferior': [['Agachamento livre', 'c'], ['Stiff', 'c'], ['Leg press', 'c'], ['Cadeira flexora', 'i'], ['Cadeira extensora', 'i'], ['Panturrilha em pé', 'i']],
    'Empurrar': [['Supino reto', 'c'], ['Supino inclinado com halteres', 'c'], ['Desenvolvimento', 'c'], ['Elevação lateral', 'i'], ['Tríceps na polia', 'i'], ['Tríceps francês', 'i']],
    'Puxar': [['Puxada frontal', 'c'], ['Remada curvada', 'c'], ['Remada baixa', 'c'], ['Face pull', 'i'], ['Rosca direta', 'i'], ['Rosca martelo', 'i']],
    'Pernas': [['Agachamento livre', 'c'], ['Stiff', 'c'], ['Leg press', 'c'], ['Cadeira flexora', 'i'], ['Cadeira extensora', 'i'], ['Panturrilha sentado', 'i']],
  },
  casa: {
    'Corpo todo A': [['Agachamento búlgaro', 'c'], ['Flexão de braço', 'c'], ['Remada unilateral com halter', 'c'], ['Desenvolvimento com halteres ou elástico', 'c'], ['Ponte de glúteo unilateral', 'i'], ['Prancha (segundos)', 'i']],
    'Corpo todo B': [['Agachamento goblet', 'c'], ['Flexão com pés elevados', 'c'], ['Remada invertida (mesa) ou com elástico', 'c'], ['Stiff com halteres', 'c'], ['Elevação lateral', 'i'], ['Rosca com halteres', 'i'], ['Tríceps no banco', 'i']],
    'Superior': [['Flexão de braço', 'c'], ['Remada unilateral com halter', 'c'], ['Flexão pike (ombros)', 'c'], ['Remada com elástico', 'c'], ['Elevação lateral', 'i'], ['Rosca com halteres', 'i'], ['Tríceps no banco', 'i']],
    'Inferior': [['Agachamento búlgaro', 'c'], ['Stiff unilateral com halter', 'c'], ['Agachamento goblet', 'c'], ['Ponte de glúteo', 'i'], ['Afundo reverso', 'i'], ['Panturrilha unilateral no degrau', 'i']],
    'Empurrar': [['Flexão de braço', 'c'], ['Flexão com pés elevados', 'c'], ['Flexão pike (ombros)', 'c'], ['Elevação lateral', 'i'], ['Tríceps no banco', 'i'], ['Tríceps francês com halter', 'i']],
    'Puxar': [['Remada unilateral com halter', 'c'], ['Remada invertida (mesa)', 'c'], ['Remada com elástico', 'c'], ['Crucifixo invertido', 'i'], ['Rosca com halteres', 'i'], ['Rosca martelo', 'i']],
    'Pernas': [['Agachamento búlgaro', 'c'], ['Stiff com halteres', 'c'], ['Agachamento goblet', 'c'], ['Ponte de glúteo unilateral', 'i'], ['Afundo reverso', 'i'], ['Panturrilha unilateral no degrau', 'i']],
  },
};
const DIVISOES = {
  2: ['Corpo todo A', 'Corpo todo B'],
  3: ['Corpo todo A', 'Corpo todo B', 'Corpo todo A'],
  4: ['Superior', 'Inferior', 'Superior', 'Inferior'],
  5: ['Superior', 'Inferior', 'Empurrar', 'Puxar', 'Pernas'],
  6: ['Empurrar', 'Puxar', 'Pernas', 'Empurrar', 'Puxar', 'Pernas'],
};
$('tr-gerar').onclick = () => {
  S.treino.config = { local: $('tr-local').value, dias: +$('tr-dias').value, nivel: $('tr-nivel').value };
  salvar(); renderTreino();
};
function prescricao(tipo, cfg) {
  const series = cfg.nivel === 'iniciante' ? 3 : (tipo === 'c' ? 4 : 3);
  const reps = tipo === 'c' ? (cfg.local === 'casa' ? '8–15' : '6–10') : '10–15';
  return { series, reps };
}
function renderTreino() {
  const cfg = S.treino.config;
  if (cfg) { $('tr-local').value = cfg.local; $('tr-dias').value = cfg.dias; $('tr-nivel').value = cfg.nivel; }
  if (!cfg) { $('tr-plano').innerHTML = ''; $('tr-sessao').innerHTML = ''; renderHistorico(); return; }
  const dias = DIVISOES[cfg.dias];
  const unicos = [...new Set(dias)];
  $('tr-plano').innerHTML = `<div class="card"><h2>Seu plano · ${cfg.dias}x/semana</h2>
    <p class="dica">Sequência: ${dias.map((d, i) => `<b>${i + 1}.</b> ${d}`).join(' → ')}${cfg.dias === 3 ? ' (na semana seguinte comece pelo B)' : ''}</p>
    <ul class="dica" style="padding-left:18px;margin:6px 0">
      <li>Termine cada série a <b>1–3 repetições da falha</b>, ou seja, ainda daria para fazer mais 1 a 3.</li>
      <li><b>Progressão dupla:</b> quando completar o topo da faixa de reps em todas as séries, aumente a carga na próxima vez.</li>
      <li>Descanso: 2–3 min nos compostos e 1–2 min nos isolados.</li>
      <li>Fora da academia: tente <b>7–10 mil passos/dia</b>. Isso ajuda muito no déficit.</li>
    </ul>
    <div class="chips">${unicos.map((d) => `<button class="chip" onclick="iniciarSessao('${d}')">▶ Treinar ${d}</button>`).join('')}</div>
    <p class="dica">Próximo sugerido: <b>${proximoTreino()}</b></p></div>`;
  renderHistorico();
}
function proximoTreino() {
  const dias = DIVISOES[S.treino.config.dias];
  const ult = S.treino.sessoes[S.treino.sessoes.length - 1];
  if (!ult || ult.idx == null) return dias[0];
  return dias[(ult.idx + 1) % dias.length];
}
function ultimaSessaoDo(ex) {
  for (let i = S.treino.sessoes.length - 1; i >= 0; i--) {
    const s = S.treino.sessoes[i].exs?.[ex];
    if (s && s.some((x) => x.kg || x.reps)) return s;
  }
  return null;
}
window.iniciarSessao = (dia) => {
  const cfg = S.treino.config;
  const lista = EXS[cfg.local][dia];
  $('tr-sessao').innerHTML = `<div class="card"><h2>${dia} · ${fmtData(hojeISO())}</h2>
    <p class="dica">Os valores em cinza são do último treino. Tente superar em carga ou em reps.</p>
    ${lista.map(([nome, tipo], e) => {
      const { series, reps } = prescricao(tipo, cfg);
      const ant = ultimaSessaoDo(nome) || [];
      return `<div class="ex"><b>${esc(nome)}</b><div class="meta">${series} séries × ${reps} reps</div>
        ${Array.from({ length: series }, (_, s) => `<div class="serie"><span>${s + 1}ª</span>
          <input type="number" inputmode="decimal" id="ss-${e}-${s}-kg" placeholder="${ant[s]?.kg ? ant[s].kg + ' kg' : 'kg'}">
          <input type="number" inputmode="numeric" id="ss-${e}-${s}-r" placeholder="${ant[s]?.reps ? ant[s].reps + ' reps' : 'reps'}"></div>`).join('')}
      </div>`;
    }).join('')}
    <button class="btn primario" style="width:100%;margin-top:8px" onclick="salvarSessao('${dia}')">✅ Concluir treino</button></div>`;
  $('tr-sessao').scrollIntoView({ behavior: 'smooth' });
};
window.salvarSessao = (dia) => {
  const cfg = S.treino.config;
  const lista = EXS[cfg.local][dia];
  const exs = {};
  lista.forEach(([nome, tipo], e) => {
    const { series } = prescricao(tipo, cfg);
    exs[nome] = Array.from({ length: series }, (_, s) => ({ kg: +$(`ss-${e}-${s}-kg`).value || 0, reps: +$(`ss-${e}-${s}-r`).value || 0 }));
  });
  const dias = DIVISOES[cfg.dias];
  // posição na sequência: se for o treino esperado, avança; senão usa a 1ª ocorrência
  const ultIdx = S.treino.sessoes.at(-1)?.idx ?? -1;
  const idx = proximoTreino() === dia ? (ultIdx + 1) % dias.length : dias.indexOf(dia);
  S.treino.sessoes.push({ data: hojeISO(), dia, idx, exs });
  salvar();
  $('tr-sessao').innerHTML = '<div class="card"><p>Treino salvo! 💪</p></div>';
  renderTreino();
};
function renderHistorico() {
  const ss = S.treino.sessoes.slice(-10).reverse();
  $('tr-historico').innerHTML = ss.length ? `<div class="card"><h2>Últimos treinos</h2>${ss.map((s) => {
    const vol = Object.values(s.exs).flat().reduce((t, x) => t + x.kg * x.reps, 0);
    return `<div class="item"><div><div class="nome">${esc(s.dia)}</div><div class="det">${fmtData(s.data)}</div></div><span class="det">${vol ? r0(vol) + ' kg de volume' : ''}</span></div>`;
  }).join('')}</div>` : '';
}

/* =========================================================================
   PESO: média móvel de 7 dias e ajuste automático da meta
   ========================================================================= */
$('peso-data').value = hojeISO();
$('peso-salvar').onclick = () => {
  const v = +$('peso-valor').value, d = $('peso-data').value;
  if (!v || !d) return;
  S.pesos[d] = v;
  if (S.perfil && d === Object.keys(S.pesos).sort().at(-1)) S.perfil.peso = v; // mantém o perfil atualizado
  salvar(); $('peso-valor').value = ''; renderPeso();
};
function mediaJanela(fim, dias) {
  const vals = [];
  for (let i = 0; i < dias; i++) { const v = S.pesos[somaDias(fim, -i)]; if (v) vals.push(v); }
  return vals.length >= 3 ? vals.reduce((a, b) => a + b) / vals.length : null;
}
window.removerPeso = (d) => { if (confirm('Remover registro?')) { delete S.pesos[d]; salvar(); renderPeso(); } };
window.ajustarMeta = (delta) => { S.ajusteKcal += delta; salvar(); renderPeso(); alert(`Meta ajustada em ${delta > 0 ? '+' : ''}${delta} kcal. Nova meta: ${r0(metas().kcal)} kcal/dia.`); };
function renderPeso() {
  const ds = Object.keys(S.pesos).sort();
  const hoje = hojeISO();
  const atual = mediaJanela(hoje, 7), anterior = mediaJanela(somaDias(hoje, -7), 7);
  let analise = '<h2>Tendência</h2>';
  if (atual && anterior) {
    const taxa = ((anterior - atual) / anterior) * 100;
    analise += `<p>Média dos últimos 7 dias: <b>${r1(atual)} kg</b> (semana anterior: ${r1(anterior)} kg)<br>
      Variação: <b>${taxa >= 0 ? '−' : '+'}${r1(Math.abs(anterior - atual))} kg</b> (${r1(Math.abs(taxa))}% ${taxa >= 0 ? 'de perda' : 'de ganho'} por semana)</p>`;
    const obj = S.perfil?.objetivo || 'recomp';
    if (obj === 'recomp' || obj === 'cut') {
      if (taxa < 0.25) analise += `<p>📉 A perda está lenta (o ideal é 0,5–1% do peso por semana). Se isso se repetir por 2 semanas, reduza um pouco as calorias ou aumente os passos diários.</p><button class="btn" onclick="ajustarMeta(-150)">Reduzir meta em 150 kcal</button>`;
      else if (taxa > 1) analise += `<p>⚠️ A perda está rápida (mais de 1% por semana) e aumenta o risco de perder músculo. Considere comer um pouco mais.</p><button class="btn" onclick="ajustarMeta(150)">Aumentar meta em 150 kcal</button>`;
      else analise += '<p>✅ Ritmo ideal (0,25–1% por semana). Mantenha!</p>';
    }
    if (S.ajusteKcal) analise += `<p class="dica">Ajuste acumulado: ${S.ajusteKcal > 0 ? '+' : ''}${S.ajusteKcal} kcal · <a href="#" onclick="S.ajusteKcal=0;salvar();renderPeso();return false">zerar</a></p>`;
  } else {
    analise += '<p class="dica">Registre o peso pelo menos 3 vezes em cada uma das últimas 2 semanas para ver a tendência e receber sugestões de ajuste da meta.</p>';
  }
  $('peso-analise').innerHTML = analise;
  $('peso-grafico').innerHTML = ds.length >= 2 ? grafico(ds.slice(-60)) : '<p class="dica">O gráfico aparece a partir de 2 registros.</p>';
  $('peso-lista').innerHTML = ds.length ? '<h2>Registros</h2>' + ds.slice(-15).reverse().map((d) => `<div class="item"><span>${fmtData(d)}</span><span class="kc">${r1(S.pesos[d])} kg</span><button class="btn-icone" onclick="removerPeso('${d}')">🗑</button></div>`).join('') : '';
}
function grafico(ds) {
  const W = 320, H = 160, P = 28;
  const vals = ds.map((d) => S.pesos[d]);
  const medias = ds.map((d) => mediaJanela(d, 7) ?? S.pesos[d]);
  const min = Math.min(...vals, ...medias) - 0.5, max = Math.max(...vals, ...medias) + 0.5;
  const t0 = new Date(ds[0]).getTime(), t1 = new Date(ds.at(-1)).getTime() || t0 + 1;
  const x = (d) => P + ((new Date(d).getTime() - t0) / (t1 - t0 || 1)) * (W - P - 8);
  const y = (v) => 8 + (1 - (v - min) / (max - min)) * (H - P);
  const linha = ds.map((d, i) => `${x(d)},${y(medias[i])}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">
    <text x="0" y="${y(max) + 10}">${r1(max)}</text><text x="0" y="${y(min)}">${r1(min)}</text>
    ${vals.map((v, i) => `<circle cx="${x(ds[i])}" cy="${y(v)}" r="2.5" fill="var(--sub)" opacity=".5"/>`).join('')}
    <polyline points="${linha}" fill="none" stroke="var(--pri)" stroke-width="2.5"/>
    <text x="${P}" y="${H - 2}">${fmtData(ds[0])}</text><text x="${W - 70}" y="${H - 2}">${fmtData(ds.at(-1))}</text>
  </svg><p class="dica">Pontos: pesagens · Linha: média móvel de 7 dias</p>`;
}

/* =========================================================================
   ARTIGOS: busca no PubMed e resumo com Gemini
   ========================================================================= */
const SUGESTOES = [
  ['Proteína e músculo', 'protein supplementation resistance training lean mass'],
  ['Recomposição corporal', 'body recomposition fat loss muscle gain'],
  ['Volume de treino', 'resistance training volume hypertrophy'],
  ['Déficit e massa magra', 'energy deficit lean mass preservation resistance training'],
  ['Creatina', 'creatine supplementation muscle strength'],
  ['Sono e composição corporal', 'sleep restriction body composition'],
  ['Cardio x musculação', 'concurrent training interference hypertrophy'],
  ['Jejum intermitente', 'intermittent fasting weight loss'],
];
const BASE = [
  ['Mifflin et al., 1990', 'Equação de gasto energético basal usada no app', 'A new predictive equation for resting energy expenditure in healthy individuals'],
  ['Morton et al., 2018 (meta-análise)', 'Proteína: ganhos de massa magra até ~1,6 g/kg/dia (IC até 2,2)', 'A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults'],
  ['Helms et al., 2014', 'Proteína mais alta e déficit moderado para preservar músculo', 'Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation'],
  ['Schoenfeld et al., 2017 (meta-análise)', 'Mais séries semanais → mais hipertrofia (dose-resposta)', 'Dose-response relationship between weekly resistance training volume and increases in muscle mass: A systematic review and meta-analysis'],
  ['Schoenfeld et al., 2016 (meta-análise)', 'Treinar cada músculo 2x/semana supera 1x/semana', 'Effects of Resistance Training Frequency on Measures of Muscle Hypertrophy: A Systematic Review and Meta-Analysis'],
  ['Barakat et al., 2020', 'Recomposição corporal é possível, inclusive em treinados', 'Body Recomposition: Can Trained Individuals Build Muscle and Lose Fat at the Same Time?'],
];
const linkBusca = (t) => 'https://pubmed.ncbi.nlm.nih.gov/?term=' + encodeURIComponent(t);
function renderArtigos() {
  $('art-sugestoes').innerHTML = SUGESTOES.map(([n, q]) => `<button class="chip" data-q="${esc(q)}">${esc(n)}</button>`).join('');
  $('art-sugestoes').querySelectorAll('.chip').forEach((c) => (c.onclick = () => { $('art-busca').value = c.dataset.q; buscarPubMed(); }));
  $('art-base').innerHTML = BASE.map(([a, d, t]) => `<div class="item"><div><div class="nome">${esc(a)}</div><div class="det">${esc(d)}</div></div><a class="btn pequeno" href="${linkBusca(t)}" target="_blank" rel="noopener">Ver</a></div>`).join('');
}
$('art-buscar').onclick = () => buscarPubMed();
$('art-busca').addEventListener('keydown', (e) => { if (e.key === 'Enter') buscarPubMed(); });
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
async function buscarPubMed() {
  const q = $('art-busca').value.trim(); if (!q) return;
  const termo = $('art-meta').checked ? `(${q}) AND (meta-analysis[pt] OR systematic review[pt])` : q;
  $('art-resultados').innerHTML = '<div class="card carregando">Buscando no PubMed…</div>';
  try {
    const s = await (await fetch(`${EUTILS}esearch.fcgi?db=pubmed&retmode=json&retmax=15&sort=relevance&term=${encodeURIComponent(termo)}`)).json();
    const ids = s.esearchresult?.idlist || [];
    if (!ids.length) { $('art-resultados').innerHTML = '<div class="card dica">Nenhum artigo encontrado. Tente outros termos em inglês.</div>'; return; }
    const sm = await (await fetch(`${EUTILS}esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`)).json();
    $('art-resultados').innerHTML = '<div class="card"><h2>Resultados</h2>' + ids.map((id) => {
      const a = sm.result[id] || {};
      return `<div class="ex"><a href="https://pubmed.ncbi.nlm.nih.gov/${id}/" target="_blank" rel="noopener"><b>${esc(a.title)}</b></a>
        <div class="meta">${esc((a.authors || []).slice(0, 3).map((x) => x.name).join(', '))}${(a.authors || []).length > 3 ? ' et al.' : ''} · ${esc(a.source)} · ${esc(a.pubdate)}</div>
        <button class="btn pequeno" style="margin-top:6px" onclick="resumirArtigo('${id}', this)">🤖 Resumir em português</button><div id="res-${id}"></div></div>`;
    }).join('') + '</div>';
  } catch (e) { $('art-resultados').innerHTML = `<div class="card erro">Erro: ${esc(e.message)}</div>`; }
}
window.resumirArtigo = async (id, btn) => {
  const alvo = $('res-' + id);
  if (!S.config.chave) { alvo.innerHTML = '<p class="erro">Configure a chave do Gemini na aba Perfil.</p>'; return; }
  btn.disabled = true; alvo.innerHTML = '<p class="carregando">Lendo o resumo do artigo…</p>';
  try {
    const abs = await (await fetch(`${EUTILS}efetch.fcgi?db=pubmed&id=${id}&rettype=abstract&retmode=text`)).text();
    const perfil = S.perfil ? `Perfil do leitor: ${S.perfil.sexo === 'm' ? 'homem' : 'mulher'}, ${S.perfil.idade} anos, ${S.perfil.peso} kg, objetivo: ${OBJETIVOS[S.perfil.objetivo].nome}.` : '';
    const txt = await gemini([{ text: `Resuma este artigo científico em português do Brasil, para um leigo que treina musculação.
Use no máximo 180 palavras, com estas seções:
• O que estudaram
• Principais resultados (com números)
• Qualidade da evidência (tipo de estudo, tamanho da amostra, limitações)
• Aplicação prática
Não invente nada que não esteja no texto. ${perfil}

${abs.slice(0, 12000)}` }], false);
    alvo.innerHTML = `<div class="resumo-ia">${esc(txt)}</div>`;
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; btn.disabled = false; }
};

/* =========================================================================
   PERFIL, CONFIGURAÇÕES E BACKUP
   ========================================================================= */
function renderPerfil() {
  const p = S.perfil;
  if (p) { $('pf-sexo').value = p.sexo; $('pf-idade').value = p.idade; $('pf-peso').value = p.peso; $('pf-altura').value = p.altura; $('pf-atividade').value = String(p.atividade); $('pf-objetivo').value = p.objetivo; }
  $('cfg-chave').value = S.config.chave || ''; $('cfg-modelo').value = S.config.modelo || '';
  const m = metas();
  if (!m) { $('pf-resultado').innerHTML = ''; return; }
  $('pf-resultado').innerHTML = `<h2>Suas metas diárias</h2>
    <table>
      <tr><td>Gasto basal (Mifflin-St Jeor)</td><td><b>${r0(m.tmb)}</b> kcal</td></tr>
      <tr><td>Gasto total estimado</td><td><b>${r0(m.get)}</b> kcal</td></tr>
      <tr><td>Meta · ${esc(m.obj.nome)}${S.ajusteKcal ? ` (ajuste ${S.ajusteKcal > 0 ? '+' : ''}${S.ajusteKcal})` : ''}</td><td><b>${r0(m.kcal)}</b> kcal</td></tr>
      <tr><td>Proteína (${m.obj.prot} g/kg${m.pesoRef !== S.perfil.peso ? ' do peso de referência ' + r0(m.pesoRef) + ' kg' : ''})</td><td><b>${r0(m.prot)}</b> g</td></tr>
      <tr><td>Gordura (~25%)</td><td><b>${r0(m.gord)}</b> g</td></tr>
      <tr><td>Carboidrato (restante)</td><td><b>${r0(m.carb)}</b> g</td></tr>
      <tr><td>IMC</td><td>${r1(m.imc)}</td></tr>
    </table>
    ${m.abaixoMinimo ? '<p class="erro">A meta foi limitada ao mínimo seguro. Não coma menos que isso sem acompanhamento profissional.</p>' : ''}
    <p class="dica">O gasto calculado é uma estimativa. A aba <b>Peso</b> compara sua tendência real e sugere ajustes depois de 2 semanas.
    Divida a proteína em 3–5 refeições de 25–40 g.</p>`;
}
$('pf-salvar').onclick = () => {
  const p = { sexo: $('pf-sexo').value, idade: +$('pf-idade').value, peso: +$('pf-peso').value, altura: +$('pf-altura').value, atividade: +$('pf-atividade').value, objetivo: $('pf-objetivo').value };
  if (!p.idade || !p.peso || !p.altura) { alert('Preencha idade, peso e altura.'); return; }
  if (p.altura < 100 || p.altura > 250) { alert('Altura deve estar em centímetros (ex: 175).'); return; }
  S.perfil = p;
  if (!S.pesos[hojeISO()]) S.pesos[hojeISO()] = p.peso;
  salvar(); renderPerfil();
  $('pf-resultado').scrollIntoView({ behavior: 'smooth' });
};
$('cfg-salvar').onclick = () => { S.config.chave = $('cfg-chave').value.trim(); S.config.modelo = $('cfg-modelo').value.trim(); salvar(); $('cfg-status').textContent = 'Salvo ✔'; };
$('cfg-testar').onclick = async () => {
  const chave = $('cfg-chave').value.trim().replace(/\s+/g, '');
  $('cfg-chave').value = chave;
  S.config.chave = chave; S.config.modelo = $('cfg-modelo').value.trim(); salvar();
  const st = $('cfg-status');
  if (!chave) { st.innerHTML = '<span class="erro">Cole a chave primeiro.</span>'; return; }
  if (!/^AIza/.test(chave)) st.innerHTML = '<span class="erro">Atenção: chaves do Gemini normalmente começam com "AIza". Confira se copiou a chave certa.</span><br>';
  else st.innerHTML = '';
  st.innerHTML += 'Verificando a chave e os modelos disponíveis…';
  try {
    const lista = await listarModelos(chave);
    if (!lista.length) throw new Error('Sua chave não tem nenhum modelo Gemini disponível.');
    // Testa os modelos em ordem até um responder (pula os sem cota gratuita)
    const tentar = [...new Set([S.config.modelo, ...lista].filter((m) => m && lista.includes(m)))].slice(0, 5);
    let ok = null, ultimoErro = '';
    for (const m of tentar) {
      st.textContent = 'Testando ' + m + '…';
      try { await chamarModelo(m, chave, [{ text: 'Responda só com a palavra OK.' }], false); ok = m; break; }
      catch (e) { ultimoErro = e.message === 'MODELO_INVALIDO' ? 'modelo indisponível' : e.message; }
    }
    if (!ok) throw new Error('Nenhum modelo respondeu. Último erro: ' + ultimoErro);
    S.config.modelo = ok; $('cfg-modelo').value = ok; salvar();
    st.innerHTML = `✅ Funcionando com <b>${esc(ok)}</b>.<br><span class="dica">Modelos disponíveis na sua chave: ${esc(lista.slice(0, 8).join(', '))}</span>`;
  } catch (e) { st.innerHTML = `<span class="erro">❌ ${esc(e.message)}</span>`; }
};
$('bk-exportar').onclick = async () => {
  const copia = { ...S, config: { ...S.config, chave: '' } }; // não exporta a chave da API
  const arq = new File([JSON.stringify(copia, null, 1)], `backup-saude-${hojeISO()}.json`, { type: 'application/json' });
  if (navigator.canShare?.({ files: [arq] })) { try { await navigator.share({ files: [arq] }); return; } catch { /* cancelado */ } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(arq); a.download = arq.name; a.click();
};
$('bk-importar').onclick = () => $('bk-arquivo').click();
$('bk-arquivo').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!confirm('Isso vai substituir os dados atuais pelos do backup. Continuar?')) return;
    const chave = S.config.chave;
    S = Object.assign(structuredClone(PADRAO), d); S.config.chave = S.config.chave || chave;
    salvar(); alert('Backup restaurado!'); abrirTela('hoje');
  } catch { alert('Arquivo inválido.'); }
  e.target.value = '';
};

// ---------- Inicialização ----------
window.abrirTela = abrirTela;
abrirTela(S.perfil ? 'hoje' : 'perfil');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
