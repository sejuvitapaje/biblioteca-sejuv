const firebaseConfig = {
    apiKey: "AIzaSyBgCJzenRbgpScy-LWi3sEccNvHXbr1uuY",
    authDomain: "biblioteca-b97fb.firebaseapp.com",
    projectId: "biblioteca-b97fb",
    storageBucket: "biblioteca-b97fb.firebasestorage.app",
    messagingSenderId: "699649848975",
    appId: "1:699649848975:web:187b6647f5b2fbc6a622fa",
    measurementId: "G-N9FF16T3KF"
};

try {
    firebase.initializeApp(firebaseConfig);
    console.log("🔥 Firebase inicializado com sucesso!");
} catch (error) {
    console.error("❌ Erro ao inicializar Firebase:", error);
}

const db = firebase.firestore();

let livros = [];
let todosLivros = [];
let alugueis = [];
let livroEditando = null;

// Variáveis de paginação e busca
let currentPage = 1;
const booksPerPage = 50;
let totalLivros = 0;
let lastVisible = null;
let firstVisible = null;
let buscaAtiva = false;
let termoBusca = '';

// Variáveis para aluguel
let livroSelecionadoAlugar = null;
let livroSelecionadoDevolver = null;
let livrosDisponiveis = [];
let livrosAlugados = [];

// Cache para otimização - AGORA FUNCIONANDO
let cacheCarregado = false;
let alugueisCarregados = false;
let carregamentoGlobalEmAndamento = false;

