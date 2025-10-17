const firebaseConfig = {
    apiKey: "AIzaSyBgCJzenRbgpScy-LWi3sEccNvHXbr1uuY",
    authDomain: "biblioteca-b97fb.firebaseapp.com",
    projectId: "biblioteca-b97fb",
    storageBucket: "biblioteca-b97fb.firebasestorage.app",
    messagingSenderId: "699649848975",
    appId: "1:699649848975:web:187b6647f5b2fbc6a622fa",
    measurementId: "G-N9FF16T3KF"
};

// Inicialização do Firebase
try {
    firebase.initializeApp(firebaseConfig);
    console.log("🔥 Firebase inicializado com sucesso!");
} catch (error) {
    console.error("❌ Erro ao inicializar Firebase:", error);
}

const db = firebase.firestore();

// Variáveis globais
let livros = [];
let todosLivros = [];
let alugueis = [];
let livroEditando = null;

// Variáveis de paginação
let currentPage = 1;
const booksPerPage = 20;
let totalLivros = 0;
let buscaAtiva = false;
let termoBusca = '';

// Variáveis para aluguel
let livroSelecionadoAlugar = null;
let livroSelecionadoDevolver = null;
let livrosDisponiveis = [];
let livrosAlugados = [];

// ✅ CACHE OTIMIZADO
let cacheCarregado = false;
let alugueisCarregados = false;

document.addEventListener('DOMContentLoaded', function() {
    console.log("📚 Biblioteca carregada!");
    
    const formCadastro = document.getElementById('formCadastro');
    if (formCadastro) {
        formCadastro.addEventListener('submit', cadastrarLivro);
    }
    
    if (document.getElementById('livrosList')) {
        console.log("📖 Página da biblioteca detectada");
        inicializarPaginacao();
        carregarLivros();
    }
    
    if (document.getElementById('buscaLivroAlugar')) {
        console.log("💰 Página de aluguel detectada");
        inicializarBuscaAluguel();
        carregarLivrosDisponiveis();
    }
    
    if (document.getElementById('buscaLivroDevolver')) {
        console.log("🔄 Página de devolução detectada");
        inicializarBuscaDevolucao();
        carregarLivrosAlugados();
    }
    
    const modal = document.getElementById('editModal');
    if (modal) {
        const closeBtn = modal.querySelector('.close');
        closeBtn.addEventListener('click', fecharModal);
        
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                fecharModal();
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') fecharModal();
        });
    }
});

function inicializarPaginacao() {
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const prevBtnBottom = document.getElementById('prevPageBottom');
    const nextBtnBottom = document.getElementById('nextPageBottom');
    const searchInput = document.getElementById('searchInput');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => mudarPagina('prev'));
        nextBtn.addEventListener('click', () => mudarPagina('next'));
        if (prevBtnBottom) prevBtnBottom.addEventListener('click', () => mudarPagina('prev'));
        if (nextBtnBottom) nextBtnBottom.addEventListener('click', () => mudarPagina('next'));
    }

    if (searchInput) {
        let timeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                termoBusca = e.target.value.toLowerCase();
                filtrarLivros();
            }, 300);
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
                filtrarLivrosDisponiveis();
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
                filtrarLivrosAlugados();
            }, 300);
        });
    }
}

// ✅✅✅ FUNÇÃO PRINCIPAL CORRIGIDA - MÍNIMO DE LEITURAS
async function carregarLivros() {
    const livrosList = document.getElementById('livrosList');
    if (!livrosList) return;
    
    if (buscaAtiva) {
        aplicarFiltroBusca();
        return;
    }
    
    livrosList.innerHTML = '<div class="loading">Carregando livros...</div>';
    
    try {
        console.log("🔄 Buscando livros no Firebase...");
        
        // ✅✅✅ CORREÇÃO: CARREGA CACHE UMA ÚNICA VEZ
        if (!cacheCarregado) {
            console.log("📥 Carregando TODOS os livros no cache...");
            const snapshot = await db.collection('livros')
                .orderBy('dataCadastro', 'desc')
                .get();
            
            todosLivros = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            cacheCarregado = true;
            totalLivros = todosLivros.length;
            console.log(`🌍 ${todosLivros.length} livros carregados no cache (APENAS UMA VEZ)`);
            
            const totalElement = document.getElementById('totalLivros');
            if (totalElement) {
                totalElement.textContent = `${totalLivros} livros cadastrados`;
            }
        }
        
        // ✅✅✅ CORREÇÃO: CARREGA ALUGUÉIS UMA ÚNICA VEZ
        if (!alugueisCarregados) {
            console.log("📋 Carregando aluguéis ativos...");
            const alugueisSnapshot = await db.collection('alugueis')
                .where('dataDevolucao', '==', null)
                .get();
            alugueis = alugueisSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            alugueisCarregados = true;
            console.log(`📋 ${alugueis.length} aluguéis ativos carregados (APENAS UMA VEZ)`);
        }
        
        // ✅✅✅ CORREÇÃO: PAGINAÇÃO USANDO CACHE (SEM CONSULTA FIREBASE!)
        const startIndex = (currentPage - 1) * booksPerPage;
        const endIndex = startIndex + booksPerPage;
        livros = todosLivros.slice(startIndex, endIndex);
        
        console.log(`📚 Página ${currentPage}: ${livros.length} livros (do cache)`);
        
        exibirLivros(livros);
        atualizarControlesPaginacao();
        
    } catch (error) {
        console.error('❌ Erro ao carregar livros:', error);
        livrosList.innerHTML = '<div class="empty-state">Erro ao carregar livros. Tente novamente.</div>';
    }
}

