const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json()); 

const CHAVE_SECRETA = "cadaallan"; 

const historico = {
    'novo_log_node': [], 'novo_log_python': [], 'novo_console-log': [], 'novo_log_deploy': [] 
};

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

// Quando o agente manda as linhas de log...
app.post('/receber-log', (req, res) => {
    const { chave, terminal, linha } = req.body;
    if (chave !== CHAVE_SECRETA) return res.status(403).json({ erro: "Acesso Negado" });

    if (historico[terminal]) {
        historico[terminal].push(linha);
        if (historico[terminal].length > 50) historico[terminal].shift(); 
    }

    // A MÁGICA DE SEGURANÇA: Só manda o log para quem está na sala 'logados'
    io.to('logados').emit(terminal, linha);
    res.status(200).json({ status: "ok" });
});

io.on('connection', (socket) => {
    let ipCliente = socket.handshake.address.replace('::ffff:', '');
    console.log(`💻 Conexão estabelecida: ${ipCliente}`);

    // 1. Navegador pediu para logar (com usuário e senha)
    socket.on('login_solicitado', (dados) => {
        console.log("🔒 Pedido de login recebido. Consultando Agente Local...");
        // O servidor grita para todos os Agentes conectados validarem as credenciais
        io.emit('agente_validar_login', { browserId: socket.id, usuario: dados.usuario, senha: dados.senha });
    });

    // 2. Navegador pediu para logar via "Lembrar de Mim" (com token salvo)
    socket.on('validar_token_solicitado', (dados) => {
        io.emit('agente_validar_token', { browserId: socket.id, token: dados.token });
    });

    // 3. O Agente Local respondeu se a SENHA está correta
    socket.on('agente_resposta_login', (dados) => {
        // Bloqueia hackers tentando fingir que são o Agente
        if (dados.chave !== CHAVE_SECRETA) return; 

        const clientSocket = io.sockets.sockets.get(dados.browserId);
        if (clientSocket) {
            if (dados.sucesso) {
                clientSocket.join('logados'); // Coloca na sala VIP
                clientSocket.emit('login_sucesso', { token: dados.token });
                
                // Despeja o histórico na tela de quem acabou de entrar
                ['novo_log_node', 'novo_log_python', 'novo_console-log', 'novo_log_deploy'].forEach(term => {
                    historico[term].forEach(linha => clientSocket.emit(term, linha));
                });
            } else {
                clientSocket.emit('login_erro', { mensagem: 'Usuário ou senha inválidos' });
            }
        }
    });

    // 4. O Agente Local respondeu se o TOKEN é válido
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
                clientSocket.emit('login_erro', { mensagem: 'Sessão expirada. Faça login novamente.' });
            }
        }
    });

    // REINICIAR: Só aceita se quem clicou também mandar a senha de segurança
    socket.on('solicitar_reiniciar', (dados) => {
        if (dados.chave === CHAVE_SECRETA) {
            console.log("⚠️ Comando REMOTO acionado! Avisando o Windows Server...");
            io.emit('comando_reiniciar'); 
        }
    });
});

const PORTA = process.env.PORT || 3000;
server.listen(PORTA, () => console.log(`🚀 Nuvem online na porta ${PORTA}`));