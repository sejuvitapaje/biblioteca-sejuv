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

// ⚡ CACHE GLOBAL - EVITA LEITURAS REPETIDAS
let cache = {
    todosLivros: [],
    alugueisAtivos: [],
    carregado: false,
    alugueisCarregados: false
};

// Variáveis de estado
let currentPage = 1;
const booksPerPage = 20;
let buscaAtiva = false;
let termoBusca = '';
let livrosPaginaAtual = [];

// Variáveis para aluguel
let livroSelecionadoAlugar = null;
let livroSelecionadoDevolver = null;

document.addEventListener('DOMContentLoaded', function() {
    console.log("📚 Sistema carregado - Cache vazio");
    
    // Configurações básicas
    const formCadastro = document.getElementById('formCadastro');
    if (formCadastro) formCadastro.addEventListener('submit', cadastrarLivro);
    
    if (document.getElementById('livrosList')) {
        console.log("📖 Página da biblioteca detectada");
        inicializarPaginacao();
        carregarLivros(); // ⚡ APENAS 1 LEITURA AQUI
    }
    
    if (document.getElementById('buscaLivroAlugar')) {
        console.log("💰 Página de aluguel detectada");
        inicializarBuscaAluguel();
        carregarLivrosDisponiveis(); // ⚡ USA CACHE
    }
    
    if (document.getElementById('buscaLivroDevolver')) {
        console.log("🔄 Página de devolução detectada");
        inicializarBuscaDevolucao();
        carregarLivrosAlugados(); // ⚡ USA CACHE
    }
    
    // Modal
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.querySelector('.close').addEventListener('click', fecharModal);
        window.addEventListener('click', (e) => e.target === modal && fecharModal());
        document.addEventListener('keydown', (e) => e.key === 'Escape' && fecharModal());
    }
});

// ⚡ FUNÇÃO PRINCIPAL - MÁXIMO 2 LEITURAS POR SESSÃO
async function carregarLivros() {
    const livrosList = document.getElementById('livrosList');
    if (!livrosList) return;
    
    livrosList.innerHTML = '<div class="loading">Carregando livros...</div>';
    
    try {
        console.log("🔄 Iniciando carregamento...");
        
        // ⚡ LEITURA 1: TODOS OS LIVROS (APENAS UMA VEZ)
        if (!cache.carregado) {
            console.log("📥 FAZENDO LEITURA DOS LIVROS...");
            const livrosSnapshot = await db.collection('livros')
                .orderBy('dataCadastro', 'desc')
                .get();
            
            cache.todosLivros = livrosSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            cache.carregado = true;
            console.log(`✅ ${cache.todosLivros.length} livros carregados (1 LEITURA)`);
            
            // Atualiza interface
            const totalElement = document.getElementById('totalLivros');
            if (totalElement) {
                totalElement.textContent = `${cache.todosLivros.length} livros cadastrados`;
            }
        } else {
            console.log("♻️ Usando cache de livros (0 LEITURAS)");
        }
        
        // ⚡ LEITURA 2: ALUGUÉIS ATIVOS (APENAS UMA VEZ)
        if (!cache.alugueisCarregados) {
            console.log("📋 FAZENDO LEITURA DOS ALUGUÉIS...");
            const alugueisSnapshot = await db.collection('alugueis')
                .where('dataDevolucao', '==', null)
                .get();
            
            cache.alugueisAtivos = alugueisSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            cache.alugueisCarregados = true;
            console.log(`✅ ${cache.alugueisAtivos.length} aluguéis carregados (1 LEITURA)`);
        } else {
            console.log("♻️ Usando cache de aluguéis (0 LEITURAS)");
        }
        
        // ⚡ PAGINAÇÃO NO CACHE (0 LEITURAS)
        const startIndex = (currentPage - 1) * booksPerPage;
        const endIndex = startIndex + booksPerPage;
        livrosPaginaAtual = cache.todosLivros.slice(startIndex, endIndex);
        
        console.log(`📚 Página ${currentPage}: ${livrosPaginaAtual.length} livros (0 LEITURAS)`);
        
        exibirLivros(livrosPaginaAtual);
        atualizarControlesPaginacao();
        
        console.log("🎯 TOTAL DE LEITURAS DESTA SESSÃO: " + (cache.carregado && cache.alugueisCarregados ? "2" : "1-2"));
        
    } catch (error) {
        console.error('❌ Erro ao carregar livros:', error);
        livrosList.innerHTML = '<div class="empty-state">Erro ao carregar livros. Tente novamente.</div>';
    }
}

