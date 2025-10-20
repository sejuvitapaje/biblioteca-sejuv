const firebaseConfig = {
    apiKey: "AIzaSyBgCJzenRbgpScy-LWi3sEccNvHXbr1uuY",
    authDomain: "biblioteca-b97fb.firebaseapp.com",
    projectId: "biblioteca-b97fb",
    storageBucket: "biblioteca-b97fb.firebasestorage.app",
    messagingSenderId: "699649848975",
    appId: "1:699649848975:web:187b6647f5b2fbc6a622fa",
    measurementId: "G-N9FF16T3KF"
};

// ⚡ SISTEMA OFFLINE-FIRST - LEITURAS MÍNIMAS
let sistema = {
    cache: {
        livros: [],
        alugueis: [],
        timestamp: null,
        carregado: false,
        carregando: false,
        primeiraCargaFeita: false
    },
    estado: {
        paginaAtual: 1,
        livrosPorPagina: 20,
        termoBusca: '',
        filtroPrateleira: ''
    },
    contadores: {
        leiturasFirebase: 0,
        ultimaLeitura: null
    }
};

// ✅ CARREGA CACHE DO LOCALSTORAGE (0 LEITURAS)
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
                sistema.cache.primeiraCargaFeita = true;
                console.log(`♻️ Cache carregado: ${sistema.cache.livros.length} livros, ${sistema.cache.alugueis.length} aluguéis`);
                return true;
            } else {
                console.log("📅 Cache expirado, necessária nova carga");
            }
        }
    } catch (e) {
        console.log("ℹ️ Sem cache anterior ou cache corrompido");
    }
    return false;
}

// ✅ SALVA CACHE NO LOCALSTORAGE (0 LEITURAS)
function salvarCache() {
    try {
        sistema.cache.timestamp = Date.now();
        localStorage.setItem('biblioteca_cache', JSON.stringify(sistema.cache));
    } catch (e) {
        console.error("❌ Erro ao salvar cache:", e);
    }
}

// ✅ INICIALIZAÇÃO SEGURA
let db;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log("🔥 Firebase conectado");
} catch (error) {
    console.error("❌ Erro no Firebase:", error);
}

document.addEventListener('DOMContentLoaded', function() {
    console.log("📚 Sistema carregado - Modo Offline First");
    
    // ⚡ PRIMEIRO: TENTA CACHE LOCAL (INSTANTÂNEO - 0 LEITURAS)
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
        } else {
            // Carrega dados automaticamente mas COM CONTROLE
            carregarDadosFirebase();
        }
    }
    
    if (document.getElementById('buscaLivroAlugar')) {
        console.log("💰 Página de aluguel");
        inicializarBuscaAluguel();
        
        // Carrega dados automaticamente mas COM CONTROLE
        if (sistema.cache.carregado) {
            carregarLivrosDisponiveis();
        } else {
            // Mostra loading e carrega dados
            document.getElementById('livrosDisponiveisGrid').innerHTML = '<div class="loading">Carregando livros disponíveis...</div>';
            carregarDadosFirebase().then(() => {
                if (sistema.cache.carregado) {
                    carregarLivrosDisponiveis();
                }
            });
        }
    }
    
    if (document.getElementById('buscaLivroDevolver')) {
        console.log("🔄 Página de devolução");
        inicializarBuscaDevolucao();
        
        // Carrega dados automaticamente mas COM CONTROLE
        if (sistema.cache.carregado) {
            carregarLivrosAlugados();
        } else {
            // Mostra loading e carrega dados
            document.getElementById('livrosAlugadosGrid').innerHTML = '<div class="loading">Carregando livros alugados...</div>';
            carregarDadosFirebase().then(() => {
                if (sistema.cache.carregado) {
                    carregarLivrosAlugados();
                }
            });
        }
    }
    
    // Modal
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.querySelector('.close').addEventListener('click', fecharModal);
        window.addEventListener('click', (e) => e.target === modal && fecharModal());
        document.addEventListener('keydown', (e) => e.key === 'Escape' && fecharModal());
    }
});

