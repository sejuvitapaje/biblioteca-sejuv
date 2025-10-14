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
} catch (error) {
    console.error("Erro ao inicializar Firebase:", error);
}

const db = firebase.firestore();

let livros = [];
let alugueis = [];
let livroEditando = null;

// Variáveis de paginação
let currentPage = 1;
const booksPerPage = 20; // Reduzido para melhor performance
let totalLivros = 0;
let lastVisible = null;
let firstVisible = null;

document.addEventListener('DOMContentLoaded', function() {
    const formCadastro = document.getElementById('formCadastro');
    if (formCadastro) {
        formCadastro.addEventListener('submit', cadastrarLivro);
    }
    
    if (document.getElementById('livrosList')) {
        inicializarPaginacao();
        carregarLivros();
    }
    
    if (document.getElementById('livroAlugar')) {
        carregarLivrosDisponiveis();
    }
    
    if (document.getElementById('livroDevolver')) {
        carregarLivrosAlugados();
    }
    
    if (document.getElementById('clientesList')) {
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
        searchInput.addEventListener('input', filtrarLivros);
    }
}

async function carregarLivros() {
    const livrosList = document.getElementById('livrosList');
    if (!livrosList) return;
    
    livrosList.innerHTML = '<div class="loading">Carregando livros...</div>';
    
    try {
        // Busca o total de livros
        const countSnapshot = await db.collection('livros').get();
        totalLivros = countSnapshot.size;
        
        document.getElementById('totalLivros').textContent = `${totalLivros} livros cadastrados`;
        
        // Carrega primeira página
        const snapshot = await db.collection('livros')
            .orderBy('dataCadastro', 'desc')
            .limit(booksPerPage)
            .get();
            
        livros = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        lastVisible = snapshot.docs[snapshot.docs.length - 1];
        firstVisible = snapshot.docs[0];
        
        const alugueisSnapshot = await db.collection('alugueis')
            .where('dataDevolucao', '==', null)
            .get();
        alugueis = alugueisSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        exibirLivros(livros);
        atualizarControlesPaginacao();
        
    } catch (error) {
        console.error('Erro ao carregar livros:', error);
        livrosList.innerHTML = '<div class="empty-state">Erro ao carregar livros. Tente novamente.</div>';
    }
}

async function mudarPagina(direction) {
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
        console.error('Erro ao mudar página:', error);
        livrosList.innerHTML = '<div class="empty-state">Erro ao carregar página.</div>';
    }
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

function filtrarLivros() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    if (!searchTerm) {
        // Se busca vazia, volta para paginação normal
        carregarLivros();
        return;
    }
    
    const livrosFiltrados = livros.filter(livro => 
        livro.livro.toLowerCase().includes(searchTerm) || 
        livro.autor.toLowerCase().includes(searchTerm)
    );
    
    exibirLivros(livrosFiltrados);
    
    // Atualiza controles para modo busca
    document.getElementById('pageInfo').textContent = 'Modo Busca';
    document.getElementById('pageInfoBottom').textContent = 'Modo Busca';
    document.getElementById('resultsInfo').textContent = `${livrosFiltrados.length} livros encontrados`;
    
    // Desabilita paginação durante busca
    document.getElementById('prevPage').disabled = true;
    document.getElementById('nextPage').disabled = true;
    document.getElementById('prevPageBottom').disabled = true;
    document.getElementById('nextPageBottom').disabled = true;
}

// ... (o resto das funções permanece igual - cadastrarLivro, carregarLivrosDisponiveis, etc.)

