const firebaseConfig = {
    apiKey: "AIzaSyBgCJzenRbgpScy-LWi3sEccNvHXbr1uuY",
    authDomain: "biblioteca-b97fb.firebaseapp.com",
    projectId: "biblioteca-b97fb",
    storageBucket: "biblioteca-b97fb.firebasestorage.app",
    messagingSenderId: "699649848975",
    appId: "1:699649848975:web:187b6647f5b2fbc6a622fa",
    measurementId: "G-N9FF16T3KF"
};

let sistema = {
    cache: {
        livros: [],
        alugueis: [],
        timestamp: null,
        carregado: false,
        carregando: false,
        primeiraCargaFeita: false,
        versaoCache: '2.1',
        ultimaSincronizacao: null
    },
    estado: {
        paginaAtual: 1,
        livrosPorPagina: 20,
        termoBusca: '',
        filtroPrateleira: ''
    },
    contadores: {
        leiturasFirebase: 0,
        ultimaLeitura: null,
        livrosCadastrados: 0,
        quantidadeTotalLivros: 0
    },
    sincronizacao: {
        emAndamento: false,
        ultimaVerificacao: null,
        listenersAtivos: false
    }
};

function carregarCache() {
    try {
        const cacheSalvo = localStorage.getItem('biblioteca_cache');
        if (cacheSalvo) {
            const dados = JSON.parse(cacheSalvo);
            
            if (dados.versaoCache !== sistema.cache.versaoCache) {
                return false;
            }
            
            if (Date.now() - dados.timestamp < 7200000) {
                sistema.cache.livros = dados.livros || [];
                sistema.cache.alugueis = dados.alugueis || [];
                sistema.cache.timestamp = dados.timestamp;
                sistema.cache.carregado = sistema.cache.livros.length > 0;
                sistema.cache.primeiraCargaFeita = true;
                sistema.cache.ultimaSincronizacao = dados.ultimaSincronizacao;
                
                sistema.contadores.livrosCadastrados = sistema.cache.livros.length;
                sistema.contadores.quantidadeTotalLivros = calcularQuantidadeTotal();
                
                return true;
            }
        }
    } catch (e) {
    }
    return false;
}

function salvarCache() {
    try {
        sistema.cache.timestamp = Date.now();
        sistema.cache.ultimaSincronizacao = new Date();
        sistema.cache.versaoCache = '2.1';
        
        localStorage.setItem('biblioteca_cache', JSON.stringify(sistema.cache));
    } catch (e) {
    }
}

function calcularQuantidadeTotal() {
    return sistema.cache.livros.reduce((total, livro) => total + (livro.quantidade || 0), 0);
}

let db;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
} catch (error) {
}

document.addEventListener('DOMContentLoaded', function() {
    const temCache = carregarCache();
    
    const formCadastro = document.getElementById('formCadastro');
    if (formCadastro) formCadastro.addEventListener('submit', cadastrarLivro);
    
    if (document.getElementById('livrosList')) {
        inicializarPaginacao();
        inicializarFiltros();
        
        if (temCache) {
            atualizarInterface();
            
            setTimeout(verificarSincronizacao, 2000);
        } else {
            carregarDadosFirebase();
        }
    }
    
    if (document.getElementById('livrosAlugadosGrid')) {
        document.getElementById('livrosAlugadosGrid').innerHTML = '<div class="loading">Carregando livros alugados...</div>';
        carregarDadosFirebase().then(() => {
            if (sistema.cache.carregado) {
                carregarLivrosAlugados();
            }
        });
    }
    
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.querySelector('.close').addEventListener('click', fecharModal);
        window.addEventListener('click', (e) => e.target === modal && fecharModal());
        document.addEventListener('keydown', (e) => e.key === 'Escape' && fecharModal());
    }
    
    if (db && !sistema.sincronizacao.listenersAtivos) {
        iniciarOuvintesTempoReal();
    }
});

function iniciarOuvintesTempoReal() {
    if (!db || sistema.sincronizacao.listenersAtivos) return;
    
    try {
        db.collection('livros')
            .where('dataCadastro', '>', new Date(Date.now() - 86400000))
            .onSnapshot((snapshot) => {
                if (!snapshot.empty && sistema.cache.carregado) {
                    verificarSincronizacao();
                }
            }, (error) => {
            });
        
        sistema.sincronizacao.listenersAtivos = true;
        
    } catch (error) {
    }
}