// ⚡ FUNÇÃO PRINCIPAL - MÁXIMO 2 LEITURAS (COM CONTROLE RIGOROSO)
async function carregarDadosFirebase() {
    // ⭐ CRÍTICO: Verificações rigorosas para evitar leituras desnecessárias
    if (!db) {
        console.log("❌ Firebase não disponível");
        return false;
    }
    
    if (sistema.cache.carregando) {
        console.log("⏳ Leitura já em andamento...");
        return false;
    }
    
    if (sistema.cache.carregado && sistema.cache.primeiraCargaFeita) {
        console.log("✅ Dados já carregados anteriormente");
        return true;
    }
    
    try {
        sistema.cache.carregando = true;
        console.log("📥 Iniciando leitura do Firebase...");
        
        // Mostra loading state se estiver na página de biblioteca
        if (document.getElementById('livrosList')) {
            document.getElementById('livrosList').innerHTML = '<div class="loading">Carregando biblioteca...</div>';
        }
        
        // ⚡ LEITURA 1: LIVROS (APENAS UMA VEZ) - ⭐ CORREÇÃO: SEM PAGINAÇÃO/LIMITE
        console.log("📚 Buscando TODOS os livros...");
        const livrosSnapshot = await db.collection('livros').get();
        
        sistema.cache.livros = livrosSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // ⚡ LEITURA 2: ALUGUÉIS ATIVOS (APENAS UMA VEZ)
        console.log("📋 Buscando TODOS os aluguéis ativos...");
        const alugueisSnapshot = await db.collection('alugueis')
            .where('dataDevolucao', '==', null)
            .get();
        
        sistema.cache.alugueis = alugueisSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // ⭐ ATUALIZA ESTADO DO CACHE
        sistema.cache.carregado = true;
        sistema.cache.carregando = false;
        sistema.cache.primeiraCargaFeita = true;
        sistema.cache.timestamp = Date.now();
        
        salvarCache();
        
        // ⭐ ATUALIZA CONTADORES
        sistema.contadores.leiturasFirebase += 2;
        sistema.contadores.ultimaLeitura = new Date();
        
        console.log(`✅ Dados carregados: ${sistema.cache.livros.length} livros, ${sistema.cache.alugueis.length} aluguéis ativos`);
        console.log(`🎯 TOTAL DE LEITURAS FIREBASE: ${sistema.contadores.leiturasFirebase}`);
        
        // ⭐ ATUALIZA TODAS AS INTERFACES VISÍVEIS
        atualizarTodasInterfaces();
        
        return true;
        
    } catch (error) {
        sistema.cache.carregando = false;
        console.error('❌ Erro ao carregar dados:', error);
        
        // Mostra estado de erro
        if (document.getElementById('livrosList')) {
            document.getElementById('livrosList').innerHTML = `
                <div class="empty-state">
                    <p>❌ Erro ao carregar dados</p>
                    <p>Verifique sua conexão com a internet</p>
                    <button onclick="carregarDadosFirebase()" class="btn btn-primary">
                        🔄 Tentar Novamente
                    </button>
                </div>
            `;
        }
        
        return false;
    }
}

// ⭐ NOVA FUNÇÃO: ATUALIZA TODAS AS INTERFACES VISÍVEIS
function atualizarTodasInterfaces() {
    if (!sistema.cache.carregado) return;
    
    // ⭐ CORREÇÃO: ATUALIZA CONTADOR SEMPRE QUE OS DADOS MUDAM
    atualizarContadorLivros();
    
    // Atualiza página da biblioteca se estiver visível
    if (document.getElementById('livrosList')) {
        atualizarInterface();
    }
    
    // Atualiza página de aluguel se estiver visível
    if (document.getElementById('livrosDisponiveisGrid')) {
        carregarLivrosDisponiveis();
    }
    
    // Atualiza página de devolução se estiver visível
    if (document.getElementById('livrosAlugadosGrid')) {
        carregarLivrosAlugados();
    }
}