async function carregarLivrosDisponiveis() {
    const select = document.getElementById('livroAlugar');
    if (!select) return;
    
    select.innerHTML = '<option value="">Selecione um livro</option>';
    
    try {
        const livrosSnapshot = await db.collection('livros').get();
        const alugueisSnapshot = await db.collection('alugueis')
            .where('dataDevolucao', '==', null)
            .get();
        
        const alugueisAtivos = alugueisSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        livrosSnapshot.docs.forEach(doc => {
            const livro = { id: doc.id, ...doc.data() };
            const alugueisDoLivro = alugueisAtivos.filter(a => a.livroId === livro.id);
            const quantidadeAlugada = alugueisDoLivro.reduce((total, aluguel) => total + aluguel.quantidade, 0);
            const quantidadeDisponivel = livro.quantidade - quantidadeAlugada;
            
            if (quantidadeDisponivel > 0) {
                const option = document.createElement('option');
                option.value = livro.id;
                option.textContent = `${livro.livro} - ${livro.autor} (Disponível: ${quantidadeDisponivel})`;
                option.setAttribute('data-quantidade', quantidadeDisponivel);
                select.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Erro ao carregar livros disponíveis:', error);
    }
}

async function carregarLivrosAlugados() {
    const select = document.getElementById('livroDevolver');
    if (!select) return;
    
    select.innerHTML = '<option value="">Selecione um livro alugado</option>';
    
    try {
        const alugueisSnapshot = await db.collection('alugueis')
            .where('dataDevolucao', '==', null)
            .get();
        
        for (const doc of alugueisSnapshot.docs) {
            const aluguel = { id: doc.id, ...doc.data() };
            const livroDoc = await db.collection('livros').doc(aluguel.livroId).get();
            
            if (livroDoc.exists) {
                const livro = livroDoc.data();
                const option = document.createElement('option');
                option.value = aluguel.id;
                option.textContent = `${livro.livro} - ${livro.autor} (Cliente: ${aluguel.clienteNome}, Quantidade: ${aluguel.quantidade})`;
                option.setAttribute('data-quantidade', aluguel.quantidade);
                select.appendChild(option);
            }
        }
    } catch (error) {
        console.error('Erro ao carregar livros alugados:', error);
    }
}

async function alugarLivro() {
    const livroId = document.getElementById('livroAlugar').value;
    const clienteNome = document.getElementById('clienteNome').value.trim();
    const quantidade = parseInt(document.getElementById('quantidadeAlugar').value);
    
    if (!livroId || !clienteNome || !quantidade) {
        alert("Por favor, preencha todos os campos!");
        return;
    }
    
    const selectedOption = document.getElementById('livroAlugar').selectedOptions[0];
    const quantidadeDisponivel = parseInt(selectedOption.getAttribute('data-quantidade'));
    
    if (quantidade > quantidadeDisponivel) {
        alert(`Quantidade indisponível! Apenas ${quantidadeDisponivel} livros disponíveis.`);
        return;
    }
    
    try {
        const aluguelData = {
            livroId: livroId,
            clienteNome: clienteNome,
            quantidade: quantidade,
            dataAluguel: new Date(),
            dataDevolucao: null,
            prazoDevolucao: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        };
        
        await db.collection('alugueis').add(aluguelData);
        
        document.getElementById('clienteNome').value = '';
        document.getElementById('livroAlugar').value = '';
        document.getElementById('quantidadeAlugar').value = '1';
        
        alert('Livro alugado com sucesso!');
        carregarLivrosDisponiveis();
        atualizarNotificacoes();
        
    } catch (error) {
        console.error('Erro ao alugar livro:', error);
        alert('Erro ao alugar livro. Tente novamente.');
    }
}

async function devolverLivro() {
    const aluguelId = document.getElementById('livroDevolver').value;
    const quantidade = parseInt(document.getElementById('quantidadeDevolver').value);
    
    if (!aluguelId || !quantidade) {
        alert("Por favor, preencha todos os campos!");
        return;
    }
    
    const selectedOption = document.getElementById('livroDevolver').selectedOptions[0];
    const quantidadeAlugada = parseInt(selectedOption.getAttribute('data-quantidade'));
    
    if (quantidade > quantidadeAlugada) {
        alert(`Quantidade inválida! Apenas ${quantidadeAlugada} livros foram alugados.`);
        return;
    }
    
    try {
        if (quantidade === quantidadeAlugada) {
            await db.collection('alugueis').doc(aluguelId).update({
                dataDevolucao: new Date()
            });
        } else {
            const aluguelDoc = await db.collection('alugueis').doc(aluguelId).get();
            const aluguel = aluguelDoc.data();
            
            await db.collection('alugueis').doc(aluguelId).update({
                quantidade: aluguel.quantidade - quantidade
            });
        }
        
        document.getElementById('livroDevolver').value = '';
        document.getElementById('quantidadeDevolver').value = '1';
        alert('Livro devolvido com sucesso!');
        carregarLivrosAlugados();
        atualizarNotificacoes();
        
    } catch (error) {
        console.error('Erro ao devolver livro:', error);
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
        
    } catch (error) {
        console.error('Erro ao carregar clientes:', error);
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
        } else {
            badge.style.display = 'none';
        }
        
    } catch (error) {
        console.error('Erro ao atualizar notificações:', error);
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
        console.error('Erro ao formatar data:', error);
        return 'Data inválida';
    }
}

function editarLivro(livroId) {
    livroEditando = livros.find(l => l.id === livroId);
    
    if (livroEditando) {
        document.getElementById('editLivro').value = livroEditando.livro || '';
        document.getElementById('editAutor').value = livroEditando.autor || '';
        document.getElementById('editCategoria').value = livroEditando.categoria || '';
        document.getElementById('editQuantidade').value = livroEditando.quantidade || '';
        document.getElementById('editPrateleira').value = livroEditando.prateleira || '';
        document.getElementById('editBandeja').value = livroEditando.bandeja || '';
        
        document.getElementById('editModal').style.display = 'block';
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
        
        await carregarLivros();
        fecharModal();
        alert('Livro atualizado com sucesso!');
    } catch (error) {
        console.error('Erro ao atualizar livro:', error);
        alert('Erro ao atualizar livro. Tente novamente.');
    }
}

async function excluirLivro(livroId) {
    if (confirm('Tem certeza que deseja excluir este livro?')) {
        try {
            await db.collection('livros').doc(livroId).delete();
            await carregarLivros();
            alert('Livro excluído com sucesso!');
        } catch (error) {
            console.error('Erro ao excluir livro:', error);
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
}