// ✅✅✅ PAGINAÇÃO OTIMIZADA (ZERO LEITURAS FIREBASE)
function mudarPagina(direction) {
    if (buscaAtiva) {
        mudarPaginaBusca(direction);
        return;
    }
    
    if (direction === 'next') {
        currentPage++;
    } else if (direction === 'prev') {
        currentPage--;
    }
    
    // ✅✅✅ CORREÇÃO: SEM CONSULTA AO FIREBASE!
    const startIndex = (currentPage - 1) * booksPerPage;
    const endIndex = startIndex + booksPerPage;
    livros = todosLivros.slice(startIndex, endIndex);
    
    exibirLivros(livros);
    atualizarControlesPaginacao();
}

function mudarPaginaBusca(direction) {
    const livrosFiltrados = filtrarLivrosGlobal();
    const totalPages = Math.ceil(livrosFiltrados.length / booksPerPage);
    
    if (direction === 'next') {
        currentPage++;
    } else if (direction === 'prev') {
        currentPage--;
    }
    
    currentPage = Math.max(1, Math.min(currentPage, totalPages));
    
    const startIndex = (currentPage - 1) * booksPerPage;
    const endIndex = startIndex + booksPerPage;
    const livrosPagina = livrosFiltrados.slice(startIndex, endIndex);
    
    exibirLivros(livrosPagina);
    atualizarControlesPaginacaoBusca(livrosFiltrados.length);
}

function filtrarLivros() {
    if (!termoBusca || termoBusca.trim() === '') {
        buscaAtiva = false;
        currentPage = 1;
        carregarLivros();
        return;
    }
    
    buscaAtiva = true;
    currentPage = 1;
    aplicarFiltroBusca();
}

function aplicarFiltroBusca() {
    // ✅✅✅ CORREÇÃO: BUSCA NO CACHE (ZERO LEITURAS FIREBASE)
    const livrosFiltrados = filtrarLivrosGlobal();
    const startIndex = (currentPage - 1) * booksPerPage;
    const endIndex = startIndex + booksPerPage;
    const livrosPagina = livrosFiltrados.slice(startIndex, endIndex);
    
    exibirLivros(livrosPagina);
    atualizarControlesPaginacaoBusca(livrosFiltrados.length);
}

function filtrarLivrosGlobal() {
    if (!termoBusca) return todosLivros;
    
    return todosLivros.filter(livro => 
        livro.livro.toLowerCase().includes(termoBusca) || 
        livro.autor.toLowerCase().includes(termoBusca)
    );
}

function atualizarControlesPaginacao() {
    const totalPages = Math.ceil(totalLivros / booksPerPage);
    const pageInfo = `Página ${currentPage} de ${totalPages}`;
    const resultsInfo = `${livros.length} livros nesta página`;
    
    const pageInfoElement = document.getElementById('pageInfo');
    const pageInfoBottom = document.getElementById('pageInfoBottom');
    const resultsInfoElement = document.getElementById('resultsInfo');
    
    if (pageInfoElement) pageInfoElement.textContent = pageInfo;
    if (pageInfoBottom) pageInfoBottom.textContent = pageInfo;
    if (resultsInfoElement) resultsInfoElement.textContent = resultsInfo;
    
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const prevBtnBottom = document.getElementById('prevPageBottom');
    const nextBtnBottom = document.getElementById('nextPageBottom');
    
    if (prevBtn) {
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage === totalPages || totalPages === 0;
        if (prevBtnBottom) prevBtnBottom.disabled = currentPage === 1;
        if (nextBtnBottom) nextBtnBottom.disabled = currentPage === totalPages || totalPages === 0;
    }
}