async function verificarSincronizacao() {
    if (!db || sistema.sincronizacao.emAndamento || !sistema.cache.carregado) return;
    
    if (sistema.sincronizacao.ultimaVerificacao && 
        Date.now() - sistema.sincronizacao.ultimaVerificacao < 300000) {
        return;
    }
    
    sistema.sincronizacao.ultimaVerificacao = Date.now();
    
    try {
        const contadorSnapshot = await db.collection('livros').get();
        const totalFirebase = contadorSnapshot.size;
        const totalLocal = sistema.cache.livros.length;
        
        if (totalFirebase !== totalLocal) {
            if (Math.abs(totalFirebase - totalLocal) <= 10) {
                sincronizarDados();
            }
        }
        
    } catch (error) {
    }
}

function mostrarNotificacaoSincronizacao(diferenca) {
    if (Math.abs(diferenca) <= 2) return;
    
    const notification = document.createElement('div');
    notification.className = 'sync-notification';
    notification.innerHTML = `
        <div class="sync-alert">
            <span>${diferenca > 0 ? diferenca + ' livros novos' : Math.abs(diferenca) + ' livros removidos'} no servidor</span>
            <button onclick="sincronizarDados()" class="btn btn-sm btn-primary">Sincronizar Agora</button>
            <button onclick="this.parentElement.parentElement.remove()" class="btn btn-sm btn-secondary">Ignorar</button>
        </div>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #fff3cd;
        border: 1px solid #ffeaa7;
        padding: 10px;
        border-radius: 5px;
        z-index: 10000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 10000);
}

async function sincronizarDados() {
    if (!db || sistema.sincronizacao.emAndamento) return;
    
    sistema.sincronizacao.emAndamento = true;
    
    try {
        const livrosSnapshot = await db.collection('livros').get();
        const livrosFirebase = livrosSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        const alugueisSnapshot = await db.collection('alugueis')
            .where('dataDevolucao', '==', null)
            .get();
        
        const alugueisFirebase = alugueisSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        sistema.cache.livros = livrosFirebase;
        sistema.cache.alugueis = alugueisFirebase;
        sistema.cache.carregado = true;
        
        salvarCache();
        
        sistema.contadores.leiturasFirebase += 2;
        sistema.contadores.livrosCadastrados = sistema.cache.livros.length;
        sistema.contadores.quantidadeTotalLivros = calcularQuantidadeTotal();
        
        atualizarTodasInterfaces();
        
        document.querySelectorAll('.sync-notification').forEach(n => n.remove());
        
    } catch (error) {
    } finally {
        sistema.sincronizacao.emAndamento = false;
    }
}

async function carregarDadosFirebase() {
    if (!db) {
        return false;
    }
    
    if (sistema.cache.carregando) {
        return false;
    }
    
    if (sistema.cache.carregado && sistema.cache.primeiraCargaFeita) {
        return true;
    }
    
    try {
        sistema.cache.carregando = true;
        
        if (document.getElementById('livrosList')) {
            document.getElementById('livrosList').innerHTML = '<div class="loading">Carregando biblioteca...</div>';
        }
        
        const livrosSnapshot = await db.collection('livros').get();
        
        sistema.cache.livros = livrosSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        const alugueisSnapshot = await db.collection('alugueis')
            .where('dataDevolucao', '==', null)
            .get();
        
        sistema.cache.alugueis = alugueisSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        sistema.cache.carregado = true;
        sistema.cache.carregando = false;
        sistema.cache.primeiraCargaFeita = true;
        
        salvarCache();
        
        sistema.contadores.leiturasFirebase += 2;
        sistema.contadores.livrosCadastrados = sistema.cache.livros.length;
        sistema.contadores.quantidadeTotalLivros = calcularQuantidadeTotal();
        sistema.contadores.ultimaLeitura = new Date();
        
        if (!sistema.sincronizacao.listenersAtivos) {
            iniciarOuvintesTempoReal();
        }
        
        atualizarTodasInterfaces();
        
        return true;
        
    } catch (error) {
        sistema.cache.carregando = false;
        
        if (document.getElementById('livrosList')) {
            document.getElementById('livrosList').innerHTML = `
                <div class="empty-state">
                    <p>Erro ao carregar dados</p>
                    <p>Verifique sua conexão com a internet</p>
                    <button onclick="carregarDadosFirebase()" class="btn btn-primary">
                        Tentar Novamente
                    </button>
                </div>
            `;
        }
        
        return false;
    }
}

function atualizarTodasInterfaces() {
    if (!sistema.cache.carregado) return;
    
    atualizarContadorLivros();
    
    if (document.getElementById('livrosList')) {
        atualizarInterface();
    }
    
    if (document.getElementById('livrosAlugadosGrid')) {
        carregarLivrosAlugados();
    }
}

function atualizarContadorLivros() {
    const totalElement = document.getElementById('totalLivros');
    if (totalElement && sistema.cache.carregado) {
        totalElement.textContent = `${sistema.cache.livros.length} títulos cadastrados | ${sistema.contadores.quantidadeTotalLivros} livros no total`;
    }
}

function atualizarCacheLocal(operacao, dados) {
    if (!sistema.cache.carregado) return;
    
    let mudou = false;
    
    switch(operacao) {
        case 'CADASTRAR_LIVRO':
            sistema.cache.livros.unshift(dados);
            mudou = true;
            break;
            
        case 'EDITAR_LIVRO':
            const indexEditar = sistema.cache.livros.findIndex(l => l.id === dados.id);
            if (indexEditar !== -1) {
                sistema.cache.livros[indexEditar] = { 
                    ...sistema.cache.livros[indexEditar], 
                    ...dados 
                };
                mudou = true;
            }
            break;
            
        case 'EXCLUIR_LIVRO':
            const antes = sistema.cache.livros.length;
            sistema.cache.livros = sistema.cache.livros.filter(l => l.id !== dados.id);
            sistema.cache.alugueis = sistema.cache.alugueis.filter(a => a.livroId !== dados.id);
            mudou = sistema.cache.livros.length !== antes;
            break;
            
        case 'ATUALIZAR_QUANTIDADE':
            const indexAtualizar = sistema.cache.livros.findIndex(l => l.id === dados.id);
            if (indexAtualizar !== -1) {
                sistema.cache.livros[indexAtualizar].quantidade += dados.quantidade;
                mudou = true;
            }
            break;
    }
    
    if (mudou) {
        sistema.contadores.quantidadeTotalLivros = calcularQuantidadeTotal();
        sistema.contadores.livrosCadastrados = sistema.cache.livros.length;
        
        salvarCache();
        atualizarContadorLivros();
        setTimeout(atualizarTodasInterfaces, 100);
    }
}

function verificarLivroExistente(livro, autor) {
    return sistema.cache.livros.find(l => 
        l.livro.toLowerCase() === livro.toLowerCase() && 
        l.autor.toLowerCase() === autor.toLowerCase()
    );
}

async function cadastrarLivro(e) {
    e.preventDefault();
    
    if (!db) {
        alert("Firebase não disponível. Modo offline.");
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
    
    if (Object.values(livroData).some(valor => 
        valor === '' || (typeof valor === 'string' && !valor.trim()) || 
        (typeof valor === 'number' && (isNaN(valor) || valor <= 0))
    )) {
        alert("Por favor, preencha todos os campos corretamente!");
        return;
    }
    
    try {
        const livroExistente = verificarLivroExistente(livroData.livro, livroData.autor);
        
        if (livroExistente) {
            const confirmacao = confirm(
                `Este livro já está cadastrado!\n\n` +
                `Livro: ${livroExistente.livro}\n` +
                `Autor: ${livroExistente.autor}\n` +
                `Quantidade atual: ${livroExistente.quantidade}\n\n` +
                `Deseja adicionar ${livroData.quantidade} unidade(s) à quantidade existente?`
            );
            
            if (confirmacao) {
                const novaQuantidade = livroExistente.quantidade + livroData.quantidade;
                await db.collection('livros').doc(livroExistente.id).update({
                    quantidade: novaQuantidade
                });
                
                atualizarCacheLocal('ATUALIZAR_QUANTIDADE', {
                    id: livroExistente.id,
                    quantidade: livroData.quantidade
                });
                
                document.getElementById('formCadastro').reset();
                
                const successMessage = document.getElementById('successMessage');
                if (successMessage) {
                    successMessage.innerHTML = `Quantidade atualizada! Agora tem ${novaQuantidade} unidade(s) deste livro.`;
                    successMessage.style.display = 'block';
                    setTimeout(() => successMessage.style.display = 'none', 5000);
                }
                
                return;
            } else {
                return;
            }
        }
        
        const docRef = await db.collection('livros').add(livroData);
        const livroComId = { id: docRef.id, ...livroData };
        
        atualizarCacheLocal('CADASTRAR_LIVRO', livroComId);
        
        document.getElementById('formCadastro').reset();
        
        const successMessage = document.getElementById('successMessage');
        if (successMessage) {
            successMessage.innerHTML = 'Livro cadastrado com sucesso!';
            successMessage.style.display = 'block';
            setTimeout(() => successMessage.style.display = 'none', 3000);
        }
        
    } catch (error) {
        alert('Erro ao cadastrar livro.');
    }
}

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
        
        await db.collection('livros').doc(window.livroEditando.id).update(dadosAtualizados);
        
        atualizarCacheLocal('EDITAR_LIVRO', {
            id: window.livroEditando.id,
            ...dadosAtualizados
        });
        
        fecharModal();
        alert('Livro atualizado com sucesso!');
        
    } catch (error) {
        alert('Erro ao atualizar livro.');
    }
}

async function excluirLivro(livroId) {
    if (!db) return;
    
    if (confirm('Tem certeza que deseja excluir este livro?')) {
        try {
            await db.collection('livros').doc(livroId).delete();
            
            atualizarCacheLocal('EXCLUIR_LIVRO', { id: livroId });
            
            alert('Livro excluído com sucesso!');
            
        } catch (error) {
            alert('Erro ao excluir livro.');
        }
    }
}

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
            await db.collection('alugueis').doc(window.livroSelecionadoDevolver.id).update({
                dataDevolucao: new Date()
            });
            
            atualizarCacheLocal('DEVOLVER_LIVRO', {
                id: window.livroSelecionadoDevolver.id,
                devolucaoTotal: true
            });
            
        } else {
            const novaQuantidade = window.livroSelecionadoDevolver.quantidade - quantidade;
            await db.collection('alugueis').doc(window.livroSelecionadoDevolver.id).update({
                quantidade: novaQuantidade
            });
            
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
        alert('Erro ao devolver livro.');
    }
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

function atualizarInterface() {
    if (!sistema.cache.carregado) return;
    
    atualizarContadorLivros();
    aplicarFiltrosEPaginacao();
}

function aplicarFiltrosEPaginacao() {
    if (!sistema.cache.carregado) return;
    
    let livrosFiltrados = sistema.cache.livros;
    
    if (sistema.estado.termoBusca) {
        livrosFiltrados = livrosFiltrados.filter(livro => 
            livro.livro.toLowerCase().includes(sistema.estado.termoBusca) || 
            livro.autor.toLowerCase().includes(sistema.estado.termoBusca)
        );
    }
    
    if (sistema.estado.filtroPrateleira) {
        livrosFiltrados = livrosFiltrados.filter(livro => 
            livro.prateleira === sistema.estado.filtroPrateleira
        );
    }
    
    const startIndex = (sistema.estado.paginaAtual - 1) * sistema.estado.livrosPorPagina;
    const endIndex = startIndex + sistema.estado.livrosPorPagina;
    const livrosPagina = livrosFiltrados.slice(startIndex, endIndex);
    
    exibirLivros(livrosPagina);
    atualizarControlesPaginacao(livrosFiltrados.length);
}

function filtrarLivros() {
    sistema.estado.termoBusca = document.getElementById('searchInput').value.toLowerCase();
    sistema.estado.paginaAtual = 1;
    aplicarFiltrosEPaginacao();
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
                    ${disponivel ? 'Disponível' : 'Indisponível'}
                </span>
            </div>
            <div class="data-cadastro">
                <strong>Cadastrado em:</strong> ${new Date(livro.dataCadastro).toLocaleDateString('pt-BR')}
            </div>
            <div class="livro-actions">
                <button class="btn btn-secondary" onclick="editarLivro('${livro.id}')">Editar</button>
                <button class="btn btn-danger" onclick="excluirLivro('${livro.id}')">Excluir</button>
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

function forcarSincronizacao() {
    if (confirm('Isso irá recarregar todos os dados do servidor para sincronização. Continuar?')) {
        sincronizarDados();
    }
}

window.livrosAlugadosFiltrados = null;
window.livroSelecionadoDevolver = null;
window.livroEditando = null;
