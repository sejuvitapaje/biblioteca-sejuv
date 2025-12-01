const firebaseConfig = {
    apiKey: "AIzaSyBgCJzenRbgpScy-LWi3sEccNvHXbr1uuY",
    authDomain: "biblioteca-b97fb.firebaseapp.com",
    projectId: "biblioteca-b97fb",
    storageBucket: "biblioteca-b97fb.firebasestorage.app",
    messagingSenderId: "699649848975",
    appId: "1:699649848975:web:187b6647f5b2fbc6a622fa",
    measurementId: "G-N9FF16T3KF"
};

let sistemaAluguel = {
    cache: {
        livros: [],
        alugueis: [],
        carregado: false,
        carregando: false,
        versaoCache: '3.0',
        timestamp: null
    },
    estado: {
        livrosSelecionados: [],
        modoMultiplo: false,
        aluguelParaDevolver: null
    }
};

let dbAluguel;
try {
    firebase.initializeApp(firebaseConfig);
    dbAluguel = firebase.firestore();
} catch (error) {
}

function carregarCacheAluguel() {
    try {
        const cacheSalvo = localStorage.getItem('biblioteca_aluguel_cache');
        if (cacheSalvo) {
            const dados = JSON.parse(cacheSalvo);
            if (dados.versaoCache === sistemaAluguel.cache.versaoCache) {
                sistemaAluguel.cache.livros = dados.livros || [];
                sistemaAluguel.cache.alugueis = dados.alugueis || [];
                sistemaAluguel.cache.carregado = true;
                sistemaAluguel.cache.timestamp = dados.timestamp;
                return true;
            }
        }
    } catch (e) {
    }
    return false;
}

function salvarCacheAluguel() {
    try {
        sistemaAluguel.cache.timestamp = Date.now();
        localStorage.setItem('biblioteca_aluguel_cache', JSON.stringify(sistemaAluguel.cache));
    } catch (e) {
    }
}

async function carregarDadosFirebaseAluguel() {
    if (!dbAluguel) return false;
    
    try {
        sistemaAluguel.cache.carregando = true;
        
        const livrosSnapshot = await dbAluguel.collection('livros').get();
        sistemaAluguel.cache.livros = livrosSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        const alugueisSnapshot = await dbAluguel.collection('alugueis')
            .where('dataDevolucao', '==', null)
            .get();
        sistemaAluguel.cache.alugueis = alugueisSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        sistemaAluguel.cache.carregado = true;
        sistemaAluguel.cache.carregando = false;
        
        salvarCacheAluguel();
        
        atualizarInterfaceAluguel();
        
        return true;
        
    } catch (error) {
        sistemaAluguel.cache.carregando = false;
        return false;
    }
}

function atualizarInterfaceAluguel() {
    if (!sistemaAluguel.cache.carregado) return;
    
    carregarLivrosDisponiveis();
    carregarLivrosAlugados();
}

document.addEventListener('DOMContentLoaded', function() {
    const temCache = carregarCacheAluguel();
    
    const modoMultiplo = document.getElementById('modoMultiploLivros');
    if (modoMultiplo) {
        modoMultiplo.addEventListener('change', alternarModoMultiplo);
    }
    
    const buscaLivro = document.getElementById('buscaLivroAlugar');
    if (buscaLivro) {
        let timeout;
        buscaLivro.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(filtrarLivrosDisponiveis, 300);
        });
    }
    
    const buscaDevolver = document.getElementById('buscaLivroDevolver');
    if (buscaDevolver) {
        let timeout;
        buscaDevolver.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(filtrarLivrosAlugados, 300);
        });
    }
    
    const clienteNome = document.getElementById('clienteNome');
    const enderecoRua = document.getElementById('enderecoRua');
    const enderecoBairro = document.getElementById('enderecoBairro');
    const enderecoNumero = document.getElementById('enderecoNumero');
    
    [clienteNome, enderecoRua, enderecoBairro, enderecoNumero].forEach(input => {
        if (input) {
            input.addEventListener('input', atualizarBotoesAluguel);
        }
    });
    
    criarContainerLivrosSelecionados();
    
    if (temCache) {
        atualizarInterfaceAluguel();
    } else {
        carregarDadosFirebaseAluguel();
    }
    
    if (dbAluguel) {
        iniciarOuvintesTempoRealAluguel();
    }
});