function atualizarControlesPaginacaoBusca(totalEncontrados) {
    const totalPages = Math.ceil(totalEncontrados / booksPerPage);
    const pageInfo = `Página ${currentPage} de ${totalPages}`;
    const resultsInfo = `${totalEncontrados} livros encontrados`;
    
    const pageInfoElement = document.getElementById('pageInfo');
    const pageInfoBottom = document.getElementById('pageInfoBottom');
    const resultsInfoElement = document.getElementById('resultsInfo');
    
    if (pageInfoElement) pageInfoElement.textContent = pageInfo;
    if (pageInfoBottom) pageInfoBottom.textContent = pageInfo;
    if (resultsInfoElement) resultsInfoElement.textContent = resultsInfo;
    
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const prevBtnBottom = document.getElementById('prevPageBottom');
    const nextBtnBottom = document.getElementById('nextPageBottom');
    
    if (prevBtn) {
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage === totalPages || totalPages === 0;
        if (prevBtnBottom) prevBtnBottom.disabled = currentPage === 1;
        if (nextBtnBottom) nextBtnBottom.disabled = currentPage === totalPages || totalPages === 0;
    }
}

function exibirLivros(livrosParaExibir) {
    const livrosList = document.getElementById('livrosList');
    if (!livrosList) return;
    
    if (livrosParaExibir.length === 0) {
        livrosList.innerHTML = `
            <div class="empty-state">
                <h3>📚 Nenhum livro encontrado</h3>
                <p>Tente ajustar os termos da busca</p>
            </div>
        `;
        return;
    }
    
    livrosList.innerHTML = livrosParaExibir.map(livro => {
        const alugueisDoLivro = alugueis.filter(a => a.livroId === livro.id);
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
            ${alugueisDoLivro.length > 0 ? `
            <div class="livro-info">
                <strong>Aluguéis Ativos:</strong> ${alugueisDoLivro.length}
            </div>
            ` : ''}
            <div class="data-cadastro">
                <strong>Cadastrado em:</strong> ${formatarData(livro.dataCadastro)}
            </div>
            <div class="livro-actions">
                <button class="btn btn-secondary" onclick="editarLivro('${livro.id}')">
                    ✏️ Editar
                </button>
                <button class="btn btn-danger" onclick="excluirLivro('${livro.id}')">
                    🗑️ Excluir
                </button>
            </div>
        </div>
        `;
    }).join('');
}

async function cadastrarLivro(e) {
    e.preventDefault();
    
    console.log("🎯 Botão de cadastro clicado!");
    
    const livroData = {
        livro: document.getElementById('livro').value.trim(),
        autor: document.getElementById('autor').value.trim(),
        categoria: document.getElementById('categoria').value.trim(),
        quantidade: parseInt(document.getElementById('quantidade').value),
        prateleira: document.getElementById('prateleira').value.trim(),
        bandeja: document.getElementById('bandeja').value.trim(),
        disponivel: true,
        dataCadastro: new Date()
    };
    
    console.log("📝 Dados do livro:", livroData);
    
    if (Object.values(livroData).some(valor => 
        valor === '' || 
        (typeof valor === 'string' && !valor.trim()) || 
        (typeof valor === 'number' && isNaN(valor))
    )) {
        alert("Por favor, preencha todos os campos corretamente!");
        return;
    }
    
    try {
        console.log("📦 Salvando no Firebase...");
        await db.collection('livros').add(livroData);
        console.log("✅ Livro cadastrado com sucesso!");
        
        // ✅✅✅ CORREÇÃO: INVALIDA CACHE PARA ATUALIZAR
        invalidarCache();
        
        document.getElementById('formCadastro').reset();
        
        const successMessage = document.getElementById('successMessage');
        const errorMessage = document.getElementById('errorMessage');
        if (successMessage) successMessage.style.display = 'block';
        if (errorMessage) errorMessage.style.display = 'none';
        
        setTimeout(() => {
            if (successMessage) successMessage.style.display = 'none';
        }, 3000);
        
    } catch (error) {
        console.error('❌ Erro ao cadastrar livro:', error);
        const successMessage = document.getElementById('successMessage');
        const errorMessage = document.getElementById('errorMessage');
        if (successMessage) successMessage.style.display = 'none';
        if (errorMessage) errorMessage.style.display = 'block';
        
        setTimeout(() => {
            if (errorMessage) errorMessage.style.display = 'none';
        }, 3000);
    }
}

// ✅✅✅ FUNÇÃO AUXILIAR PARA INVALIDAR CACHE
function invalidarCache() {
    cacheCarregado = false;
    alugueisCarregados = false;
    totalLivros = 0;
    console.log("🔄 Cache invalidado - próxima operação recarregará dados");
}

async function carregarLivrosDisponiveis() {
    const grid = document.getElementById('livrosDisponiveisGrid');
    if (!grid) return;
    
    grid.innerHTML = '<div class="loading">Carregando livros disponíveis...</div>';
    
    try {
        // ✅✅✅ CORREÇÃO: USA CACHE EXISTENTE
        if (!cacheCarregado) {
            await carregarLivros();
        }
        
        if (!alugueisCarregados) {
            await carregarAlugueisAtivos();
        }
        
        livrosDisponiveis = [];
        
        for (const livro of todosLivros) {
            const alugueisDoLivro = alugueis.filter(a => a.livroId === livro.id);
            const quantidadeAlugada = alugueisDoLivro.reduce((total, aluguel) => total + aluguel.quantidade, 0);
            const quantidadeDisponivel = livro.quantidade - quantidadeAlugada;
            
            if (quantidadeDisponivel > 0) {
                livrosDisponiveis.push({
                    ...livro,
                    quantidadeDisponivel: quantidadeDisponivel,
                    quantidadeAlugada: quantidadeAlugada
                });
            }
        }
        
        exibirLivrosDisponiveis(livrosDisponiveis);
        console.log(`💰 ${livrosDisponiveis.length} livros disponíveis (do cache)`);
        
    } catch (error) {
        console.error('❌ Erro ao carregar livros disponíveis:', error);
        grid.innerHTML = '<div class="empty-state">Erro ao carregar livros disponíveis.</div>';
    }
}

async function carregarLivrosAlugados() {
    const grid = document.getElementById('livrosAlugadosGrid');
    if (!grid) return;
    
    grid.innerHTML = '<div class="loading">Carregando livros alugados...</div>';
    
    try {
        if (!alugueisCarregados) {
            await carregarAlugueisAtivos();
        }
        
        livrosAlugados = [];
        
        for (const aluguel of alugueis) {
            // ✅✅✅ CORREÇÃO: USA CACHE EM VEZ DE CONSULTAR CADA LIVRO
            let livro = todosLivros.find(l => l.id === aluguel.livroId);
            
            if (livro) {
                livrosAlugados.push({
                    id: aluguel.id,
                    livroId: aluguel.livroId,
                    livro: livro.livro,
                    autor: livro.autor,
                    clienteNome: aluguel.clienteNome,
                    quantidade: aluguel.quantidade,
                    dataAluguel: aluguel.dataAluguel
                });
            }
        }
        
        exibirLivrosAlugados(livrosAlugados);
        console.log(`🔄 ${livrosAlugados.length} livros alugados carregados (do cache)`);
        
    } catch (error) {
        console.error('❌ Erro ao carregar livros alugados:', error);
        grid.innerHTML = '<div class="empty-state">Erro ao carregar livros alugados.</div>';
    }
}

// ✅✅✅ FUNÇÃO AUXILIAR PARA CARREGAR ALUGUÉIS
async function carregarAlugueisAtivos() {
    if (alugueisCarregados) return;
    
    const alugueisSnapshot = await db.collection('alugueis')
        .where('dataDevolucao', '==', null)
        .get();
    alugueis = alugueisSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
    alugueisCarregados = true;
}

function exibirLivrosDisponiveis(livros) {
    const grid = document.getElementById('livrosDisponiveisGrid');
    if (!grid) return;
    
    if (livros.length === 0) {
        grid.innerHTML = '<div class="empty-state">Nenhum livro disponível encontrado.</div>';
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
                <strong>Categoria:</strong> ${livro.categoria}
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
        grid.innerHTML = '<div class="empty-state">Nenhum livro alugado encontrado.</div>';
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
                <strong>Quantidade Alugada:</strong> 
                <span class="quantidade-info">${livro.quantidade}</span>
            </div>
            <div class="livro-alugado-info">
                <strong>Alugado em:</strong> ${formatarData(livro.dataAluguel)}
            </div>
        </div>
        `;
    }).join('');
}

