(function () {
  const SOLVER_URL = chrome.runtime.getURL('solver.js');
  let solverInjected = false;
  let pendingResult = null;

  const isIframe = window !== window.top;
  const hasGameIframe = !isIframe && !!document.getElementById('game-iframe');

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
      if (isIframe) {
        window.top.postMessage({ type: '__ngs_solver_result', payload: e.data.payload }, '*');
      }
    }
    if (e.data && e.data.type === '__ngs_solver_ready') {
      solverInjected = true;
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (hasGameIframe) {
      const iframe = document.getElementById('game-iframe');
      if (msg.action === 'solve') {
        pendingResult = null;
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({ type: '__ngs_auto_solve' }, '*');
        }
        sendResponse({ ok: true });
        return true;
      }
      if (msg.action === 'status') {
        sendResponse({ ready: true, hasResult: !!pendingResult });
        return true;
      }
      if (msg.action === 'getResult') {
        sendResponse(pendingResult);
        return true;
      }
      return true;
    }

    if (msg.action === 'solve') {
      pendingResult = null;
      window.postMessage({ type: '__ngs_auto_solve' }, '*');
      sendResponse({ ok: true });
      return true;
    }
    if (msg.action === 'status') {
      const gameName = window.location.href.includes('mouse-laddoo') ? 'Mouse Laddoo' :
                       window.location.href.includes('duck-ball') ? 'Duck Duck Go' :
                       window.location.href.includes('turtle-tracer') ? 'Turtle Tracer' :
                       window.location.href.includes('boat-to-the-shore') ? 'Boat to the Shore' :
                       window.location.href.includes('friend-in-need') ? 'A Friend In Need' :
                       window.location.href.includes('hungry-duck') ? 'Hungry Duck' : null;
      sendResponse({ ready: solverInjected, hasResult: !!pendingResult, gameName });
      return true;
    }
    if (msg.action === 'getResult') {
      sendResponse(pendingResult);
      return true;
    }
  });
})();
