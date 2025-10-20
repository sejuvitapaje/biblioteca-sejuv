const firebaseConfig = {
    apiKey: "AIzaSyBgCJzenRbgpScy-LWi3sEccNvHXbr1uuY",
    authDomain: "biblioteca-b97fb.firebaseapp.com",
    projectId: "biblioteca-b97fb",
    storageBucket: "biblioteca-b97fb.firebasestorage.app",
    messagingSenderId: "699649848975",
    appId: "1:699649848975:web:187b6647f5b2fbc6a622fa",
    measurementId: "G-N9FF16T3KF"
};

// ⚡ SISTEMA OFFLINE-FIRST - MÍNIMO DE LEITURAS
let sistema = {
    cache: {
        livros: [],
        alugueis: [],
        timestamp: null,
        carregado: false
    },
    estado: {
        paginaAtual: 1,
        livrosPorPagina: 20,
        termoBusca: '',
        filtroPrateleira: ''
    }
};

// ✅ CARREGA CACHE DO LOCALSTORAGE
function carregarCache() {
    try {
        const cacheSalvo = localStorage.getItem('biblioteca_cache');
        if (cacheSalvo) {
            const dados = JSON.parse(cacheSalvo);
            // Cache válido por 24 horas
            if (Date.now() - dados.timestamp < 86400000) {
                sistema.cache.livros = dados.livros || [];
                sistema.cache.alugueis = dados.alugueis || [];
                sistema.cache.timestamp = dados.timestamp;
                sistema.cache.carregado = sistema.cache.livros.length > 0;
                console.log(`♻️ Cache carregado: ${sistema.cache.livros.length} livros`);
                return true;
            }
        }
    } catch (e) {
        console.log("ℹ️ Sem cache anterior");
    }
    return false;
}

// ✅ SALVA CACHE NO LOCALSTORAGE
function salvarCache() {
    try {
        sistema.cache.timestamp = Date.now();
        localStorage.setItem('biblioteca_cache', JSON.stringify(sistema.cache));
    } catch (e) {
        // Ignora erro
    }
}

// ✅ INICIALIZAÇÃO SEGURA
let db;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log("🔥 Firebase conectado");
} catch (error) {
    console.error("❌ Erro no Firebase");
}

document.addEventListener('DOMContentLoaded', function() {
    console.log("📚 Sistema carregado - Modo Offline First");
    
    // ⚡ PRIMEIRO: TENTA CACHE LOCAL (INSTANTÂNEO)
    const temCache = carregarCache();
    
    // Configura interfaces
    const formCadastro = document.getElementById('formCadastro');
    if (formCadastro) formCadastro.addEventListener('submit', cadastrarLivro);
    
    if (document.getElementById('livrosList')) {
        console.log("📖 Página da biblioteca");
        inicializarPaginacao();
        inicializarFiltros();
        
        // ⚡ MOSTRA CACHE IMEDIATAMENTE (se tiver)
        if (temCache) {
            atualizarInterface();
        }
    }
    
    if (document.getElementById('buscaLivroAlugar')) {
        console.log("💰 Página de aluguel");
        inicializarBuscaAluguel();
        // ⚡ NÃO CARREGA AUTOMATICAMENTE
    }
    
    if (document.getElementById('buscaLivroDevolver')) {
        console.log("🔄 Página de devolução");
        inicializarBuscaDevolucao();
        // ⚡ NÃO CARREGA AUTOMATICAMENTE
    }
    
    // Modal
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.querySelector('.close').addEventListener('click', fecharModal);
        window.addEventListener('click', (e) => e.target === modal && fecharModal());
        document.addEventListener('keydown', (e) => e.key === 'Escape' && fecharModal());
    }
    
    // ⚡ SEGUNDO: SE NÃO TEM CACHE, CARREGA DO FIREBASE (APENAS 1-2 LEITURAS)
    if (!temCache && db) {
        console.log("🔄 Carregando dados do Firebase...");
        setTimeout(() => carregarDadosFirebase(), 1000);
    }
});