// ⭐ NOVA FUNÇÃO: ATUALIZA CONTADOR DE LIVROS (0 LEITURAS)
function atualizarContadorLivros() {
    const totalElement = document.getElementById('totalLivros');
    if (totalElement && sistema.cache.carregado) {
        totalElement.textContent = `${sistema.cache.livros.length} livros cadastrados`;
        console.log(`🔢 Contador atualizado: ${sistema.cache.livros.length} livros`);
    }
}

// ⭐ FUNÇÃO CRÍTICA: ATUALIZAÇÃO INCREMENTAL (0 LEITURAS PARA OPERAÇÕES CRUD)
function atualizarCacheLocal(operacao, dados) {
    if (!sistema.cache.carregado) return;
    
    switch(operacao) {
        case 'CADASTRAR_LIVRO':
            sistema.cache.livros.unshift(dados);
            break;
            
        case 'EDITAR_LIVRO':
            const indexEditar = sistema.cache.livros.findIndex(l => l.id === dados.id);
            if (indexEditar !== -1) {
                sistema.cache.livros[indexEditar] = { 
                    ...sistema.cache.livros[indexEditar], 
                    ...dados 
                };
            }
            break;
            
        case 'EXCLUIR_LIVRO':
            sistema.cache.livros = sistema.cache.livros.filter(l => l.id !== dados.id);
            // Remove aluguéis relacionados
            sistema.cache.alugueis = sistema.cache.alugueis.filter(a => a.livroId !== dados.id);
            break;
            
        case 'ALUGAR_LIVRO':
            sistema.cache.alugueis.push(dados);
            break;
            
        case 'DEVOLVER_LIVRO':
            if (dados.devolucaoTotal) {
                sistema.cache.alugueis = sistema.cache.alugueis.filter(a => a.id !== dados.id);
            } else {
                const indexAluguel = sistema.cache.alugueis.findIndex(a => a.id === dados.id);
                if (indexAluguel !== -1) {
                    sistema.cache.alugueis[indexAluguel].quantidade = dados.novaQuantidade;
                }
            }
            break;
    }
    
    salvarCache();
    console.log(`🔄 Cache atualizado: ${operacao}`);
    
    // ⭐ CORREÇÃO: ATUALIZA CONTADOR APÓS QUALQUER MODIFICAÇÃO
    atualizarContadorLivros();
    
    // Atualiza interfaces após modificação
    setTimeout(atualizarTodasInterfaces, 100);
}

// ⚡ CADASTRAR LIVRO - 0 LEITURAS, 1 ESCRITA
async function cadastrarLivro(e) {
    e.preventDefault();
    
    if (!db) {
        alert("❌ Firebase não disponível. Modo offline.");
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
        valor === '' || (typeof valor === 'string' && !valor.trim()) || 
        (typeof valor === 'number' && (isNaN(valor) || valor <= 0))
    )) {
        alert("Por favor, preencha todos os campos corretamente!");
        return;
    }
    
    try {
        // ⭐ ESCRITA NO FIREBASE (1 ESCRITA)
        const docRef = await db.collection('livros').add(livroData);
        const livroComId = { id: docRef.id, ...livroData };
        
        // ⭐ ATUALIZAÇÃO LOCAL (0 LEITURAS)
        atualizarCacheLocal('CADASTRAR_LIVRO', livroComId);
        
        document.getElementById('formCadastro').reset();
        
        // Feedback
        const successMessage = document.getElementById('successMessage');
        if (successMessage) {
            successMessage.style.display = 'block';
            setTimeout(() => successMessage.style.display = 'none', 3000);
        }
        
        console.log("✅ Livro cadastrado (0 leituras, 1 escrita)");
        
    } catch (error) {
        console.error('❌ Erro ao cadastrar:', error);
        alert('Erro ao cadastrar livro.');
    }
}

