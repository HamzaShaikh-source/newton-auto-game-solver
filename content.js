(function () {
  const SOLVER_URL = chrome.runtime.getURL('solver.js');
  let solverInjected = false;
  let pendingResult = null;

  function injectSolver() {
    if (solverInjected) return;
    const script = document.createElement('script');
    script.src = SOLVER_URL;
    script.onload = () => {
      solverInjected = true;
      script.remove();
    };
    script.onerror = () => setTimeout(injectSolver, 500);
    (document.head || document.documentElement).appendChild(script);
  }

  injectSolver();

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === '__ngs_solver_result') {
      pendingResult = e.data.payload;
    }
    if (e.data && e.data.type === '__ngs_solver_ready') {
      solverInjected = true;
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'solve') {
      pendingResult = null;
      window.postMessage({ type: '__ngs_auto_solve' }, '*');
      sendResponse({ ok: true });
      return true;
    }
    if (msg.action === 'status') {
      sendResponse({ ready: solverInjected, hasResult: !!pendingResult });
      return true;
    }
    if (msg.action === 'getResult') {
      sendResponse(pendingResult);
      return true;
    }
  });
})();
