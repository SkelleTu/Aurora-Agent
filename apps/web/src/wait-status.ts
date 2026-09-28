const HUMAN_MESSAGES = [
  'Conectando ao sistema…',
  'Aguardando uma resposta…',
  'Só mais um instante…',
];

const originalFetch = window.fetch.bind(window);

function setStatus(message: string) {
  const status = document.querySelector<HTMLElement>('#status');
  if (status) status.textContent = message;
}

function setConnection(message: string) {
  const connection = document.querySelector<HTMLElement>('#topConnection');
  if (connection) connection.textContent = message;
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const isAuroraAction = method === 'POST' && new URL(url, window.location.origin).pathname === '/api/action';
  if (!isAuroraAction) return originalFetch(input, init);

  let timer1 = 0;
  let timer2 = 0;
  const startedAt = performance.now();
  setConnection('Conectando…');
  setStatus(HUMAN_MESSAGES[0]);

  timer1 = window.setTimeout(() => {
    setConnection('Aguardando…');
    setStatus(HUMAN_MESSAGES[1]);
  }, 800);
  timer2 = window.setTimeout(() => {
    setStatus(HUMAN_MESSAGES[2]);
  }, 4000);

  try {
    const response = await originalFetch(input, init);
    const waitedMs = Math.round(performance.now() - startedAt);
    if (response.ok) {
      if (waitedMs >= 800) setStatus('Pronto. Resposta recebida.');
      setConnection('Sistema online');
    } else {
      setConnection('Sistema disponível');
      if (waitedMs >= 800) setStatus('Não foi possível concluir agora. Tente novamente em instantes.');
    }
    return response;
  } catch (error) {
    setConnection('Conexão indisponível');
    setStatus('Não foi possível concluir agora. Tente novamente em instantes.');
    throw error;
  } finally {
    window.clearTimeout(timer1);
    window.clearTimeout(timer2);
  }
};
