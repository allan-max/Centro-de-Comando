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

io.on('connection', (socket) => {
    // --- AUTENTICAÇÃO ---
    socket.on('login_solicitado', (dados) => {
        io.emit('agente_validar_login', { browserId: socket.id, usuario: dados.usuario, senha: dados.senha });
    });

    socket.on('validar_token_solicitado', (dados) => {
        io.emit('agente_validar_token', { browserId: socket.id, token: dados.token });
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

    // O Cliente Web mandou um comando (ex: "dir", "ping", "cd")
    socket.on('comando_shell', (dados) => {
        if (socket.rooms.has('logados')) {
            io.emit('agente_comando_shell', { comando: dados.comando });
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
}); // Fim do io.on('connection')

const PORTA = process.env.PORT || 3000;
server.listen(PORTA, () => console.log(`🚀 Nuvem online na porta ${PORTA}`));