// ⚡ FUNÇÃO PRINCIPAL - MÁXIMO 2 LEITURAS
async function carregarDadosFirebase() {
    if (!db || sistema.cache.carregado) return;
    
    try {
        console.log("📥 Iniciando leitura do Firebase...");
        
        // ⚡ LEITURA 1: LIVROS
        console.log("📚 Buscando livros...");
        const livrosSnapshot = await db.collection('livros')
            .orderBy('dataCadastro', 'desc')
            .get();
        
        sistema.cache.livros = livrosSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // ⚡ LEITURA 2: ALUGUÉIS ATIVOS
        console.log("📋 Buscando aluguéis...");
        const alugueisSnapshot = await db.collection('alugueis')
            .where('dataDevolucao', '==', null)
            .get();
        
        sistema.cache.alugueis = alugueisSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        sistema.cache.carregado = true;
        sistema.cache.timestamp = Date.now();
        salvarCache();
        
        console.log(`✅ Dados carregados: ${sistema.cache.livros.length} livros, ${sistema.cache.alugueis.length} aluguéis`);
        console.log("🎯 TOTAL DE LEITURAS: 2 (apenas nesta sessão)");
        
        // Atualiza interface se estiver na página certa
        if (document.getElementById('livrosList')) {
            atualizarInterface();
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar dados:', error);
    }
}

// ⚡ ATUALIZA INTERFACE COM DADOS LOCAIS (0 LEITURAS)
function atualizarInterface() {
    if (!sistema.cache.carregado) return;
    
    // Atualiza contador
    const totalElement = document.getElementById('totalLivros');
    if (totalElement) {
        totalElement.textContent = `${sistema.cache.livros.length} livros cadastrados`;
    }
    
    // Aplica filtros e paginação
    aplicarFiltrosEPaginacao();
}

// ✅ INICIALIZA FILTROS
function inicializarFiltros() {
    const filtroPrateleiraSelect = document.getElementById('filtroPrateleira');
    const limparFiltrosBtn = document.getElementById('limparFiltros');
    
    if (filtroPrateleiraSelect) {
        // ⚡ PRATELEIRAS FIXAS: 1 a 21
        filtroPrateleiraSelect.innerHTML = '<option value="">Todas as prateleiras</option>';
        for (let i = 1; i <= 21; i++) {
            filtroPrateleiraSelect.innerHTML += `<option value="${i}">Prateleira ${i}</option>`;
        }
        
        filtroPrateleiraSelect.addEventListener('change', (e) => {
            sistema.estado.filtroPrateleira = e.target.value;
            sistema.estado.paginaAtual = 1;
            aplicarFiltrosEPaginacao();
        });
    }
    
    if (limparFiltrosBtn) {
        limparFiltrosBtn.addEventListener('click', () => {
            sistema.estado.filtroPrateleira = '';
            sistema.estado.termoBusca = '';
            sistema.estado.paginaAtual = 1;
            
            if (filtroPrateleiraSelect) filtroPrateleiraSelect.value = '';
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';
            
            aplicarFiltrosEPaginacao();
        });
    }
}

// ⚡ APLICA FILTROS E PAGINAÇÃO (0 LEITURAS)
function aplicarFiltrosEPaginacao() {
    if (!sistema.cache.carregado) return;
    
    let livrosFiltrados = sistema.cache.livros;
    
    // Filtro por texto
    if (sistema.estado.termoBusca) {
        livrosFiltrados = livrosFiltrados.filter(livro => 
            livro.livro.toLowerCase().includes(sistema.estado.termoBusca) || 
            livro.autor.toLowerCase().includes(sistema.estado.termoBusca)
        );
    }
    
    // Filtro por prateleira
    if (sistema.estado.filtroPrateleira) {
        livrosFiltrados = livrosFiltrados.filter(livro => 
            livro.prateleira === sistema.estado.filtroPrateleira
        );
    }
    
    // Paginação
    const startIndex = (sistema.estado.paginaAtual - 1) * sistema.estado.livrosPorPagina;
    const endIndex = startIndex + sistema.estado.livrosPorPagina;
    const livrosPagina = livrosFiltrados.slice(startIndex, endIndex);
    
    console.log(`🔍 Filtros aplicados: ${livrosFiltrados.length} livros (0 LEITURAS)`);
    exibirLivros(livrosPagina);
    atualizarControlesPaginacao(livrosFiltrados.length);
}

// ⚡ BUSCA (0 LEITURAS)
function filtrarLivros() {
    sistema.estado.termoBusca = document.getElementById('searchInput').value.toLowerCase();
    sistema.estado.paginaAtual = 1;
    aplicarFiltrosEPaginacao();
}

// ⚡ PAGINAÇÃO (0 LEITURAS)
function mudarPagina(direction) {
    if (direction === 'next') {
        sistema.estado.paginaAtual++;
    } else {
        sistema.estado.paginaAtual--;
    }
    aplicarFiltrosEPaginacao();
}

// ⚡ LIVROS DISPONÍVEIS - SÓ CARREGA QUANDO PRECISA
async function carregarLivrosDisponiveis() {
    const grid = document.getElementById('livrosDisponiveisGrid');
    if (!grid) return;
    
    grid.innerHTML = '<div class="loading">Carregando...</div>';
    
    // ⚡ SE NÃO TEM CACHE, CARREGA PRIMEIRO
    if (!sistema.cache.carregado && db) {
        await carregarDadosFirebase();
    }
    
    if (sistema.cache.carregado) {
        const livrosDisponiveis = sistema.cache.livros.map(livro => {
            const alugueisDoLivro = sistema.cache.alugueis.filter(a => a.livroId === livro.id);
            const quantidadeAlugada = alugueisDoLivro.reduce((total, aluguel) => total + aluguel.quantidade, 0);
            const quantidadeDisponivel = livro.quantidade - quantidadeAlugada;
            
            return {
                ...livro,
                quantidadeDisponivel,
                quantidadeAlugada
            };
        }).filter(livro => livro.quantidadeDisponivel > 0);
        
        window.livrosDisponiveisFiltrados = livrosDisponiveis;
        exibirLivrosDisponiveis(livrosDisponiveis);
    }
}

// ⚡ LIVROS ALUGADOS - SÓ CARREGA QUANDO PRECISA
async function carregarLivrosAlugados() {
    const grid = document.getElementById('livrosAlugadosGrid');
    if (!grid) return;
    
    grid.innerHTML = '<div class="loading">Carregando...</div>';
    
    // ⚡ SE NÃO TEM CACHE, CARREGA PRIMEIRO
    if (!sistema.cache.carregado && db) {
        await carregarDadosFirebase();
    }
    
    if (sistema.cache.carregado) {
        const livrosAlugados = sistema.cache.alugueis.map(aluguel => {
            const livro = sistema.cache.livros.find(l => l.id === aluguel.livroId);
            return livro ? {
                id: aluguel.id,
                livroId: aluguel.livroId,
                livro: livro.livro,
                autor: livro.autor,
                clienteNome: aluguel.clienteNome,
                quantidade: aluguel.quantidade,
                dataAluguel: aluguel.dataAluguel
            } : null;
        }).filter(Boolean);
        
        window.livrosAlugadosFiltrados = livrosAlugados;
        exibirLivrosAlugados(livrosAlugados);
    }
}

// ⚡ QUANDO DADOS MUDAM - INVALIDA CACHE
function invalidarCache() {
    sistema.cache.carregado = false;
    sistema.cache.livros = [];
    sistema.cache.alugueis = [];
    sistema.cache.timestamp = null;
    
    try {
        localStorage.removeItem('biblioteca_cache');
    } catch (e) {
        // Ignora
    }
    
    console.log("🔄 Cache invalidado");
}

// ⚡ CADASTRAR LIVRO - 1 ESCRITA
async function cadastrarLivro(e) {
    e.preventDefault();
    
    if (!db) {
        alert("Erro: Firebase não disponível");
        return;
    }
    
    const livroData = {
        livro: document.getElementById('livro').value.trim(),
        autor: document.getElementById('autor').value.trim(),
        categoria: document.getElementById('categoria').value.trim(),
        quantidade: parseInt(document.getElementById('quantidade').value),
        prateleira: document.getElementById('prateleira').value.trim(),
        bandeja: document.getElementById('bandeja').value.trim(),
        dataCadastro: new Date()
    };
    
    // Validação
    if (Object.values(livroData).some(valor => 
        valor === '' || (typeof valor === 'string' && !valor.trim()) || (typeof valor === 'number' && isNaN(valor))
    )) {
        alert("Por favor, preencha todos os campos corretamente!");
        return;
    }
    
    try {
        await db.collection('livros').add(livroData);
        invalidarCache();
        document.getElementById('formCadastro').reset();
        
        // Feedback
        const successMessage = document.getElementById('successMessage');
        if (successMessage) {
            successMessage.style.display = 'block';
            setTimeout(() => successMessage.style.display = 'none', 3000);
        }
        
        console.log("✅ Livro cadastrado");
        
    } catch (error) {
        console.error('❌ Erro ao cadastrar:', error);
        alert('Erro ao cadastrar livro.');
    }
}

// ⚡ EDITAR LIVRO - 1 ESCRITA
async function salvarEdicao() {
    if (!window.livroEditando || !db) return;
    
    try {
        await db.collection('livros').doc(window.livroEditando.id).update({
            livro: document.getElementById('editLivro').value.trim(),
            autor: document.getElementById('editAutor').value.trim(),
            categoria: document.getElementById('editCategoria').value.trim(),
            quantidade: parseInt(document.getElementById('editQuantidade').value),
            prateleira: document.getElementById('editPrateleira').value.trim(),
            bandeja: document.getElementById('editBandeja').value.trim()
        });
        
        invalidarCache();
        fecharModal();
        alert('Livro atualizado com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro ao editar:', error);
        alert('Erro ao atualizar livro.');
    }
}

// ⚡ EXCLUIR LIVRO - 1 ESCRITA
async function excluirLivro(livroId) {
    if (!db) return;
    
    if (confirm('Tem certeza que deseja excluir este livro?')) {
        try {
            await db.collection('livros').doc(livroId).delete();
            invalidarCache();
            alert('Livro excluído com sucesso!');
        } catch (error) {
            console.error('❌ Erro ao excluir:', error);
            alert('Erro ao excluir livro.');
        }
    }
}

// ⚡ ALUGAR LIVRO - 1 ESCRITA
async function alugarLivro() {
    if (!db) return;
    
    const clienteNome = document.getElementById('clienteNome').value.trim();
    const quantidade = parseInt(document.getElementById('quantidadeAlugar').value);
    
    if (!window.livroSelecionadoAlugar || !clienteNome || !quantidade) {
        alert("Por favor, preencha todos os campos!");
        return;
    }
    
    try {
        await db.collection('alugueis').add({
            livroId: window.livroSelecionadoAlugar.id,
            clienteNome: clienteNome,
            quantidade: quantidade,
            dataAluguel: new Date(),
            dataDevolucao: null,
            prazoDevolucao: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });
        
        invalidarCache();
        document.getElementById('clienteNome').value = '';
        document.getElementById('livroSelecionadoCard').style.display = 'none';
        window.livroSelecionadoAlugar = null;
        
        alert('Livro alugado com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro ao alugar:', error);
        alert('Erro ao alugar livro.');
    }
}

// ⚡ DEVOLVER LIVRO - 1 ESCRITA
async function devolverLivro() {
    if (!db) return;
    
    const quantidade = parseInt(document.getElementById('quantidadeDevolver').value);
    
    if (!window.livroSelecionadoDevolver || !quantidade) {
        alert("Selecione um livro para devolver!");
        return;
    }
    
    try {
        if (quantidade === window.livroSelecionadoDevolver.quantidade) {
            await db.collection('alugueis').doc(window.livroSelecionadoDevolver.id).update({
                dataDevolucao: new Date()
            });
        } else {
            const aluguelDoc = await db.collection('alugueis').doc(window.livroSelecionadoDevolver.id).get();
            const aluguel = aluguelDoc.data();
            await db.collection('alugueis').doc(window.livroSelecionadoDevolver.id).update({
                quantidade: aluguel.quantidade - quantidade
            });
        }
        
        invalidarCache();
        document.getElementById('livroDevolucaoSelecionadoCard').style.display = 'none';
        window.livroSelecionadoDevolver = null;
        
        alert('Livro devolvido com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro ao devolver:', error);
        alert('Erro ao devolver livro.');
    }
}

// FUNÇÕES DE INTERFACE (mantidas)
function exibirLivros(livros) {
    const livrosList = document.getElementById('livrosList');
    if (!livrosList) return;
    
    if (livros.length === 0) {
        livrosList.innerHTML = '<div class="empty-state">Nenhum livro encontrado</div>';
        return;
    }
    
    livrosList.innerHTML = livros.map(livro => {
        const alugueisDoLivro = sistema.cache.alugueis.filter(a => a.livroId === livro.id);
        const quantidadeAlugada = alugueisDoLivro.reduce((total, aluguel) => total + aluguel.quantidade, 0);
        const quantidadeDisponivel = livro.quantidade - quantidadeAlugada;
        const disponivel = quantidadeDisponivel > 0;
        
        return `
        <div class="livro-card ${!disponivel ? 'alugado' : ''}">
            <h3>${livro.livro} ${!disponivel ? '<span class="status-indisponivel">(Indisponível)</span>' : ''}</h3>
            <div class="livro-info">
                <strong>Autor:</strong> ${livro.autor}
            </div>
            <div class="livro-info">
                <strong>Categoria:</strong> ${livro.categoria}
            </div>
            <div class="livro-info">
                <strong>Quantidade Total:</strong> ${livro.quantidade}
            </div>
            <div class="livro-info">
                <strong>Quantidade Disponível:</strong> ${quantidadeDisponivel}
            </div>
            <div class="livro-info">
                <strong>Quantidade Alugada:</strong> ${quantidadeAlugada}
            </div>
            <div class="livro-info">
                <strong>Localização:</strong> Prateleira ${livro.prateleira}, Bandeja ${livro.bandeja}
            </div>
            <div class="livro-info">
                <strong>Status:</strong> 
                <span class="${disponivel ? 'status-disponivel' : 'status-indisponivel'}">
                    ${disponivel ? '📗 Disponível' : '📕 Indisponível'}
                </span>
            </div>
            <div class="data-cadastro">
                <strong>Cadastrado em:</strong> ${new Date(livro.dataCadastro).toLocaleDateString('pt-BR')}
            </div>
            <div class="livro-actions">
                <button class="btn btn-secondary" onclick="editarLivro('${livro.id}')">✏️ Editar</button>
                <button class="btn btn-danger" onclick="excluirLivro('${livro.id}')">🗑️ Excluir</button>
            </div>
        </div>
        `;
    }).join('');
}

function exibirLivrosDisponiveis(livros) {
    const grid = document.getElementById('livrosDisponiveisGrid');
    if (!grid) return;
    
    if (livros.length === 0) {
        grid.innerHTML = '<div class="empty-state">Nenhum livro disponível</div>';
        return;
    }
    
    grid.innerHTML = livros.map(livro => {
        const classeQuantidade = livro.quantidadeDisponivel <= 2 ? 'pouco' : '';
        return `
        <div class="livro-disponivel-card" onclick="selecionarLivroAlugar('${livro.id}')">
            <h4>${livro.livro}</h4>
            <div class="livro-disponivel-info">
                <strong>Autor:</strong> ${livro.autor}
            </div>
            <div class="livro-disponivel-info">
                <strong>Disponível:</strong> 
                <span class="quantidade-info ${classeQuantidade}">${livro.quantidadeDisponivel}</span>
            </div>
            <div class="livro-disponivel-info">
                <strong>Localização:</strong> Prateleira ${livro.prateleira}, Bandeja ${livro.bandeja}
            </div>
        </div>
        `;
    }).join('');
}

function exibirLivrosAlugados(livros) {
    const grid = document.getElementById('livrosAlugadosGrid');
    if (!grid) return;
    
    if (livros.length === 0) {
        grid.innerHTML = '<div class="empty-state">Nenhum livro alugado</div>';
        return;
    }
    
    grid.innerHTML = livros.map(livro => {
        return `
        <div class="livro-alugado-card" onclick="selecionarLivroDevolver('${livro.id}')">
            <h4>${livro.livro}</h4>
            <div class="livro-alugado-info">
                <strong>Autor:</strong> ${livro.autor}
            </div>
            <div class="livro-alugado-info">
                <strong>Cliente:</strong> ${livro.clienteNome}
            </div>
            <div class="livro-alugado-info">
                <strong>Quantidade Alugada:</strong> ${livro.quantidade}
            </div>
            <div class="livro-alugado-info">
                <strong>Alugado em:</strong> ${new Date(livro.dataAluguel).toLocaleDateString('pt-BR')}
            </div>
        </div>
        `;
    }).join('');
}

function filtrarLivrosDisponiveis() {
    const termo = document.getElementById('buscaLivroAlugar').value.toLowerCase();
    if (!termo) {
        carregarLivrosDisponiveis();
        return;
    }
    const livrosFiltrados = window.livrosDisponiveisFiltrados.filter(livro => 
        livro.livro.toLowerCase().includes(termo) || 
        livro.autor.toLowerCase().includes(termo)
    );
    exibirLivrosDisponiveis(livrosFiltrados);
}

function filtrarLivrosAlugados() {
    const termo = document.getElementById('buscaLivroDevolver').value.toLowerCase();
    if (!termo) {
        carregarLivrosAlugados();
        return;
    }
    const livrosFiltrados = window.livrosAlugadosFiltrados.filter(livro => 
        livro.livro.toLowerCase().includes(termo) || 
        livro.autor.toLowerCase().includes(termo) ||
        livro.clienteNome.toLowerCase().includes(termo)
    );
    exibirLivrosAlugados(livrosFiltrados);
}

function selecionarLivroAlugar(livroId) {
    const livro = window.livrosDisponiveisFiltrados.find(l => l.id === livroId);
    if (!livro) return;
    
    window.livroSelecionadoAlugar = livro;
    document.querySelectorAll('.livro-disponivel-card').forEach(card => card.classList.remove('selecionado'));
    event.currentTarget.classList.add('selecionado');
    
    document.getElementById('nomeLivroSelecionado').textContent = livro.livro;
    document.getElementById('quantidadeDisponivel').textContent = livro.quantidadeDisponivel;
    document.getElementById('quantidadeAlugar').max = livro.quantidadeDisponivel;
    document.getElementById('quantidadeAlugar').value = 1;
    document.getElementById('livroSelecionadoCard').style.display = 'block';
    document.getElementById('btnAlugar').disabled = false;
}

function selecionarLivroDevolver(aluguelId) {
    const aluguel = window.livrosAlugadosFiltrados.find(a => a.id === aluguelId);
    if (!aluguel) return;
    
    window.livroSelecionadoDevolver = aluguel;
    document.querySelectorAll('.livro-alugado-card').forEach(card => card.classList.remove('selecionado'));
    event.currentTarget.classList.add('selecionado');
    
    document.getElementById('nomeLivroDevolucaoSelecionado').textContent = `${aluguel.livro} (${aluguel.clienteNome})`;
    document.getElementById('quantidadeAlugada').textContent = aluguel.quantidade;
    document.getElementById('quantidadeDevolver').max = aluguel.quantidade;
    document.getElementById('quantidadeDevolver').value = 1;
    document.getElementById('livroDevolucaoSelecionadoCard').style.display = 'block';
    document.getElementById('btnDevolver').disabled = false;
}

function editarLivro(livroId) {
    const livro = sistema.cache.livros.find(l => l.id === livroId);
    if (!livro) return;
    
    window.livroEditando = livro;
    document.getElementById('editLivro').value = livro.livro;
    document.getElementById('editAutor').value = livro.autor;
    document.getElementById('editCategoria').value = livro.categoria;
    document.getElementById('editQuantidade').value = livro.quantidade;
    document.getElementById('editPrateleira').value = livro.prateleira;
    document.getElementById('editBandeja').value = livro.bandeja;
    document.getElementById('editModal').style.display = 'block';
}

function fecharModal() {
    document.getElementById('editModal').style.display = 'none';
    window.livroEditando = null;
}

function atualizarControlesPaginacao(totalLivros = sistema.cache.livros.length) {
    const totalPages = Math.ceil(totalLivros / sistema.estado.livrosPorPagina);
    const pageInfo = `Página ${sistema.estado.paginaAtual} de ${totalPages}`;
    
    document.getElementById('pageInfo').textContent = pageInfo;
    document.getElementById('pageInfoBottom').textContent = pageInfo;
    
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    if (prevBtn) {
        prevBtn.disabled = sistema.estado.paginaAtual === 1;
        nextBtn.disabled = sistema.estado.paginaAtual === totalPages;
    }
}

function inicializarPaginacao() {
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const searchInput = document.getElementById('searchInput');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => mudarPagina('prev'));
        nextBtn.addEventListener('click', () => mudarPagina('next'));
    }

    if (searchInput) {
        let timeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => filtrarLivros(), 300);
        });
    }
}

function inicializarBuscaAluguel() {
    const buscaInput = document.getElementById('buscaLivroAlugar');
    if (buscaInput) {
        let timeout;
        buscaInput.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                if (!window.livrosDisponiveisFiltrados) {
                    carregarLivrosDisponiveis();
                } else {
                    filtrarLivrosDisponiveis();
                }
            }, 300);
        });
    }
}

function inicializarBuscaDevolucao() {
    const buscaInput = document.getElementById('buscaLivroDevolver');
    if (buscaInput) {
        let timeout;
        buscaInput.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                if (!window.livrosAlugadosFiltrados) {
                    carregarLivrosAlugados();
                } else {
                    filtrarLivrosAlugados();
                }
            }, 300);
        });
    }
}

// Variáveis globais
window.livrosDisponiveisFiltrados = null;
window.livrosAlugadosFiltrados = null;
window.livroSelecionadoAlugar = null;
window.livroSelecionadoDevolver = null;
window.livroEditando = null;
