const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json()); 

// ⚠️ MANTENHA A SUA SENHA AQUI!
const CHAVE_SECRETA = "cadaallan"; 

const historico = {
    'novo_log_node': [], 'novo_log_python': [], 'novo_console-log': [], 'novo_log_deploy': [] 
};

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

app.post('/receber-log', (req, res) => {
    const { chave, terminal, linha } = req.body;
    if (chave !== CHAVE_SECRETA) return res.status(403).json({ erro: "Acesso Negado" });

    if (historico[terminal]) {
        historico[terminal].push(linha);
        if (historico[terminal].length > 50) historico[terminal].shift(); 
    }
    io.to('logados').emit(terminal, linha);
    res.status(200).json({ status: "ok" });
});
socket.on('pedir_lista_sessoes', () => {
    io.emit('agente_pedir_lista'); // Pede para o Agente Local a lista oficial
});

socket.on('agente_envia_lista', (dados) => {
    if (dados.chave === CHAVE_SECRETA) {
        io.to('logados').emit('lista_sessoes', dados.lista);
    }
});

socket.on('solicitar_expulsao', (dados) => {
    if (socket.rooms.has('logados')) {
        io.emit('agente_expulsar_id', { socketId: dados.targetSocketId });
    }
});

socket.on('agente_confirma_expulsao', (dados) => {
    if (dados.chave === CHAVE_SECRETA) {
        const target = io.sockets.sockets.get(dados.socketId);
        if (target) {
            target.emit('voce_foi_expulso');
            target.leave('logados');
            target.disconnect();
        }
    }
});

io.on('connection', (socket) => {
    // ==========================================
    // NOVA FUNÇÃO: PEGAR O IP REAL DO CELULAR/PC
    // ==========================================
    function pegarIP(socket) {
        let ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
        // Pega apenas o primeiro IP e remove formatações estranhas (::ffff:)
        return ip.split(',')[0].trim().replace('::ffff:', '');
    }

    // 1. Navegador pediu para logar (com usuário e senha)
    socket.on('login_solicitado', (dados) => {
        const ipReal = pegarIP(socket);
        console.log(`🔒 Pedido de login do IP: ${ipReal}`);
        // Agora ele manda o IP junto para o Windows Server anotar!
        io.emit('agente_validar_login', { browserId: socket.id, usuario: dados.usuario, senha: dados.senha, ip: ipReal });
    });

    // 2. Navegador pediu para logar via "Lembrar de Mim"
    socket.on('validar_token_solicitado', (dados) => {
        const ipReal = pegarIP(socket);
        io.emit('agente_validar_token', { browserId: socket.id, token: dados.token, ip: ipReal });
    });

    socket.on('agente_resposta_login', (dados) => {
        if (dados.chave !== CHAVE_SECRETA) return; 
        const clientSocket = io.sockets.sockets.get(dados.browserId);
        if (clientSocket) {
            if (dados.sucesso) {
                clientSocket.join('logados'); 
                clientSocket.emit('login_sucesso', { token: dados.token });
                ['novo_log_node', 'novo_log_python', 'novo_console-log', 'novo_log_deploy'].forEach(term => {
                    historico[term].forEach(linha => clientSocket.emit(term, linha));
                });
            } else {
                clientSocket.emit('login_erro');
            }
        }
    });

    socket.on('agente_resposta_token', (dados) => {
        if (dados.chave !== CHAVE_SECRETA) return; 
        const clientSocket = io.sockets.sockets.get(dados.browserId);
        if (clientSocket) {
            if (dados.sucesso) {
                clientSocket.join('logados');
                clientSocket.emit('login_sucesso', { token: dados.token });
                ['novo_log_node', 'novo_log_python', 'novo_console-log', 'novo_log_deploy'].forEach(term => {
                    historico[term].forEach(linha => clientSocket.emit(term, linha));
                });
            } else {
                clientSocket.emit('login_erro');
            }
        }
    });

    socket.on('solicitar_reiniciar', (dados) => {
        if (dados.chave === CHAVE_SECRETA) {
            io.emit('comando_reiniciar'); 
        }
    });

    // =================================================================
    // ROTAS DO TERMINAL REMOTO (Novo)
    // =================================================================
    
    // O Cliente Web pediu para abrir um CMD
    socket.on('iniciar_shell', (dados) => {
        // Segurança: Só aceita se estiver logado
        if (socket.rooms.has('logados')) {
            io.emit('agente_iniciar_shell', { browserId: socket.id, tipo: dados.tipo });
        }
    });

    // Recebe o comando de texto do site e aperta "ENTER" no CMD do Windows
    socket.on('agente_comando_shell', (dados) => {
        console.log(`[TERMINAL REMOTO] Executando comando: ${dados.comando}`);
        if (processoShell) {
        // O segredo do Windows: ele exige \r\n para o ENTER!
            processoShell.stdin.write(dados.comando + '\r\n');
        }
    });

    // O Cliente Web pediu para fechar o CMD
    socket.on('parar_shell', () => {
        if (socket.rooms.has('logados')) {
            io.emit('agente_parar_shell');
        }
    });

    // O Agente Local devolveu o texto do CMD, manda de volta para o cliente
    socket.on('agente_shell_output', (dados) => {
        if (dados.chave === CHAVE_SECRETA) {
            // Jeito 100% infalível de enviar para a tela exata de quem pediu:
            io.to(dados.browserId).emit('shell_output', dados.texto);
        }
    });

    // O Agente Local avisou que a tela preta fechou
    socket.on('agente_shell_fechado', (dados) => {
        if (dados.chave === CHAVE_SECRETA) {
            io.to(dados.browserId).emit('shell_fechado');
        }
    });
    socket.on('disconnect', () => {
        // Quando alguém fechar a janela, avisa o Windows Server para limpar a tabela
        io.emit('browser_desconectado', { socketId: socket.id });
    });
}); // Fim do io.on('connection')

const PORTA = process.env.PORT || 3000;
server.listen(PORTA, () => console.log(`🚀 Nuvem online na porta ${PORTA}`));