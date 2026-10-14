const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();

// Configurações básicas
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
    session({
        secret: 'segredo-super-simples',
        resave: false,
        saveUninitialized: true,
        cookie: { maxAge: 30 * 60 * 1000 } // 30 minutos
    })
);

// Arrays para armazenar dados em memória
let equipes = [];
let jogadores = [];

// Quantidade de jogadores para o elenco ser considerado completo
const ELENCO_MINIMO = 11;

const POSICOES = ['goleiro', 'zagueiro', 'lateral', 'volante', 'meia', 'atacante'];

// Middleware para proteger rotas
function autenticar(req, res, next) {
    if (req.session.logado) {
        next();
    } else {
        res.redirect('/login');
    }
}

// ---------------- HELPERS DE VIEW ----------------

// Escapa texto digitado pelo usuário antes de inserir no HTML
function esc(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const capitalizar = (txt) => txt.charAt(0).toUpperCase() + txt.slice(1);

// Escudo com as iniciais do time e cor fixa derivada do nome
function escudo(nome, grande = false) {
    const iniciais = nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
    let hash = 0;
    for (const c of nome) hash = (hash * 31 + c.charCodeAt(0)) % 360;
    return `<span class="crest ${grande ? 'crest-lg' : ''}" style="background: hsl(${hash}, 55%, 38%);">${esc(iniciais)}</span>`;
}

function statusElenco(qtd) {
    return qtd >= ELENCO_MINIMO
        ? `<span class="badge-soft ok">Elenco completo</span>`
        : `<span class="badge-soft pending">Em formação · ${qtd}/${ELENCO_MINIMO}</span>`;
}

function cabecalho(rotulo, titulo, subtitulo, acoes = '') {
    return `
        <div class="page-header">
            <div>
                <span class="eyebrow">${rotulo}</span>
                <h1 class="page-title">${titulo}</h1>
                ${subtitulo ? `<p class="page-subtitle">${subtitulo}</p>` : ''}
            </div>
            ${acoes ? `<div class="d-flex flex-wrap gap-2">${acoes}</div>` : ''}
        </div>
    `;
}

function estadoVazio(icone, titulo, texto, acao = '') {
    return `
        <div class="empty-state">
            <div class="empty-icon"><i class="bi ${icone}"></i></div>
            <h3>${titulo}</h3>
            <p>${texto}</p>
            ${acao}
        </div>
    `;
}

function alertaErro(erro) {
    return erro ? `
        <div class="alert alert-danger d-flex align-items-center gap-2 mb-4" role="alert">
            <i class="bi bi-exclamation-octagon-fill"></i><span>${erro}</span>
        </div>
    ` : '';
}

// ---------------- LAYOUT ----------------

const HEAD = (titulo) => `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${titulo} | Campeonato de Futebol</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
    <link href="/css/style.css" rel="stylesheet">
`;

// Página interna: sidebar + topbar + conteúdo
function layout(titulo, conteudo, { ativo = '', trilha = [] } = {}) {
    const item = (href, icone, texto, chave) => `
        <li><a class="sidebar-link ${ativo === chave ? 'active' : ''}" href="${href}">
            <i class="bi ${icone}"></i>${texto}
        </a></li>
    `;

    const breadcrumb = [['Início', '/menu'], ...trilha]
        .map(([texto, href], i, arr) => i === arr.length - 1
            ? `<li class="breadcrumb-item active" aria-current="page">${texto}</li>`
            : `<li class="breadcrumb-item"><a href="${href}">${texto}</a></li>`)
        .join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>${HEAD(titulo)}</head>
<body>
<div class="app">
    <aside class="sidebar offcanvas-lg offcanvas-start" tabindex="-1" id="sidebar">
        <div class="offcanvas-body">
            <a class="sidebar-brand" href="/menu">
                <span class="brand-mark"><i class="bi bi-trophy-fill"></i></span>
                <span>
                    <span class="brand-title d-block">Campeonato de Futebol</span>
                    <span class="brand-sub">Portal de Gestão</span>
                </span>
            </a>

            <div class="sidebar-section">Geral</div>
            <ul class="sidebar-nav">
                ${item('/menu', 'bi-grid-1x2', 'Painel', 'menu')}
            </ul>

            <div class="sidebar-section">Competição</div>
            <ul class="sidebar-nav">
                ${item('/equipes', 'bi-shield', 'Times', 'equipes')}
                ${item('/equipes/cadastrar', 'bi-shield-plus', 'Inscrever time', 'equipes-novo')}
                ${item('/jogadores', 'bi-people', 'Elencos', 'jogadores')}
                ${item('/jogadores/cadastrar', 'bi-person-plus', 'Registrar jogador', 'jogadores-novo')}
            </ul>

            <div class="sidebar-section">Conta</div>
            <ul class="sidebar-nav">
                ${item('/logout', 'bi-box-arrow-right', 'Sair', 'logout')}
            </ul>

            <div class="sidebar-footer">Temporada ${new Date().getFullYear()}</div>
        </div>
    </aside>

    <div class="app-main">
        <header class="topbar">
            <button class="btn btn-light d-lg-none px-2 py-1" type="button" data-bs-toggle="offcanvas" data-bs-target="#sidebar" aria-label="Abrir menu">
                <i class="bi bi-list fs-5"></i>
            </button>
            <nav aria-label="breadcrumb"><ol class="breadcrumb">${breadcrumb}</ol></nav>
            <div class="user-chip">
                <div class="text-end d-none d-sm-block lh-sm">
                    <div class="fw-semibold">Administrador</div>
                    <div class="text-muted-2 small">Organização</div>
                </div>
                <span class="user-avatar">AD</span>
            </div>
        </header>

        <main class="app-content">
            ${conteudo}
        </main>

        <footer class="app-footer d-flex flex-wrap justify-content-between gap-2">
            <span>&copy; ${new Date().getFullYear()} Campeonato de Futebol · Portal de Gestão</span>
            <span>Sistema de inscrição de times e atletas</span>
        </footer>
    </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;
}

// Tela de login (reutilizada para exibir erro)
function telaLogin(erro = '') {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>${HEAD('Acesso')}</head>
<body>
<div class="auth">
    <section class="auth-hero">
        <div class="d-flex align-items-center gap-2">
            <span class="brand-mark"><i class="bi bi-trophy-fill"></i></span>
            <span class="fw-semibold">Campeonato de Futebol</span>
        </div>
        <div>
            <span class="eyebrow" style="color:#7cc4ff;">Portal de Gestão</span>
            <h1 class="mb-3">Inscrição oficial de times e atletas</h1>
            <p>Gerencie os times participantes, registre jogadores e acompanhe a formação dos elencos da temporada.</p>
        </div>
        <div class="auth-stats">
            <div><strong>${equipes.length}</strong><span>Times</span></div>
            <div><strong>${jogadores.length}</strong><span>Atletas</span></div>
            <div><strong>${new Date().getFullYear()}</strong><span>Temporada</span></div>
        </div>
    </section>

    <section class="auth-form-wrap">
        <div class="auth-form">
            <div class="d-lg-none d-flex align-items-center gap-2 mb-4">
                <span class="brand-mark"><i class="bi bi-trophy-fill"></i></span>
                <span class="fw-semibold">Campeonato de Futebol</span>
            </div>
            <h2 class="h3 mb-1">Acessar o portal</h2>
            <p class="text-muted-2 mb-4">Entre com suas credenciais da organização.</p>

            ${alertaErro(erro)}

            <form method="POST" action="/login">
                <div class="mb-3">
                    <label class="form-label" for="usuario">Usuário</label>
                    <div class="input-group">
                        <span class="input-group-text bg-white"><i class="bi bi-person"></i></span>
                        <input class="form-control" type="text" id="usuario" name="usuario" placeholder="Seu usuário" required autofocus>
                    </div>
                </div>
                <div class="mb-4">
                    <label class="form-label" for="senha">Senha</label>
                    <div class="input-group">
                        <span class="input-group-text bg-white"><i class="bi bi-lock"></i></span>
                        <input class="form-control" type="password" id="senha" name="senha" placeholder="••••••" required>
                    </div>
                </div>
                <button class="btn btn-primary w-100 py-2" type="submit">Entrar <i class="bi bi-arrow-right ms-1"></i></button>
            </form>

            <p class="text-muted-2 small mt-4 mb-0"><i class="bi bi-shield-lock me-1"></i>Acesso restrito à organização do campeonato.</p>
        </div>
    </section>
</div>
</body>
</html>`;
}

// ---------------- ROTAS INICIAIS ----------------

// Raiz redireciona para o login
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Tela de login
app.get('/login', (req, res) => {
    res.send(telaLogin());
});

// Validação do login
app.post('/login', (req, res) => {
    const { usuario, senha } = req.body;

    if (usuario === 'admin' && senha === '123') {
        req.session.logado = true;

        const agora = new Date().toLocaleString('pt-BR');
        res.cookie('ultimoAcesso', agora, { maxAge: 365 * 24 * 60 * 60 * 1000 });

        res.redirect('/menu');
    } else {
        res.status(401).send(telaLogin('Usuário ou senha inválidos.'));
    }
});

// Painel principal
app.get('/menu', autenticar, (req, res) => {
    const ultimo = req.cookies.ultimoAcesso || 'Primeiro acesso';
    const completos = equipes.filter(e => jogadores.filter(j => j.equipeId === e.id).length >= ELENCO_MINIMO).length;

    const kpi = (rotulo, valor, icone, pequeno = false) => `
        <div class="col-sm-6 col-xl-3">
            <div class="panel kpi h-100">
                <div class="kpi-label">${rotulo}</div>
                <div class="kpi-value ${pequeno ? 'small-value' : ''}">${valor}</div>
                <span class="kpi-icon"><i class="bi ${icone}"></i></span>
            </div>
        </div>
    `;

    const atalho = (href, icone, titulo, descricao) => `
        <a href="${href}" class="quick-action">
            <span class="qa-icon"><i class="bi ${icone}"></i></span>
            <span>
                <span class="fw-semibold d-block">${titulo}</span>
                <span class="small text-muted-2">${descricao}</span>
            </span>
            <i class="bi bi-chevron-right qa-arrow"></i>
        </a>
    `;

    let recentes;
    if (equipes.length === 0) {
        recentes = estadoVazio('bi-shield', 'Nenhum time inscrito', 'Inscreva o primeiro time para começar a montar a competição.',
            `<a class="btn btn-primary" href="/equipes/cadastrar"><i class="bi bi-plus-lg me-1"></i>Inscrever time</a>`);
    } else {
        const linhas = equipes.slice(-5).reverse().map(e => {
            const qtd = jogadores.filter(j => j.equipeId === e.id).length;
            return `
                <tr>
                    <td><div class="d-flex align-items-center gap-3">${escudo(e.nome)}<span class="fw-semibold">${esc(e.nome)}</span></div></td>
                    <td>${esc(e.tecnico)}</td>
                    <td>${statusElenco(qtd)}</td>
                </tr>
            `;
        }).join('');
        recentes = `
            <div class="table-responsive">
                <table class="table table-pro table-hover">
                    <thead><tr><th>Time</th><th>Técnico</th><th>Situação</th></tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>
        `;
    }

    res.send(layout('Painel', `
        ${cabecalho('Visão geral', 'Painel da competição', 'Acompanhe as inscrições de times e atletas da temporada.')}

        <div class="row g-3 mb-4">
            ${kpi('Times inscritos', equipes.length, 'bi-shield')}
            ${kpi('Atletas registrados', jogadores.length, 'bi-people')}
            ${kpi('Elencos completos', `${completos}<span class="fs-6 text-muted-2 fw-semibold"> / ${equipes.length}</span>`, 'bi-check2-circle')}
            ${kpi('Último acesso', esc(ultimo), 'bi-clock-history', true)}
        </div>

        <div class="row g-4">
            <div class="col-xl-8">
                <div class="panel h-100">
                    <div class="panel-header">
                        <h2 class="panel-title">Times inscritos recentemente</h2>
                        <a class="small fw-semibold text-decoration-none" href="/equipes">Ver todos <i class="bi bi-arrow-right"></i></a>
                    </div>
                    ${recentes}
                </div>
            </div>
            <div class="col-xl-4">
                <div class="panel h-100">
                    <div class="panel-header"><h2 class="panel-title">Ações rápidas</h2></div>
                    <div class="panel-body d-grid gap-2">
                        ${atalho('/equipes/cadastrar', 'bi-shield-plus', 'Inscrever time', 'Cadastro de novo participante')}
                        ${atalho('/jogadores/cadastrar', 'bi-person-plus', 'Registrar jogador', 'Adicionar atleta a um elenco')}
                        ${atalho('/jogadores', 'bi-people', 'Consultar elencos', 'Atletas por time')}
                    </div>
                </div>
            </div>
        </div>
    `, { ativo: 'menu', trilha: [['Painel']] }));
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});


// ---------------- TIMES ----------------

let ultimoIdEquipe = 1;

function telaCadastroTime(erro = '', v = {}) {
    return layout('Inscrever time', `
        ${cabecalho('Times', 'Inscrever time', 'Preencha os dados do time participante e do técnico responsável.')}

        <div class="row">
            <div class="col-xl-9">
                <form class="panel" method="POST" action="/equipes/cadastrar">
                    <div class="panel-body p-4">
                        ${alertaErro(erro)}

                        <div class="form-section">
                            <div class="form-section-title">Dados do time</div>
                            <p class="form-section-desc">Nome oficial que aparecerá nas tabelas da competição.</p>
                            <div class="row g-3">
                                <div class="col-md-8">
                                    <label class="form-label" for="nomeEquipe">Nome do time<span class="req">*</span></label>
                                    <input class="form-control" type="text" id="nomeEquipe" name="nomeEquipe" value="${esc(v.nomeEquipe)}" required>
                                </div>
                            </div>
                        </div>

                        <div class="form-section">
                            <div class="form-section-title">Técnico responsável</div>
                            <p class="form-section-desc">Contato oficial da organização com o time.</p>
                            <div class="row g-3">
                                <div class="col-md-6">
                                    <label class="form-label" for="tecnico">Nome completo<span class="req">*</span></label>
                                    <input class="form-control" type="text" id="tecnico" name="tecnico" value="${esc(v.tecnico)}" required>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label" for="telefone">Telefone / WhatsApp<span class="req">*</span></label>
                                    <input class="form-control" type="tel" id="telefone" name="telefone" value="${esc(v.telefone)}" placeholder="(00) 00000-0000" required>
                                    <div class="form-text">Inclua o DDD.</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="form-actions">
                        <a class="btn btn-light" href="/equipes">Cancelar</a>
                        <button class="btn btn-primary" type="submit"><i class="bi bi-check-lg me-1"></i>Inscrever time</button>
                    </div>
                </form>
            </div>
        </div>
    `, { ativo: 'equipes-novo', trilha: [['Times', '/equipes'], ['Inscrever time']] });
}

app.get('/equipes/cadastrar', autenticar, (req, res) => {
    res.send(telaCadastroTime());
});

app.post('/equipes/cadastrar', autenticar, (req, res) => {
    const { nomeEquipe, tecnico, telefone } = req.body;

    if (!nomeEquipe || !tecnico || !telefone ||
        nomeEquipe.trim() === '' || tecnico.trim() === '' || telefone.trim() === '') {

        return res.status(400).send(telaCadastroTime('Preencha todos os campos obrigatórios.', req.body));
    }

    equipes.push({
        id: ultimoIdEquipe++,
        nome: nomeEquipe.trim(),
        tecnico: tecnico.trim(),
        telefone: telefone.trim()
    });

    res.redirect('/equipes');
});

app.get('/equipes', autenticar, (req, res) => {
    let conteudo;

    if (equipes.length === 0) {
        conteudo = estadoVazio('bi-shield', 'Nenhum time inscrito', 'Os times inscritos na competição aparecerão aqui.',
            `<a class="btn btn-primary" href="/equipes/cadastrar"><i class="bi bi-plus-lg me-1"></i>Inscrever time</a>`);
    } else {
        const linhas = equipes.map(equipe => {
            const qtd = jogadores.filter(j => j.equipeId === equipe.id).length;
            return `
                <tr>
                    <td><div class="d-flex align-items-center gap-3">${escudo(equipe.nome)}
                        <div><div class="fw-semibold">${esc(equipe.nome)}</div><div class="small text-muted-2">ID #${String(equipe.id).padStart(3, '0')}</div></div>
                    </div></td>
                    <td>${esc(equipe.tecnico)}</td>
                    <td class="fw-tab"><i class="bi bi-telephone text-muted-2 me-1"></i>${esc(equipe.telefone)}</td>
                    <td class="text-center fw-semibold fw-tab">${qtd}</td>
                    <td>${statusElenco(qtd)}</td>
                </tr>
            `;
        }).join('');
        conteudo = `
            <div class="table-responsive">
                <table class="table table-pro table-hover">
                    <thead>
                        <tr><th>Time</th><th>Técnico</th><th>Contato</th><th class="text-center">Atletas</th><th>Situação</th></tr>
                    </thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>
        `;
    }

    res.send(layout('Times', `
        ${cabecalho('Competição', 'Times', `${equipes.length} time(s) inscrito(s) na temporada.`,
            `<a class="btn btn-primary" href="/equipes/cadastrar"><i class="bi bi-plus-lg me-1"></i>Inscrever time</a>`)}
        <div class="panel">${conteudo}</div>
    `, { ativo: 'equipes', trilha: [['Times']] }));
});


// ---------------- JOGADORES ----------------

function telaCadastroJogador(erro = '', v = {}) {
    if (equipes.length === 0) {
        return layout('Registrar jogador', `
            ${cabecalho('Elencos', 'Registrar jogador')}
            <div class="panel">
                ${estadoVazio('bi-exclamation-triangle', 'Nenhum time inscrito',
                    'É necessário inscrever pelo menos um time antes de registrar jogadores.',
                    `<a class="btn btn-primary" href="/equipes/cadastrar"><i class="bi bi-shield-plus me-1"></i>Inscrever time</a>`)}
            </div>
        `, { ativo: 'jogadores-novo', trilha: [['Elencos', '/jogadores'], ['Registrar jogador']] });
    }

    const optionsEquipes = equipes.map(e =>
        `<option value="${e.id}" ${String(v.equipeId) === String(e.id) ? 'selected' : ''}>${esc(e.nome)}</option>`
    ).join('');

    const optionsPosicoes = POSICOES.map(p =>
        `<option value="${p}" ${v.posicao === p ? 'selected' : ''}>${capitalizar(p)}</option>`
    ).join('');

    return layout('Registrar jogador', `
        ${cabecalho('Elencos', 'Registrar jogador', 'Cadastre um atleta e vincule-o ao elenco de um time inscrito.')}

        <div class="row">
            <div class="col-xl-9">
                <form class="panel" method="POST" action="/jogadores/cadastrar">
                    <div class="panel-body p-4">
                        ${alertaErro(erro)}

                        <div class="form-section">
                            <div class="form-section-title">Dados pessoais</div>
                            <p class="form-section-desc">Identificação do atleta.</p>
                            <div class="row g-3">
                                <div class="col-md-6">
                                    <label class="form-label" for="nome">Nome completo<span class="req">*</span></label>
                                    <input class="form-control" type="text" id="nome" name="nome" value="${esc(v.nome)}" required>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label" for="apelido">Apelido<span class="req">*</span></label>
                                    <input class="form-control" type="text" id="apelido" name="apelido" value="${esc(v.apelido)}" required>
                                    <div class="form-text">Nome exibido na súmula.</div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label" for="genero">Gênero<span class="req">*</span></label>
                                    <input class="form-control" type="text" id="genero" name="genero" value="${esc(v.genero)}" required>
                                </div>
                            </div>
                        </div>

                        <div class="form-section">
                            <div class="form-section-title">Dados esportivos</div>
                            <p class="form-section-desc">Time, posição e numeração do atleta.</p>
                            <div class="row g-3">
                                <div class="col-md-6">
                                    <label class="form-label" for="equipeId">Time<span class="req">*</span></label>
                                    <select class="form-select" id="equipeId" name="equipeId" required>
                                        ${optionsEquipes}
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label" for="posicao">Posição<span class="req">*</span></label>
                                    <select class="form-select" id="posicao" name="posicao" required>
                                        <option value="">Selecione...</option>
                                        ${optionsPosicoes}
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label" for="numero">Nº da camisa<span class="req">*</span></label>
                                    <input class="form-control" type="number" id="numero" name="numero" value="${esc(v.numero)}" min="1" max="99" placeholder="1–99" required>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="form-actions">
                        <a class="btn btn-light" href="/jogadores">Cancelar</a>
                        <button class="btn btn-primary" type="submit"><i class="bi bi-check-lg me-1"></i>Registrar jogador</button>
                    </div>
                </form>
            </div>
        </div>
    `, { ativo: 'jogadores-novo', trilha: [['Elencos', '/jogadores'], ['Registrar jogador']] });
}

app.get('/jogadores/cadastrar', autenticar, (req, res) => {
    res.send(telaCadastroJogador());
});

app.post('/jogadores/cadastrar', autenticar, (req, res) => {
    const { nome, apelido, posicao, numero, genero, equipeId } = req.body;

    // Validação no servidor
    if (!nome || !apelido || !posicao || !numero || !genero || !equipeId ||
        nome.trim() === '' || apelido.trim() === '' ||
        posicao.trim() === '' || numero.trim() === '' ||
        genero.trim() === '' || equipeId.trim() === '') {

        return res.status(400).send(telaCadastroJogador('Preencha todos os campos obrigatórios.', req.body));
    }

    const idEquipe = parseInt(equipeId);

    jogadores.push({
        nome: nome.trim(),
        apelido: apelido.trim(),
        posicao: posicao.trim(),
        numero: parseInt(numero),
        genero: genero.trim(),
        equipeId: idEquipe
    });

    res.redirect('/jogadores');
});

app.get('/jogadores', autenticar, (req, res) => {
    let conteudo = '';

    if (equipes.length === 0 || jogadores.length === 0) {
        conteudo = `<div class="panel">${estadoVazio('bi-people', 'Nenhum atleta registrado',
            'Os elencos aparecerão aqui conforme os jogadores forem registrados.',
            `<a class="btn btn-primary" href="/jogadores/cadastrar"><i class="bi bi-person-plus me-1"></i>Registrar jogador</a>`)}</div>`;
    } else {
        equipes.forEach(equipe => {
            const jogadoresDaEquipe = jogadores
                .filter(j => j.equipeId === equipe.id)
                .sort((a, b) => a.numero - b.numero);

            let corpo;
            if (jogadoresDaEquipe.length === 0) {
                corpo = `<div class="panel-body text-muted-2 small">Nenhum atleta registrado para este time.</div>`;
            } else {
                const linhas = jogadoresDaEquipe.map(j => `
                    <tr>
                        <td><span class="shirt">${j.numero}</span></td>
                        <td><div class="fw-semibold">${esc(j.apelido)}</div><div class="small text-muted-2">${esc(j.nome)}</div></td>
                        <td><span class="pos-tag">${esc(j.posicao)}</span></td>
                        <td>${esc(j.genero)}</td>
                    </tr>
                `).join('');
                corpo = `
                    <div class="table-responsive">
                        <table class="table table-pro table-hover">
                            <thead><tr><th style="width: 90px;">Nº</th><th style="width: 40%;">Atleta</th><th style="width: 25%;">Posição</th><th>Gênero</th></tr></thead>
                            <tbody>${linhas}</tbody>
                        </table>
                    </div>
                `;
            }

            conteudo += `
                <div class="panel mb-4">
                    <div class="panel-header">
                        <div class="d-flex align-items-center gap-3">
                            ${escudo(equipe.nome, true)}
                            <div>
                                <h2 class="panel-title">${esc(equipe.nome)}</h2>
                                <div class="small text-muted-2">Técnico: ${esc(equipe.tecnico)}</div>
                            </div>
                        </div>
                        ${statusElenco(jogadoresDaEquipe.length)}
                    </div>
                    ${corpo}
                </div>
            `;
        });
    }

    res.send(layout('Elencos', `
        ${cabecalho('Competição', 'Elencos', `${jogadores.length} atleta(s) registrado(s) em ${equipes.length} time(s).`,
            `<a class="btn btn-primary" href="/jogadores/cadastrar"><i class="bi bi-person-plus me-1"></i>Registrar jogador</a>`)}
        ${conteudo}
    `, { ativo: 'jogadores', trilha: [['Elencos']] }));
});


// Iniciar servidor
app.listen(4000, () => {
    console.log('Servidor rodando em http://localhost:4000');
});