function filtrarLivrosDisponiveis() {
    const termo = document.getElementById('buscaLivroAlugar').value.toLowerCase();
    
    if (!termo) {
        exibirLivrosDisponiveis(livrosDisponiveis);
        return;
    }
    
    const livrosFiltrados = livrosDisponiveis.filter(livro => 
        livro.livro.toLowerCase().includes(termo) || 
        livro.autor.toLowerCase().includes(termo)
    );
    
    exibirLivrosDisponiveis(livrosFiltrados);
}

function filtrarLivrosAlugados() {
    const termo = document.getElementById('buscaLivroDevolver').value.toLowerCase();
    
    if (!termo) {
        exibirLivrosAlugados(livrosAlugados);
        return;
    }
    
    const livrosFiltrados = livrosAlugados.filter(livro => 
        livro.livro.toLowerCase().includes(termo) || 
        livro.autor.toLowerCase().includes(termo) ||
        livro.clienteNome.toLowerCase().includes(termo)
    );
    
    exibirLivrosAlugados(livrosFiltrados);
}

function selecionarLivroAlugar(livroId) {
    const livro = livrosDisponiveis.find(l => l.id === livroId);
    if (!livro) return;
    
    livroSelecionadoAlugar = livro;
    
    document.querySelectorAll('.livro-disponivel-card').forEach(card => {
        card.classList.remove('selecionado');
    });
    event.currentTarget.classList.add('selecionado');
    
    document.getElementById('nomeLivroSelecionado').textContent = livro.livro;
    document.getElementById('quantidadeDisponivel').textContent = livro.quantidadeDisponivel;
    document.getElementById('quantidadeAlugar').max = livro.quantidadeDisponivel;
    document.getElementById('quantidadeAlugar').value = 1;
    document.getElementById('livroSelecionadoCard').style.display = 'block';
    document.getElementById('btnAlugar').disabled = false;
}