// ⚡ EDITAR LIVRO - 0 LEITURAS, 1 ESCRITA
async function salvarEdicao() {
    if (!window.livroEditando || !db) return;
    
    try {
        const dadosAtualizados = {
            livro: document.getElementById('editLivro').value.trim(),
            autor: document.getElementById('editAutor').value.trim(),
            categoria: document.getElementById('editCategoria').value.trim(),
            quantidade: parseInt(document.getElementById('editQuantidade').value),
            prateleira: document.getElementById('editPrateleira').value.trim(),
            bandeja: document.getElementById('editBandeja').value.trim()
        };
        
        // ⭐ ESCRITA NO FIREBASE (1 ESCRITA)
        await db.collection('livros').doc(window.livroEditando.id).update(dadosAtualizados);
        
        // ⭐ ATUALIZAÇÃO LOCAL (0 LEITURAS)
        atualizarCacheLocal('EDITAR_LIVRO', {
            id: window.livroEditando.id,
            ...dadosAtualizados
        });
        
        fecharModal();
        alert('Livro atualizado com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro ao editar:', error);
        alert('Erro ao atualizar livro.');
    }
}

// ⚡ EXCLUIR LIVRO - 0 LEITURAS, 1 ESCRITA
async function excluirLivro(livroId) {
    if (!db) return;
    
    if (confirm('Tem certeza que deseja excluir este livro?')) {
        try {
            // ⭐ ESCRITA NO FIREBASE (1 ESCRITA)
            await db.collection('livros').doc(livroId).delete();
            
            // ⭐ ATUALIZAÇÃO LOCAL (0 LEITURAS)
            atualizarCacheLocal('EXCLUIR_LIVRO', { id: livroId });
            
            alert('Livro excluído com sucesso!');
            
        } catch (error) {
            console.error('❌ Erro ao excluir:', error);
            alert('Erro ao excluir livro.');
        }
    }
}

// ⚡ ALUGAR LIVRO - 0 LEITURAS, 1 ESCRITA
async function alugarLivro() {
    if (!db) return;
    
    const clienteNome = document.getElementById('clienteNome').value.trim();
    const quantidade = parseInt(document.getElementById('quantidadeAlugar').value);
    
    if (!window.livroSelecionadoAlugar || !clienteNome || !quantidade) {
        alert("Por favor, preencha todos os campos!");
        return;
    }
    
    // Verifica se a quantidade é válida
    if (quantidade > window.livroSelecionadoAlugar.quantidadeDisponivel) {
        alert(`Quantidade indisponível! Apenas ${window.livroSelecionadoAlugar.quantidadeDisponivel} livros disponíveis.`);
        return;
    }
    
    try {
        const aluguelData = {
            livroId: window.livroSelecionadoAlugar.id,
            clienteNome: clienteNome,
            quantidade: quantidade,
            dataAluguel: new Date(),
            dataDevolucao: null,
            prazoDevolucao: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        };
        
        // ⭐ ESCRITA NO FIREBASE (1 ESCRITA)
        const docRef = await db.collection('alugueis').add(aluguelData);
        
        // ⭐ ATUALIZAÇÃO LOCAL (0 LEITURAS)
        atualizarCacheLocal('ALUGAR_LIVRO', {
            id: docRef.id,
            ...aluguelData
        });
        
        document.getElementById('clienteNome').value = '';
        document.getElementById('livroSelecionadoCard').style.display = 'none';
        window.livroSelecionadoAlugar = null;
        
        alert('Livro alugado com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro ao alugar:', error);
        alert('Erro ao alugar livro.');
    }
}

