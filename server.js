const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Permite receber pacotes de dados no formato JSON
app.use(express.json()); 

// A SUA PALAVRA-PASSE DE SEGURANÇA (O Windows Server terá de usar a mesma)
const CHAVE_SECRETA = "Ventura_Logs_Secreto_2026"; 

// Memória RAM: Guarda as últimas 50 linhas para quando abrir o site
const historico = {
    'novo_log_node': [],
    'novo_log_python': [],
    'novo_console-log': []
};

// 1. Entrega a página HTML (o visual) a quem aceder ao site
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Recebe os pacotes do seu Windows Server (O "Carteiro" local)
app.post('/receber-log', (req, res) => {
    const { chave, terminal, linha } = req.body;

    // Se a palavra-passe não coincidir, bloqueia o acesso imediatamente
    if (chave !== CHAVE_SECRETA) {
        return res.status(403).json({ erro: "Acesso Negado" });
    }

    // Guarda a linha no histórico
    if (historico[terminal]) {
        historico[terminal].push(linha);
        if (historico[terminal].length > 50) {
            historico[terminal].shift(); // Remove a linha mais antiga se passar de 50
        }
    }

    // Envia a linha em tempo real para o seu telemóvel/computador
    io.emit(terminal, linha);
    res.status(200).json({ status: "ok" });
});

// 3. Quando abrir o site no telemóvel, envia o histórico guardado
io.on('connection', (socket) => {
    // Regista o IP de quem acede ao painel
    let ipCliente = socket.handshake.address.replace('::ffff:', '');
    console.log(`💻 Novo acesso ao painel. IP: ${ipCliente}`);

    // Descarrega o histórico para o ecrã
    historico['novo_log_node'].forEach(linha => socket.emit('novo_log_node', linha));
    historico['novo_log_python'].forEach(linha => socket.emit('novo_log_python', linha));
    historico['novo_console-log'].forEach(linha => socket.emit('novo_console-log', linha));
});

// A porta será definida automaticamente pelo servidor na nuvem (Render)
const PORTA = process.env.PORT || 3000;
server.listen(PORTA, () => console.log(`🚀 Servidor da Nuvem online na porta ${PORTA}`));