function selecionarLivroDevolver(aluguelId) {
    const aluguel = livrosAlugados.find(a => a.id === aluguelId);
    if (!aluguel) return;
    
    livroSelecionadoDevolver = aluguel;
    
    document.querySelectorAll('.livro-alugado-card').forEach(card => {
        card.classList.remove('selecionado');
    });
    event.currentTarget.classList.add('selecionado');
    
    document.getElementById('nomeLivroDevolucaoSelecionado').textContent = `${aluguel.livro} (${aluguel.clienteNome})`;
    document.getElementById('quantidadeAlugada').textContent = aluguel.quantidade;
    document.getElementById('quantidadeDevolver').max = aluguel.quantidade;
    document.getElementById('quantidadeDevolver').value = 1;
    document.getElementById('livroDevolucaoSelecionadoCard').style.display = 'block';
    document.getElementById('btnDevolver').disabled = false;
}

async function alugarLivro() {
    const clienteNome = document.getElementById('clienteNome').value.trim();
    const quantidade = parseInt(document.getElementById('quantidadeAlugar').value);
    
    if (!livroSelecionadoAlugar || !clienteNome || !quantidade) {
        alert("Por favor, preencha todos os campos e selecione um livro!");
        return;
    }
    
    if (quantidade > livroSelecionadoAlugar.quantidadeDisponivel) {
        alert(`Quantidade indisponível! Apenas ${livroSelecionadoAlugar.quantidadeDisponivel} livros disponíveis.`);
        return;
    }
    
    try {
        const aluguelData = {
            livroId: livroSelecionadoAlugar.id,
            clienteNome: clienteNome,
            quantidade: quantidade,
            dataAluguel: new Date(),
            dataDevolucao: null,
            prazoDevolucao: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        };
        
        await db.collection('alugueis').add(aluguelData);
        
        document.getElementById('clienteNome').value = '';
        document.getElementById('buscaLivroAlugar').value = '';
        document.getElementById('livroSelecionadoCard').style.display = 'none';
        document.getElementById('btnAlugar').disabled = true;
        livroSelecionadoAlugar = null;
        
        // ✅✅✅ CORREÇÃO: INVALIDA CACHE
        invalidarCache();
        
        await carregarLivrosDisponiveis();
        await carregarLivrosAlugados();
        
        alert('Livro alugado com sucesso!');
        console.log("📚 Livro alugado com sucesso!");
        
    } catch (error) {
        console.error('❌ Erro ao alugar livro:', error);
        alert('Erro ao alugar livro. Tente novamente.');
    }
}

