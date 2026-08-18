// Configuração de conexão com o backend (Google Apps Script)

// >>> COLE AQUI A URL DO SEU APPS SCRIPT (termina em /exec) <<<
export const API_URL = 'https://script.google.com/macros/s/AKfycbzHgv-Qm0eN5Cw66O4DwTMcyFz7gnseDWkUVup50-A5cBKS4th_VxvRzkpKtwyRssPFcA/exec';

// >>> TROQUE por exatamente o mesmo valor de BOOTSTRAP_TOKEN no Code.gs <<<
// Esse token só é usado para poder TENTAR fazer login. Depois de logar, o app
// passa a usar um token de sessão temporário gerado pelo servidor.
export const BOOTSTRAP_TOKEN = 'ricardinho-guilerme-bagui-complica';

export const AUTO_REFRESH_MS = 15000; // intervalo de sincronização entre os dispositivos