// ⚡ PAGINAÇÃO ZERO LEITURAS
function mudarPagina(direction) {
    if (buscaAtiva) {
        mudarPaginaBusca(direction);
        return;
    }
    
    direction === 'next' ? currentPage++ : currentPage--;
    
    // ⚡ SEM CONSULTA AO FIREBASE!
    const startIndex = (currentPage - 1) * booksPerPage;
    const endIndex = startIndex + booksPerPage;
    livrosPaginaAtual = cache.todosLivros.slice(startIndex, endIndex);
    
    console.log(`📄 Mudando para página ${currentPage} (0 LEITURAS)`);
    exibirLivros(livrosPaginaAtual);
    atualizarControlesPaginacao();
}

function mudarPaginaBusca(direction) {
    const livrosFiltrados = filtrarLivrosGlobal();
    const totalPages = Math.ceil(livrosFiltrados.length / booksPerPage);
    
    direction === 'next' ? currentPage++ : currentPage--;
    currentPage = Math.max(1, Math.min(currentPage, totalPages));
    
    const startIndex = (currentPage - 1) * booksPerPage;
    const endIndex = startIndex + booksPerPage;
    const livrosPagina = livrosFiltrados.slice(startIndex, endIndex);
    
    exibirLivros(livrosPagina);
    atualizarControlesPaginacaoBusca(livrosFiltrados.length);
}

// ⚡ BUSCA ZERO LEITURAS
function filtrarLivros() {
    if (!termoBusca || termoBusca.trim() === '') {
        buscaAtiva = false;
        currentPage = 1;
        carregarLivros();
        return;
    }
    
    buscaAtiva = true;
    currentPage = 1;
    
    // ⚡ BUSCA NO CACHE - ZERO LEITURAS
    const livrosFiltrados = filtrarLivrosGlobal();
    const startIndex = (currentPage - 1) * booksPerPage;
    const endIndex = startIndex + booksPerPage;
    const livrosPagina = livrosFiltrados.slice(startIndex, endIndex);
    
    console.log(`🔍 Busca: "${termoBusca}" - ${livrosFiltrados.length} resultados (0 LEITURAS)`);
    exibirLivros(livrosPagina);
    atualizarControlesPaginacaoBusca(livrosFiltrados.length);
}

function filtrarLivrosGlobal() {
    if (!termoBusca) return cache.todosLivros;
    
    return cache.todosLivros.filter(livro => 
        livro.livro.toLowerCase().includes(termoBusca) || 
        livro.autor.toLowerCase().includes(termoBusca)
    );
}

// ⚡ LIVROS DISPONÍVEIS - ZERO LEITURAS (USA CACHE)
async function carregarLivrosDisponiveis() {
    const grid = document.getElementById('livrosDisponiveisGrid');
    if (!grid) return;
    
    grid.innerHTML = '<div class="loading">Carregando livros disponíveis...</div>';
    
    try {
        // Garante que cache está carregado
        if (!cache.carregado || !cache.alugueisCarregados) {
            await carregarLivros();
        }
        
        const livrosDisponiveis = cache.todosLivros.map(livro => {
            const alugueisDoLivro = cache.alugueisAtivos.filter(a => a.livroId === livro.id);
            const quantidadeAlugada = alugueisDoLivro.reduce((total, aluguel) => total + aluguel.quantidade, 0);
            const quantidadeDisponivel = livro.quantidade - quantidadeAlugada;
            
            return {
                ...livro,
                quantidadeDisponivel,
                quantidadeAlugada
            };
        }).filter(livro => livro.quantidadeDisponivel > 0);
        
        // Salva para uso nos filtros
        window.livrosDisponiveisFiltrados = livrosDisponiveis;
        
        console.log(`💰 ${livrosDisponiveis.length} livros disponíveis (0 LEITURAS)`);
        exibirLivrosDisponiveis(livrosDisponiveis);
        
    } catch (error) {
        console.error('❌ Erro:', error);
        grid.innerHTML = '<div class="empty-state">Erro ao carregar livros disponíveis.</div>';
    }
}