function iniciarOuvintesTempoRealAluguel() {
    if (!dbAluguel) return;
    
    try {
        dbAluguel.collection('alugueis')
            .where('dataDevolucao', '==', null)
            .onSnapshot(() => {
                carregarDadosFirebaseAluguel();
            });
            
        dbAluguel.collection('livros').onSnapshot(() => {
            carregarDadosFirebaseAluguel();
        });
    } catch (error) {
    }
}

function alternarModoMultiplo() {
    const checkbox = document.getElementById('modoMultiploLivros');
    sistemaAluguel.estado.modoMultiplo = checkbox.checked;
    
    const btnAlugar = document.getElementById('btnAlugar');
    if (btnAlugar) {
        if (sistemaAluguel.estado.modoMultiplo) {
            btnAlugar.innerHTML = '<i class="fas fa-check-double"></i> Alugar Todos os Livros';
        } else {
            btnAlugar.innerHTML = '<i class="fas fa-check"></i> Alugar Livro';
        }
    }
    
    limparSelecao();
}

function carregarLivrosDisponiveis() {
    const grid = document.getElementById('livrosDisponiveisGrid');
    if (!grid || !sistemaAluguel.cache.carregado) return;
    
    const livrosDisponiveis = sistemaAluguel.cache.livros.map(livro => {
        const alugueisDoLivro = sistemaAluguel.cache.alugueis.filter(a => a.livroId === livro.id);
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
    if (!grid || !sistemaAluguel.cache.carregado) return;
    
    const alugueisAtivos = sistemaAluguel.cache.alugueis;
    
    if (alugueisAtivos.length === 0) {
        grid.innerHTML = '<div class="empty-state">Nenhum livro alugado no momento</div>';
        return;
    }
    
    window.livrosAlugadosFiltrados = alugueisAtivos;
    exibirLivrosAlugados(alugueisAtivos);
}

function recarregarAlugados() {
    carregarDadosFirebaseAluguel();
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
    
    const livrosFiltrados = window.livrosAlugadosFiltrados.filter(aluguel =>
        aluguel.livroNome.toLowerCase().includes(termo) ||
        aluguel.autor?.toLowerCase().includes(termo) ||
        aluguel.clienteNome.toLowerCase().includes(termo)
    );
    
    exibirLivrosAlugados(livrosFiltrados);
}

function exibirLivrosDisponiveis(livros) {
    const grid = document.getElementById('livrosDisponiveisGrid');
    if (!grid) return;
    
    if (livros.length === 0) {
        grid.innerHTML = '<div class="empty-state">Nenhum livro disponível</div>';
        return;
    }
    
    grid.innerHTML = livros.map(livro => {
        const jaSelecionado = sistemaAluguel.estado.livrosSelecionados.find(l => l.id === livro.id);
        const classeQuantidade = livro.quantidadeDisponivel <= 2 ? 'pouco' : '';
        const classeSelecionado = jaSelecionado ? 'selecionado' : '';
        
        return `
        <div class="livro-disponivel-card ${classeSelecionado}" onclick="selecionarLivroAlugar('${livro.id}')">
            <h4>${livro.livro} ${jaSelecionado ? '<span class="badge-selecionado">✓</span>' : ''}</h4>
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
            ${jaSelecionado ? `
            <div class="livro-disponivel-info">
                <strong>Quantidade:</strong> 
                <input type="number" class="quantidade-input" value="${jaSelecionado.quantidade}" 
                       min="1" max="${livro.quantidadeDisponivel}" 
                       onchange="atualizarQuantidadeLivro('${livro.id}', this.value)">
            </div>
            ` : ''}
        </div>
        `;
    }).join('');
}

function exibirLivrosAlugados(alugueis) {
    const grid = document.getElementById('livrosAlugadosGrid');
    if (!grid) return;
    
    if (alugueis.length === 0) {
        grid.innerHTML = '<div class="empty-state">Nenhum livro alugado no momento</div>';
        return;
    }
    
    grid.innerHTML = alugueis.map(aluguel => {
        const livro = sistemaAluguel.cache.livros.find(l => l.id === aluguel.livroId) || {};
        
        return `
        <div class="livro-alugado-card" onclick="abrirModalDevolver('${aluguel.id}')">
            <h4>${aluguel.livroNome || livro.livro || 'Livro não encontrado'}</h4>
            <div class="livro-alugado-info">
                <strong>Autor:</strong> ${livro.autor || 'Não informado'}
            </div>
            <div class="livro-alugado-info">
                <strong>Cliente:</strong> ${aluguel.clienteNome}
            </div>
            <div class="livro-alugado-info">
                <strong>Quantidade Alugada:</strong> ${aluguel.quantidade}
            </div>
            <div class="livro-alugado-info">
                <strong>Alugado em:</strong> ${new Date(aluguel.dataAluguel?.toDate ? aluguel.dataAluguel.toDate() : aluguel.dataAluguel).toLocaleDateString('pt-BR')}
            </div>
            <div class="livro-alugado-info">
                <strong>Endereço:</strong> ${aluguel.endereco?.rua}, ${aluguel.endereco?.numero} - ${aluguel.endereco?.bairro}
            </div>
            <div class="livro-alugado-actions">
                <button class="btn btn-sm btn-warning" onclick="editarAluguel('${aluguel.id}', event)">
                    <i class="fas fa-edit"></i> Editar
                </button>
            </div>
        </div>
        `;
    }).join('');
}

function selecionarLivroAlugar(livroId) {
    const livro = window.livrosDisponiveisFiltrados.find(l => l.id === livroId);
    if (!livro) return;
    
    if (!sistemaAluguel.estado.modoMultiplo) {
        sistemaAluguel.estado.livrosSelecionados = [];
    }
    
    const index = sistemaAluguel.estado.livrosSelecionados.findIndex(l => l.id === livroId);
    
    if (index === -1) {
        sistemaAluguel.estado.livrosSelecionados.push({
            id: livro.id,
            livro: livro.livro,
            autor: livro.autor,
            quantidade: 1,
            quantidadeDisponivel: livro.quantidadeDisponivel,
            quantidadeMaxima: livro.quantidadeDisponivel
        });
    } else {
        if (!sistemaAluguel.estado.modoMultiplo) {
            sistemaAluguel.estado.livrosSelecionados.splice(index, 1);
        }
    }
    
    carregarLivrosDisponiveis();
    atualizarLivrosSelecionados();
    atualizarBotoesAluguel();
}

function atualizarQuantidadeLivro(livroId, quantidade) {
    const quantidadeNum = parseInt(quantidade);
    const livroSelecionado = sistemaAluguel.estado.livrosSelecionados.find(l => l.id === livroId);
    
    if (livroSelecionado && quantidadeNum > 0 && quantidadeNum <= livroSelecionado.quantidadeMaxima) {
        livroSelecionado.quantidade = quantidadeNum;
        atualizarLivrosSelecionados();
    }
}

function criarContainerLivrosSelecionados() {
    const container = document.createElement('div');
    container.id = 'livrosSelecionadosContainer';
    container.className = 'livros-selecionados-container';
    
    const card = document.querySelector('.card');
    if (card) {
        const btnAlugar = document.getElementById('btnAlugar');
        if (btnAlugar) {
            card.insertBefore(container, btnAlugar.parentElement);
        }
    }
}

function atualizarLivrosSelecionados() {
    const container = document.getElementById('livrosSelecionadosContainer');
    if (!container) return;
    
    if (sistemaAluguel.estado.livrosSelecionados.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    const totalLivros = sistemaAluguel.estado.livrosSelecionados.reduce((total, livro) => total + livro.quantidade, 0);
    
    container.innerHTML = `
        <div class="livros-selecionados-card">
            <h4>Livros Selecionados (${sistemaAluguel.estado.livrosSelecionados.length} título(s), ${totalLivros} livro(s))</h4>
            <div class="livros-selecionados-list">
                ${sistemaAluguel.estado.livrosSelecionados.map((livro, index) => `
                <div class="livro-selecionado-item">
                    <div class="livro-item-header">
                        <span class="livro-numero">${index + 1}.</span>
                        <strong>${livro.livro}</strong>
                        <span class="livro-quantidade">${livro.quantidade} unidade(s)</span>
                        <button class="btn-remover-livro" onclick="removerLivroSelecionado('${livro.id}')">×</button>
                    </div>
                    <div class="livro-item-info">
                        <span>Autor: ${livro.autor}</span>
                        <input type="number" class="quantidade-input-sm" value="${livro.quantidade}" 
                               min="1" max="${livro.quantidadeMaxima}" 
                               onchange="atualizarQuantidadeLivro('${livro.id}', this.value)">
                    </div>
                </div>
                `).join('')}
            </div>
        </div>
    `;
}

function removerLivroSelecionado(livroId) {
    sistemaAluguel.estado.livrosSelecionados = sistemaAluguel.estado.livrosSelecionados.filter(
        l => l.id !== livroId
    );
    
    carregarLivrosDisponiveis();
    atualizarLivrosSelecionados();
    atualizarBotoesAluguel();
}

function atualizarBotoesAluguel() {
    const btnAlugar = document.getElementById('btnAlugar');
    const clienteNome = document.getElementById('clienteNome')?.value.trim();
    const enderecoRua = document.getElementById('enderecoRua')?.value.trim();
    const enderecoBairro = document.getElementById('enderecoBairro')?.value.trim();
    const enderecoNumero = document.getElementById('enderecoNumero')?.value.trim();
    
    if (btnAlugar) {
        const temLivrosSelecionados = sistemaAluguel.estado.livrosSelecionados.length > 0;
        const temDadosCliente = clienteNome && enderecoRua && enderecoBairro && enderecoNumero;
        
        btnAlugar.disabled = !(temLivrosSelecionados && temDadosCliente);
    }
}

function validarFormularioCliente() {
    const clienteNome = document.getElementById('clienteNome')?.value.trim();
    const enderecoRua = document.getElementById('enderecoRua')?.value.trim();
    const enderecoBairro = document.getElementById('enderecoBairro')?.value.trim();
    const enderecoNumero = document.getElementById('enderecoNumero')?.value.trim();
    
    if (!clienteNome) {
        alert('Por favor, informe o nome do cliente.');
        return false;
    }
    
    if (!enderecoRua) {
        alert('Por favor, informe a rua.');
        return false;
    }
    
    if (!enderecoBairro) {
        alert('Por favor, informe o bairro.');
        return false;
    }
    
    if (!enderecoNumero) {
        alert('Por favor, informe o número.');
        return false;
    }
    
    if (sistemaAluguel.estado.livrosSelecionados.length === 0) {
        alert('Selecione pelo menos um livro para alugar.');
        return false;
    }
    
    return true;
}

async function alugarLivro() {
    if (!dbAluguel) {
        alert('Firebase não disponível. Modo offline.');
        return;
    }
    
    if (!validarFormularioCliente()) {
        return;
    }
    
    const clienteNome = document.getElementById('clienteNome').value.trim();
    const enderecoRua = document.getElementById('enderecoRua').value.trim();
    const enderecoBairro = document.getElementById('enderecoBairro').value.trim();
    const enderecoNumero = document.getElementById('enderecoNumero').value.trim();
    const enderecoComplemento = document.getElementById('enderecoComplemento').value.trim();
    
    try {
        const promessasAluguel = [];
        const dataAluguel = new Date();
        
        for (const livro of sistemaAluguel.estado.livrosSelecionados) {
            const livroOriginal = sistemaAluguel.cache.livros.find(l => l.id === livro.id);
            
            const aluguelData = {
                livroId: livro.id,
                livroNome: livro.livro,
                autor: livro.autor,
                clienteNome: clienteNome,
                quantidade: livro.quantidade,
                dataAluguel: dataAluguel,
                dataDevolucao: null,
                prazoDevolucao: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                endereco: {
                    rua: enderecoRua,
                    bairro: enderecoBairro,
                    numero: enderecoNumero,
                    complemento: enderecoComplemento || ''
                }
            };
            
            promessasAluguel.push(dbAluguel.collection('alugueis').add(aluguelData));
        }
        
        await Promise.all(promessasAluguel);
        
        const totalLivros = sistemaAluguel.estado.livrosSelecionados.reduce((total, livro) => total + livro.quantidade, 0);
        const totalTitulos = sistemaAluguel.estado.livrosSelecionados.length;
        
        alert(`Aluguel realizado com sucesso!\n\nCliente: ${clienteNome}\nTotal de livros: ${totalLivros}\nTítulos diferentes: ${totalTitulos}\nPrazo de devolução: 30 dias`);
        
        limparFormularioAluguel();
        
        carregarDadosFirebaseAluguel();
        
    } catch (error) {
        alert('Erro ao realizar aluguel: ' + error.message);
    }
}

function abrirModalDevolver(aluguelId) {
    const aluguel = sistemaAluguel.cache.alugueis.find(a => a.id === aluguelId);
    if (!aluguel) return;
    
    sistemaAluguel.estado.aluguelParaDevolver = aluguel;
    
    document.getElementById('modalClienteNome').textContent = aluguel.clienteNome;
    document.getElementById('modalLivroNome').textContent = aluguel.livroNome || 'Livro não encontrado';
    document.getElementById('modalQuantidadeAlugada').textContent = aluguel.quantidade;
    document.getElementById('modalQuantidadeDevolver').value = aluguel.quantidade;
    document.getElementById('modalQuantidadeDevolver').max = aluguel.quantidade;
    document.getElementById('modalQuantidadeDevolver').min = 1;
    
    document.getElementById('devolverModal').style.display = 'block';
}

function fecharModalDevolver() {
    document.getElementById('devolverModal').style.display = 'none';
    sistemaAluguel.estado.aluguelParaDevolver = null;
}

async function confirmarDevolucao() {
    if (!dbAluguel || !sistemaAluguel.estado.aluguelParaDevolver) return;
    
    const quantidade = parseInt(document.getElementById('modalQuantidadeDevolver').value);
    const aluguel = sistemaAluguel.estado.aluguelParaDevolver;
    
    if (quantidade < 1 || quantidade > aluguel.quantidade) {
        alert(`Quantidade inválida! Deve ser entre 1 e ${aluguel.quantidade}.`);
        return;
    }
    
    try {
        if (quantidade === aluguel.quantidade) {
            await dbAluguel.collection('alugueis').doc(aluguel.id).update({
                dataDevolucao: new Date()
            });
        } else {
            const novaQuantidade = aluguel.quantidade - quantidade;
            await dbAluguel.collection('alugueis').doc(aluguel.id).update({
                quantidade: novaQuantidade
            });
        }
        
        fecharModalDevolver();
        
        alert('Devolução realizada com sucesso!');
        
        carregarDadosFirebaseAluguel();
        
    } catch (error) {
        alert('Erro ao realizar devolução: ' + error.message);
    }
}

function editarAluguel(aluguelId, event) {
    event.stopPropagation();
    
    const aluguel = sistemaAluguel.cache.alugueis.find(a => a.id === aluguelId);
    if (!aluguel) return;
    
    document.getElementById('clienteNome').value = aluguel.clienteNome;
    
    if (aluguel.endereco) {
        document.getElementById('enderecoRua').value = aluguel.endereco.rua || '';
        document.getElementById('enderecoBairro').value = aluguel.endereco.bairro || '';
        document.getElementById('enderecoNumero').value = aluguel.endereco.numero || '';
        document.getElementById('enderecoComplemento').value = aluguel.endereco.complemento || '';
    }
    
    alert('Dados do cliente carregados! Agora você pode selecionar novos livros para alugar.');
    
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

function limparFormularioAluguel() {
    document.getElementById('clienteNome').value = '';
    document.getElementById('enderecoRua').value = '';
    document.getElementById('enderecoBairro').value = '';
    document.getElementById('enderecoNumero').value = '';
    document.getElementById('enderecoComplemento').value = '';
    document.getElementById('buscaLivroAlugar').value = '';
    
    sistemaAluguel.estado.livrosSelecionados = [];
    
    carregarLivrosDisponiveis();
    atualizarLivrosSelecionados();
    atualizarBotoesAluguel();
}

function limparSelecao() {
    sistemaAluguel.estado.livrosSelecionados = [];
    
    carregarLivrosDisponiveis();
    atualizarLivrosSelecionados();
    atualizarBotoesAluguel();
}

window.livrosDisponiveisFiltrados = null;
window.livrosAlugadosFiltrados = null;
