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

document.addEventListener('DOMContentLoaded', function() {
    const formCadastro = document.getElementById('formCadastro');
    if (formCadastro) {
        formCadastro.addEventListener('submit', cadastrarLivro);
    }
    
    if (document.getElementById('livrosList')) {
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

async function cadastrarLivro(e) {
    e.preventDefault();
    
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
    
    if (Object.values(livroData).some(valor => valor === '' || (typeof valor === 'string' && !valor.trim()) || (typeof valor === 'number' && isNaN(valor)))) {
        alert("Por favor, preencha todos os campos corretamente!");
        return;
    }
    
    try {
        await db.collection('livros').add(livroData);
        document.getElementById('formCadastro').reset();
        
        const successMessage = document.getElementById('successMessage');
        const errorMessage = document.getElementById('errorMessage');
        successMessage.style.display = 'block';
        errorMessage.style.display = 'none';
        setTimeout(() => {
            successMessage.style.display = 'none';
        }, 3000);
        
    } catch (error) {
        console.error('Erro ao cadastrar livro:', error);
        const successMessage = document.getElementById('successMessage');
        const errorMessage = document.getElementById('errorMessage');
        successMessage.style.display = 'none';
        errorMessage.style.display = 'block';
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 3000);
    }
}

async function carregarLivros() {
    const livrosList = document.getElementById('livrosList');
    if (!livrosList) return;
    
    livrosList.innerHTML = '<div class="loading">Carregando livros...</div>';
    
    try {
        const snapshot = await db.collection('livros').orderBy('dataCadastro', 'desc').get();
        livros = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        const alugueisSnapshot = await db.collection('alugueis')
            .where('dataDevolucao', '==', null)
            .get();
        alugueis = alugueisSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        if (!document.getElementById('searchInput')) {
            const searchContainer = document.createElement('div');
            searchContainer.className = 'search-container';
            searchContainer.innerHTML = `
                <div class="form-group">
                    <label for="searchInput">Buscar Livro</label>
                    <input type="text" id="searchInput" placeholder="Digite o nome do livro ou autor...">
                </div>
            `;
            livrosList.parentNode.insertBefore(searchContainer, livrosList);
            
            document.getElementById('searchInput').addEventListener('input', filtrarLivros);
        }
        
        exibirLivros(livros);
        
    } catch (error) {
        console.error('Erro ao carregar livros:', error);
        livrosList.innerHTML = '<div class="empty-state">Erro ao carregar livros. Tente novamente.</div>';
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
        exibirLivros(livros);
        return;
    }
    
    const livrosFiltrados = livros.filter(livro => 
        livro.livro.toLowerCase().includes(searchTerm) || 
        livro.autor.toLowerCase().includes(searchTerm)
    );
    
    exibirLivros(livrosFiltrados);
}

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
            prazoDevolucao: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 dias
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