// ⚡ DEVOLVER LIVRO - 0 LEITURAS, 1 ESCRITA
async function devolverLivro() {
    if (!db) return;
    
    const quantidade = parseInt(document.getElementById('quantidadeDevolver').value);
    
    if (!window.livroSelecionadoDevolver || !quantidade) {
        alert("Selecione um livro para devolver!");
        return;
    }
    
    if (quantidade > window.livroSelecionadoDevolver.quantidade) {
        alert(`Quantidade inválida! Apenas ${window.livroSelecionadoDevolver.quantidade} livros alugados.`);
        return;
    }
    
    try {
        if (quantidade === window.livroSelecionadoDevolver.quantidade) {
            // ⭐ ESCRITA NO FIREBASE (1 ESCRITA)
            await db.collection('alugueis').doc(window.livroSelecionadoDevolver.id).update({
                dataDevolucao: new Date()
            });
            
            // ⭐ ATUALIZAÇÃO LOCAL (0 LEITURAS)
            atualizarCacheLocal('DEVOLVER_LIVRO', {
                id: window.livroSelecionadoDevolver.id,
                devolucaoTotal: true
            });
            
        } else {
            const novaQuantidade = window.livroSelecionadoDevolver.quantidade - quantidade;
            // ⭐ ESCRITA NO FIREBASE (1 ESCRITA)
            await db.collection('alugueis').doc(window.livroSelecionadoDevolver.id).update({
                quantidade: novaQuantidade
            });
            
            // ⭐ ATUALIZAÇÃO LOCAL (0 LEITURAS)
            atualizarCacheLocal('DEVOLVER_LIVRO', {
                id: window.livroSelecionadoDevolver.id,
                devolucaoTotal: false,
                novaQuantidade: novaQuantidade
            });
        }
        
        document.getElementById('livroDevolucaoSelecionadoCard').style.display = 'none';
        window.livroSelecionadoDevolver = null;
        
        alert('Livro devolvido com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro ao devolver:', error);
        alert('Erro ao devolver livro.');
    }
}

// ⚡ FUNÇÕES DE CONSULTA (0 LEITURAS - USAM CACHE LOCAL)
function carregarLivrosDisponiveis() {
    const grid = document.getElementById('livrosDisponiveisGrid');
    if (!grid) return;
    
    if (!sistema.cache.carregado) {
        grid.innerHTML = '<div class="loading">Carregando dados...</div>';
        return;
    }
    
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

function carregarLivrosAlugados() {
    const grid = document.getElementById('livrosAlugadosGrid');
    if (!grid) return;
    
    if (!sistema.cache.carregado) {
        grid.innerHTML = '<div class="loading">Carregando dados...</div>';
        return;
    }
    
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

// ⚡ ATUALIZA INTERFACE COM DADOS LOCAIS (0 LEITURAS)
function atualizarInterface() {
    if (!sistema.cache.carregado) return;
    
    // ⭐ CORREÇÃO: CONTADOR SEMPRE ATUALIZADO
    atualizarContadorLivros();
    
    // Aplica filtros e paginação
    aplicarFiltrosEPaginacao();
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

function filtrarLivrosDisponiveis() {
    const termo = document.getElementById('buscaLivroAlugar').value.toLowerCase();
    if (!termo) {
        carregarLivrosDisponiveis();
        return;
    }
    
    if (!window.livrosDisponiveisFiltrados) return;
    
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
    
    if (!window.livrosAlugadosFiltrados) return;
    
    const livrosFiltrados = window.livrosAlugadosFiltrados.filter(livro => 
        livro.livro.toLowerCase().includes(termo) || 
        livro.autor.toLowerCase().includes(termo) ||
        livro.clienteNome.toLowerCase().includes(termo)
    );
    exibirLivrosAlugados(livrosFiltrados);
}

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

function inicializarFiltros() {
    const filtroPrateleiraSelect = document.getElementById('filtroPrateleira');
    const limparFiltrosBtn = document.getElementById('limparFiltros');
    
    if (filtroPrateleiraSelect) {
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

function mudarPagina(direction) {
    if (direction === 'next') {
        sistema.estado.paginaAtual++;
    } else {
        sistema.estado.paginaAtual--;
    }
    aplicarFiltrosEPaginacao();
}

// Variáveis globais
window.livrosDisponiveisFiltrados = null;
window.livrosAlugadosFiltrados = null;
window.livroSelecionadoAlugar = null;
window.livroSelecionadoDevolver = null;
window.livroEditando = null;