// ⚡ LIVROS ALUGADOS - ZERO LEITURAS (USA CACHE)
async function carregarLivrosAlugados() {
    const grid = document.getElementById('livrosAlugadosGrid');
    if (!grid) return;
    
    grid.innerHTML = '<div class="loading">Carregando livros alugados...</div>';
    
    try {
        if (!cache.alugueisCarregados) {
            await carregarLivros();
        }
        
        const livrosAlugados = cache.alugueisAtivos.map(aluguel => {
            const livro = cache.todosLivros.find(l => l.id === aluguel.livroId);
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
        
        // Salva para uso nos filtros
        window.livrosAlugadosFiltrados = livrosAlugados;
        
        console.log(`🔄 ${livrosAlugados.length} livros alugados (0 LEITURAS)`);
        exibirLivrosAlugados(livrosAlugados);
        
    } catch (error) {
        console.error('❌ Erro:', error);
        grid.innerHTML = '<div class="empty-state">Erro ao carregar livros alugados.</div>';
    }
}

// ⚡ QUANDO DADOS MUDAM - INVALIDA CACHE
function invalidarCache() {
    cache.carregado = false;
    cache.alugueisCarregados = false;
    cache.todosLivros = [];
    cache.alugueisAtivos = [];
    console.log("🔄 CACHE INVALIDADO - Próxima ação fará 1-2 leituras");
}

// ⚡ CADASTRAR LIVRO - 1 ESCRITA + INVALIDA CACHE
async function cadastrarLivro(e) {
    e.preventDefault();
    
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
        invalidarCache(); // ⚡ FORÇA RECARREGAMENTO NA PRÓXIMA VEZ
        document.getElementById('formCadastro').reset();
        
        // Feedback visual
        const successMessage = document.getElementById('successMessage');
        const errorMessage = document.getElementById('errorMessage');
        if (successMessage) {
            successMessage.style.display = 'block';
            errorMessage.style.display = 'none';
            setTimeout(() => successMessage.style.display = 'none', 3000);
        }
        
        console.log("✅ Livro cadastrado + Cache invalidado");
        
    } catch (error) {
        console.error('❌ Erro ao cadastrar:', error);
        const successMessage = document.getElementById('successMessage');
        const errorMessage = document.getElementById('errorMessage');
        if (successMessage) successMessage.style.display = 'none';
        if (errorMessage) errorMessage.style.display = 'block';
        setTimeout(() => errorMessage.style.display = 'none', 3000);
    }
}

// ⚡ EDITAR LIVRO - 1 ESCRITA + INVALIDA CACHE
async function salvarEdicao() {
    if (!window.livroEditando) return;
    
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
        await carregarLivros();
        fecharModal();
        alert('Livro atualizado com sucesso!');
        console.log("✅ Livro editado + Cache invalidado");
        
    } catch (error) {
        console.error('❌ Erro ao editar:', error);
        alert('Erro ao atualizar livro. Tente novamente.');
    }
}

// ⚡ EXCLUIR LIVRO - 1 ESCRITA + INVALIDA CACHE
async function excluirLivro(livroId) {
    if (confirm('Tem certeza que deseja excluir este livro?')) {
        try {
            await db.collection('livros').doc(livroId).delete();
            invalidarCache();
            await carregarLivros();
            alert('Livro excluído com sucesso!');
            console.log("✅ Livro excluído + Cache invalidado");
        } catch (error) {
            console.error('❌ Erro ao excluir:', error);
            alert('Erro ao excluir livro. Tente novamente.');
        }
    }
}