async function devolverLivro() {
    const quantidade = parseInt(document.getElementById('quantidadeDevolver').value);
    
    if (!livroSelecionadoDevolver || !quantidade) {
        alert("Por favor, selecione um livro para devolver!");
        return;
    }
    
    if (quantidade > livroSelecionadoDevolver.quantidade) {
        alert(`Quantidade inválida! Apenas ${livroSelecionadoDevolver.quantidade} livros foram alugados.`);
        return;
    }
    
    try {
        if (quantidade === livroSelecionadoDevolver.quantidade) {
            await db.collection('alugueis').doc(livroSelecionadoDevolver.id).update({
                dataDevolucao: new Date()
            });
        } else {
            const aluguelDoc = await db.collection('alugueis').doc(livroSelecionadoDevolver.id).get();
            const aluguel = aluguelDoc.data();
            
            await db.collection('alugueis').doc(livroSelecionadoDevolver.id).update({
                quantidade: aluguel.quantidade - quantidade
            });
        }
        
        document.getElementById('buscaLivroDevolver').value = '';
        document.getElementById('livroDevolucaoSelecionadoCard').style.display = 'none';
        document.getElementById('btnDevolver').disabled = true;
        livroSelecionadoDevolver = null;
        
        // ✅✅✅ CORREÇÃO: INVALIDA CACHE
        invalidarCache();
        
        await carregarLivrosDisponiveis();
        await carregarLivrosAlugados();
        
        alert('Livro devolvido com sucesso!');
        console.log("🔄 Livro devolvido com sucesso!");
        
    } catch (error) {
        console.error('❌ Erro ao devolver livro:', error);
        alert('Erro ao devolver livro. Tente novamente.');
    }
}

function editarLivro(livroId) {
    const livroParaEditar = buscaAtiva ? 
        todosLivros.find(l => l.id === livroId) : 
        livros.find(l => l.id === livroId);
    
    if (livroParaEditar) {
        livroEditando = livroParaEditar;
        
        document.getElementById('editLivro').value = livroEditando.livro || '';
        document.getElementById('editAutor').value = livroEditando.autor || '';
        document.getElementById('editCategoria').value = livroEditando.categoria || '';
        document.getElementById('editQuantidade').value = livroEditando.quantidade || '';
        document.getElementById('editPrateleira').value = livroEditando.prateleira || '';
        document.getElementById('editBandeja').value = livroEditando.bandeja || '';
        
        document.getElementById('editModal').style.display = 'block';
        
        console.log("✏️ Editando livro:", livroEditando.livro);
    }
}

async function salvarEdicao() {
    if (!livroEditando) return;
    
    try {
        await db.collection('livros').doc(livroEditando.id).update({
            livro: document.getElementById('editLivro').value.trim(),
            autor: document.getElementById('editAutor').value.trim(),
            categoria: document.getElementById('editCategoria').value.trim(),
            quantidade: parseInt(document.getElementById('editQuantidade').value),
            prateleira: document.getElementById('editPrateleira').value.trim(),
            bandeja: document.getElementById('editBandeja').value.trim()
        });
        
        // ✅✅✅ CORREÇÃO: INVALIDA CACHE
        invalidarCache();
        
        await carregarLivros();
        
        fecharModal();
        alert('Livro atualizado com sucesso!');
        
        console.log("✅ Livro atualizado:", livroEditando.id);
    } catch (error) {
        console.error('❌ Erro ao atualizar livro:', error);
        alert('Erro ao atualizar livro. Tente novamente.');
    }
}

async function excluirLivro(livroId) {
    if (confirm('Tem certeza que deseja excluir este livro?')) {
        try {
            await db.collection('livros').doc(livroId).delete();
            
            // ✅✅✅ CORREÇÃO: INVALIDA CACHE
            invalidarCache();
            
            await carregarLivros();
            
            alert('Livro excluído com sucesso!');
            
            console.log("🗑️ Livro excluído:", livroId);
        } catch (error) {
            console.error('❌ Erro ao excluir livro:', error);
            alert('Erro ao excluir livro. Tente novamente.');
        }
    }
}

function fecharModal() {
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.style.display = 'none';
    }
    livroEditando = null;
    console.log("❌ Modal fechado");
}

function formatarData(data) {
    if (!data) return 'Data não disponível';
    
    try {
        if (data.toDate) {
            const date = data.toDate();
            return date.toLocaleDateString('pt-BR');
        }
        const date = new Date(data);
        return date.toLocaleDateString('pt-BR');
    } catch (error) {
        console.error('❌ Erro ao formatar data:', error);
        return 'Data inválida';
    }
}
