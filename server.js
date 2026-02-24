const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json()); 

const CHAVE_SECRETA = "cadaallan"; 

// Adicionado o 'novo_log_deploy'
const historico = {
    'novo_log_node': [],
    'novo_log_python': [],
    'novo_console-log': [],
    'novo_log_deploy': [] 
};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/receber-log', (req, res) => {
    const { chave, terminal, linha } = req.body;
    if (chave !== CHAVE_SECRETA) return res.status(403).json({ erro: "Acesso Negado" });

    if (historico[terminal]) {
        historico[terminal].push(linha);
        if (historico[terminal].length > 50) historico[terminal].shift(); 
    }

    io.emit(terminal, linha);
    res.status(200).json({ status: "ok" });
});

io.on('connection', (socket) => {
    let ipCliente = socket.handshake.address.replace('::ffff:', '');
    console.log(`💻 Acesso ao painel: ${ipCliente}`);

    historico['novo_log_node'].forEach(linha => socket.emit('novo_log_node', linha));
    historico['novo_log_python'].forEach(linha => socket.emit('novo_log_python', linha));
    historico['novo_console-log'].forEach(linha => socket.emit('novo_console-log', linha));
    historico['novo_log_deploy'].forEach(linha => socket.emit('novo_log_deploy', linha));

    // ESCUTA O BOTÃO DE REINICIAR DO NAVEGADOR
    socket.on('solicitar_reiniciar', (dados) => {
        if (dados.chave === CHAVE_SECRETA) {
            console.log("⚠️ Comando REMOTO acionado! Avisando o Windows Server...");
            // Emite um "grito" que só o seu agente.js local vai escutar
            io.emit('comando_reiniciar'); 
        }
    });
});

const PORTA = process.env.PORT || 3000;

server.listen(PORTA, () => console.log(`🚀 Nuvem online na porta ${PORTA}`));