document.addEventListener('DOMContentLoaded', function() {
    console.log("📚 Biblioteca carregada!");
    
    const formCadastro = document.getElementById('formCadastro');
    if (formCadastro) {
        formCadastro.addEventListener('submit', cadastrarLivro);
        console.log("✅ Formulário de cadastro configurado");
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
    
    if (document.getElementById('clientesList')) {
        console.log("👥 Página de clientes detectada");
        carregarClientes();
    }
    
    atualizarNotificacoes();
    
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

// ✅ FUNÇÃO COMPLETAMENTE REFEITA - PERFORMANCE MÁXIMA
async function carregarTodosLivros() {
    if (cacheCarregado) {
        console.log("♻️ Usando cache existente");
        return true;
    }
    
    if (carregamentoGlobalEmAndamento) {
        console.log("⏳ Aguardando carregamento em andamento...");
        return false;
    }
    
    carregamentoGlobalEmAndamento = true;
    console.log("🌍 Iniciando carregamento global UMA VEZ...");
    
    try {
        const snapshot = await db.collection('livros').get();
        todosLivros = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        cacheCarregado = true;
        console.log(`✅ ${todosLivros.length} livros carregados para cache`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao carregar todos os livros:', error);
        return false;
    } finally {
        carregamentoGlobalEmAndamento = false;
    }
}

function inicializarPaginacao() {
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const prevBtnBottom = document.getElementById('prevPageBottom');
    const nextBtnBottom = document.getElementById('nextPageBottom');
    const searchInput = document.getElementById('searchInput');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => mudarPagina('prev'));
        nextBtn.addEventListener('click', () => mudarPagina('next'));
        prevBtnBottom.addEventListener('click', () => mudarPagina('prev'));
        nextBtnBottom.addEventListener('click', () => mudarPagina('next'));
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

// ✅ FUNÇÃO PRINCIPAL COMPLETAMENTE OTIMIZADA
async function carregarLivros() {
    const livrosList = document.getElementById('livrosList');
    if (!livrosList) return;
    
    if (buscaAtiva) {
        aplicarFiltroBusca();
        return;
    }
    
    livrosList.innerHTML = '<div class="loading">Carregando livros...</div>';
    
    try {
        console.log("🔄 Buscando livros...");
        
        if (totalLivros === 0) {
            const countSnapshot = await db.collection('livros').count().get();
            totalLivros = countSnapshot.data().count;
            console.log(`📊 Total de livros: ${totalLivros}`);
            document.getElementById('totalLivros').textContent = `${totalLivros} livros cadastrados`;
        }
        
        const snapshot = await db.collection('livros')
            .orderBy('dataCadastro', 'desc')
            .limit(booksPerPage)
            .get();
            
        console.log(`📚 ${snapshot.size} livros carregados`);
        
        livros = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        lastVisible = snapshot.docs[snapshot.docs.length - 1];
        firstVisible = snapshot.docs[0];
        
        if (!alugueisCarregados) {
            const alugueisSnapshot = await db.collection('alugueis')
                .where('dataDevolucao', '==', null)
                .get();
            alugueis = alugueisSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            alugueisCarregados = true;
            console.log(`🔐 ${alugueis.length} aluguéis carregados`);
        }
        
        exibirLivros(livros);
        atualizarControlesPaginacao();
        
    } catch (error) {
        console.error('❌ Erro ao carregar livros:', error);
        livrosList.innerHTML = '<div class="empty-state">Erro ao carregar livros. Tente novamente.</div>';
    }
}

async function mudarPagina(direction) {
    if (buscaAtiva) {
        mudarPaginaBusca(direction);
        return;
    }
    
    const livrosList = document.getElementById('livrosList');
    if (!livrosList) return;
    
    livrosList.innerHTML = '<div class="loading">Carregando...</div>';
    
    try {
        let snapshot;
        let query = db.collection('livros').orderBy('dataCadastro', 'desc');
        
        if (direction === 'next' && lastVisible) {
            snapshot = await query.startAfter(lastVisible).limit(booksPerPage).get();
            currentPage++;
        } else if (direction === 'prev' && firstVisible) {
            snapshot = await query.endBefore(firstVisible).limitToLast(booksPerPage).get();
            currentPage--;
        } else {
            snapshot = await query.limit(booksPerPage).get();
            currentPage = 1;
        }
        
        if (snapshot.empty) {
            livrosList.innerHTML = '<div class="empty-state">Nenhum livro encontrado.</div>';
            return;
        }
        
        livros = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        lastVisible = snapshot.docs[snapshot.docs.length - 1];
        firstVisible = snapshot.docs[0];
        
        exibirLivros(livros);
        atualizarControlesPaginacao();
        
    } catch (error) {
        console.error('❌ Erro ao mudar página:', error);
        livrosList.innerHTML = '<div class="empty-state">Erro ao carregar página.</div>';
    }
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

async function filtrarLivros() {
    if (!termoBusca || termoBusca.trim() === '') {
        buscaAtiva = false;
        currentPage = 1;
        carregarLivros();
        return;
    }
    
    if (!cacheCarregado) {
        console.log("🔍 Busca ativada - carregando cache...");
        const cacheSucesso = await carregarTodosLivros();
        if (!cacheSucesso) {
            console.log("❌ Cache não carregado, usando busca normal");
            buscaAtiva = false;
            carregarLivros();
            return;
        }
    }
    
    buscaAtiva = true;
    currentPage = 1;
    aplicarFiltroBusca();
}

function aplicarFiltroBusca() {
    const livrosFiltrados = filtrarLivrosGlobal();
    const startIndex = (currentPage - 1) * booksPerPage;
    const endIndex = startIndex + booksPerPage;
    const livrosPagina = livrosFiltrados.slice(startIndex, endIndex);
    
    exibirLivros(livrosPagina);
    atualizarControlesPaginacaoBusca(livrosFiltrados.length);
}

function filtrarLivrosGlobal() {
    if (!cacheCarregado) {
        console.log("⚠️ Cache não disponível para busca");
        return [];
    }
    
    return todosLivros.filter(livro => 
        livro.livro.toLowerCase().includes(termoBusca) || 
        livro.autor.toLowerCase().includes(termoBusca)
    );
}

function atualizarControlesPaginacao() {
    const totalPages = Math.ceil(totalLivros / booksPerPage);
    const pageInfo = `Página ${currentPage} de ${totalPages}`;
    const resultsInfo = `${livros.length} livros nesta página`;
    
    document.getElementById('pageInfo').textContent = pageInfo;
    document.getElementById('pageInfoBottom').textContent = pageInfo;
    document.getElementById('resultsInfo').textContent = resultsInfo;
    
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const prevBtnBottom = document.getElementById('prevPageBottom');
    const nextBtnBottom = document.getElementById('nextPageBottom');
    
    if (prevBtn) {
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage === totalPages || totalPages === 0;
        prevBtnBottom.disabled = currentPage === 1;
        nextBtnBottom.disabled = currentPage === totalPages || totalPages === 0;
    }
}

function atualizarControlesPaginacaoBusca(totalEncontrados) {
    const totalPages = Math.ceil(totalEncontrados / booksPerPage);
    const pageInfo = `Página ${currentPage} de ${totalPages}`;
    const resultsInfo = `${totalEncontrados} livros encontrados`;
    
    document.getElementById('pageInfo').textContent = pageInfo;
    document.getElementById('pageInfoBottom').textContent = pageInfo;
    document.getElementById('resultsInfo').textContent = resultsInfo;
    
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const prevBtnBottom = document.getElementById('prevPageBottom');
    const nextBtnBottom = document.getElementById('nextPageBottom');
    
    if (prevBtn) {
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage === totalPages || totalPages === 0;
        prevBtnBottom.disabled = currentPage === 1;
        nextBtnBottom.disabled = currentPage === totalPages || totalPages === 0;
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
    
    if (Object.values(livroData).some(valor => valor === '' || (typeof valor === 'string' && !valor.trim()) || (typeof valor === 'number' && isNaN(valor)))) {
        alert("Por favor, preencha todos os campos corretamente!");
        return;
    }
    
    try {
        console.log("📦 Salvando no Firebase...");
        const docRef = await db.collection('livros').add(livroData);
        console.log("✅ Livro cadastrado com ID:", docRef.id);
        
        cacheCarregado = false;
        totalLivros = 0;
        alugueisCarregados = false;
        
        document.getElementById('formCadastro').reset();
        
        const successMessage = document.getElementById('successMessage');
        const errorMessage = document.getElementById('errorMessage');
        successMessage.style.display = 'block';
        errorMessage.style.display = 'none';
        setTimeout(() => {
            successMessage.style.display = 'none';
        }, 3000);
        
        console.log("🎉 Livro cadastrado com sucesso!");
        
    } catch (error) {
        console.error('❌ Erro ao cadastrar livro:', error);
        const successMessage = document.getElementById('successMessage');
        const errorMessage = document.getElementById('errorMessage');
        successMessage.style.display = 'none';
        errorMessage.style.display = 'block';
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 3000);
    }
}

async function carregarLivrosDisponiveis() {
    const grid = document.getElementById('livrosDisponiveisGrid');
    if (!grid) return;
    
    grid.innerHTML = '<div class="loading">Carregando livros disponíveis...</div>';
    
    try {
        let livrosParaProcessar = [];
        
        if (cacheCarregado) {
            livrosParaProcessar = todosLivros;
            console.log("♻️ Usando cache para livros disponíveis");
        } else {
            const livrosSnapshot = await db.collection('livros').get();
            livrosParaProcessar = livrosSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        }
        
        const alugueisSnapshot = await db.collection('alugueis')
            .where('dataDevolucao', '==', null)
            .get();
        
        const alugueisAtivos = alugueisSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        livrosDisponiveis = [];
        
        for (const livro of livrosParaProcessar) {
            const alugueisDoLivro = alugueisAtivos.filter(a => a.livroId === livro.id);
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
        console.log(`💰 ${livrosDisponiveis.length} livros disponíveis carregados`);
        
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
        const alugueisSnapshot = await db.collection('alugueis')
            .where('dataDevolucao', '==', null)
            .get();
        
        livrosAlugados = [];
        
        for (const doc of alugueisSnapshot.docs) {
            const aluguel = { id: doc.id, ...doc.data() };
            
            let livro = todosLivros.find(l => l.id === aluguel.livroId);
            
            if (!livro) {
                const livroDoc = await db.collection('livros').doc(aluguel.livroId).get();
                if (livroDoc.exists) {
                    livro = livroDoc.data();
                }
            }
            
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
        console.log(`🔄 ${livrosAlugados.length} livros alugados carregados`);
        
    } catch (error) {
        console.error('❌ Erro ao carregar livros alugados:', error);
        grid.innerHTML = '<div class="empty-state">Erro ao carregar livros alugados.</div>';
    }
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
        
        alugueisCarregados = false;
        
        await carregarLivrosDisponiveis();
        await carregarLivrosAlugados();
        atualizarNotificacoes();
        
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
        
        alugueisCarregados = false;
        
        await carregarLivrosDisponiveis();
        await carregarLivrosAlugados();
        atualizarNotificacoes();
        
        alert('Livro devolvido com sucesso!');
        console.log("🔄 Livro devolvido com sucesso!");
        
    } catch (error) {
        console.error('❌ Erro ao devolver livro:', error);
        alert('Erro ao devolver livro. Tente novamente.');
    }
}

async function carregarClientes() {
    const clientesList = document.getElementById('clientesList');
    if (!clientesList) return;
    
    clientesList.innerHTML = '<div class="loading">Carregando clientes...</div>';
    
    try {
        const alugueisSnapshot = await db.collection('alugueis')
            .where('dataDevolucao', '==', null)
            .get();
        
        const alugueisAtivos = alugueisSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        if (alugueisAtivos.length === 0) {
            clientesList.innerHTML = `
                <div class="empty-state">
                    <h3>👥 Nenhum cliente com livros alugados</h3>
                    <p>Todos os livros estão disponíveis na biblioteca</p>
                </div>
            `;
            return;
        }
        
        let clientesHTML = '';
        
        for (const aluguel of alugueisAtivos) {
            const livroDoc = await db.collection('livros').doc(aluguel.livroId).get();
            
            if (livroDoc.exists) {
                const livro = livroDoc.data();
                const prazoDevolucao = aluguel.prazoDevolucao.toDate();
                const hoje = new Date();
                const diasRestantes = Math.ceil((prazoDevolucao - hoje) / (1000 * 60 * 60 * 24));
                
                let statusClass = '';
                let statusText = '';
                let alertIcon = '';
                
                if (diasRestantes <= 0) {
                    statusClass = 'danger';
                    statusText = `PRAZO EXPIRADO! ${Math.abs(diasRestantes)} dia(s) atrás`;
                    alertIcon = '🔴';
                } else if (diasRestantes <= 3) {
                    statusClass = 'warning';
                    statusText = `Vence em ${diasRestantes} dia(s)`;
                    alertIcon = '🟡';
                } else {
                    statusClass = 'normal';
                    statusText = `Vence em ${diasRestantes} dia(s)`;
                    alertIcon = '';
                }
                
                clientesHTML += `
                <div class="cliente-card ${statusClass}">
                    <div class="cliente-header">
                        ${alertIcon ? `<span class="alert-icon">${alertIcon}</span>` : ''}
                        <div class="cliente-nome">${aluguel.clienteNome}</div>
                    </div>
                    <div class="cliente-info">
                        <strong>Livro:</strong> ${livro.livro}
                    </div>
                    <div class="cliente-info">
                        <strong>Autor:</strong> ${livro.autor}
                    </div>
                    <div class="cliente-info">
                        <strong>Quantidade Alugada:</strong> ${aluguel.quantidade}
                    </div>
                    <div class="cliente-info">
                        <strong>Data do Aluguel:</strong> ${formatarData(aluguel.dataAluguel)}
                    </div>
                    <div class="cliente-info">
                        <strong>Prazo de Devolução:</strong> ${formatarData(aluguel.prazoDevolucao)}
                    </div>
                    <div class="prazo-info ${statusClass}">
                        ${statusText}
                    </div>
                </div>
                `;
            }
        }
        
        clientesList.innerHTML = clientesHTML;
        console.log(`👥 ${alugueisAtivos.length} clientes carregados`);
        
    } catch (error) {
        console.error('❌ Erro ao carregar clientes:', error);
        clientesList.innerHTML = '<div class="empty-state">Erro ao carregar clientes. Tente novamente.</div>';
    }
}

async function atualizarNotificacoes() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    
    try {
        const alugueisSnapshot = await db.collection('alugueis')
            .where('dataDevolucao', '==', null)
            .get();
        
        const alugueisAtivos = alugueisSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        let notificacoes = 0;
        
        for (const aluguel of alugueisAtivos) {
            const prazoDevolucao = aluguel.prazoDevolucao.toDate();
            const hoje = new Date();
            const diasRestantes = Math.ceil((prazoDevolucao - hoje) / (1000 * 60 * 60 * 24));
            
            if (diasRestantes <= 3) {
                notificacoes++;
            }
        }
        
        if (notificacoes > 0) {
            badge.textContent = notificacoes;
            badge.style.display = 'flex';
            console.log(`🔔 ${notificacoes} notificações de prazo`);
        } else {
            badge.style.display = 'none';
        }
        
    } catch (error) {
        console.error('❌ Erro ao atualizar notificações:', error);
    }
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
        
        cacheCarregado = false;
        totalLivros = 0;
        
        await carregarTodosLivros();
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
            
            cacheCarregado = false;
            totalLivros = 0;
            
            await carregarTodosLivros();
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