// ⚡ ALUGAR LIVRO - 1 ESCRITA + INVALIDA CACHE
async function alugarLivro() {
    const clienteNome = document.getElementById('clienteNome').value.trim();
    const quantidade = parseInt(document.getElementById('quantidadeAlugar').value);
    
    if (!window.livroSelecionadoAlugar || !clienteNome || !quantidade) {
        alert("Por favor, preencha todos os campos e selecione um livro!");
        return;
    }
    
    if (quantidade > window.livroSelecionadoAlugar.quantidadeDisponivel) {
        alert(`Quantidade indisponível! Apenas ${window.livroSelecionadoAlugar.quantidadeDisponivel} livros disponíveis.`);
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
        document.getElementById('buscaLivroAlugar').value = '';
        document.getElementById('livroSelecionadoCard').style.display = 'none';
        document.getElementById('btnAlugar').disabled = true;
        window.livroSelecionadoAlugar = null;
        
        await carregarLivrosDisponiveis();
        await carregarLivrosAlugados();
        
        alert('Livro alugado com sucesso!');
        console.log("✅ Livro alugado + Cache invalidado");
        
    } catch (error) {
        console.error('❌ Erro ao alugar:', error);
        alert('Erro ao alugar livro. Tente novamente.');
    }
}

// ⚡ DEVOLVER LIVRO - 1 ESCRITA + INVALIDA CACHE
async function devolverLivro() {
    const quantidade = parseInt(document.getElementById('quantidadeDevolver').value);
    
    if (!window.livroSelecionadoDevolver || !quantidade) {
        alert("Por favor, selecione um livro para devolver!");
        return;
    }
    
    if (quantidade > window.livroSelecionadoDevolver.quantidade) {
        alert(`Quantidade inválida! Apenas ${window.livroSelecionadoDevolver.quantidade} livros foram alugados.`);
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
        document.getElementById('buscaLivroDevolver').value = '';
        document.getElementById('livroDevolucaoSelecionadoCard').style.display = 'none';
        document.getElementById('btnDevolver').disabled = true;
        window.livroSelecionadoDevolver = null;
        
        await carregarLivrosDisponiveis();
        await carregarLivrosAlugados();
        
        alert('Livro devolvido com sucesso!');
        console.log("✅ Livro devolvido + Cache invalidado");
        
    } catch (error) {
        console.error('❌ Erro ao devolver:', error);
        alert('Erro ao devolver livro. Tente novamente.');
    }
}

// FUNÇÕES DE INTERFACE
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
        const alugueisDoLivro = cache.alugueisAtivos.filter(a => a.livroId === livro.id);
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
    const aluguel = window.livrosAlugadosFiltrados.find(a => a.id === aluguelId);
    if (!aluguel) return;
    
    window.livroSelecionadoDevolver = aluguel;
    
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

function editarLivro(livroId) {
    const livroParaEditar = buscaAtiva ? 
        cache.todosLivros.find(l => l.id === livroId) : 
        livrosPaginaAtual.find(l => l.id === livroId);
    
    if (livroParaEditar) {
        window.livroEditando = livroParaEditar;
        
        document.getElementById('editLivro').value = window.livroEditando.livro || '';
        document.getElementById('editAutor').value = window.livroEditando.autor || '';
        document.getElementById('editCategoria').value = window.livroEditando.categoria || '';
        document.getElementById('editQuantidade').value = window.livroEditando.quantidade || '';
        document.getElementById('editPrateleira').value = window.livroEditando.prateleira || '';
        document.getElementById('editBandeja').value = window.livroEditando.bandeja || '';
        
        document.getElementById('editModal').style.display = 'block';
    }
}

function fecharModal() {
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.style.display = 'none';
    }
    window.livroEditando = null;
}

function atualizarControlesPaginacao() {
    const totalPages = Math.ceil(cache.todosLivros.length / booksPerPage);
    const pageInfo = `Página ${currentPage} de ${totalPages}`;
    const resultsInfo = `${livrosPaginaAtual.length} livros nesta página`;
    
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

// Variáveis globais para as páginas de aluguel
window.livrosDisponiveisFiltrados = [];
window.livrosAlugadosFiltrados = [];
window.livroSelecionadoAlugar = null;
window.livroSelecionadoDevolver = null;
window.livroEditando = null;
