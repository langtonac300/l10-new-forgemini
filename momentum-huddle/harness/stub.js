// google.script.run stub: any server function name resolves asynchronously from
// window.__FIXTURES (value, or function(...args) → value). Unknown names reject
// loudly so a renamed server call can't pass silently. Mirrors the real API's
// withSuccessHandler/withFailureHandler chaining and its async delivery.
(function () {
  window.__GS_CALLS = []; // [{fn, args}] — the test driver asserts on these
  function makeRunner(onOk, onErr) {
    const runner = {};
    runner.withSuccessHandler = (fn) => makeRunner(fn, onErr);
    runner.withFailureHandler = (fn) => makeRunner(onOk, fn);
    return new Proxy(runner, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop !== 'string') return undefined;
        return function (...args) {
          window.__GS_CALLS.push({ fn: prop, args: args });
          setTimeout(function () {
            try {
              if (!(prop in window.__FIXTURES)) throw new Error('No fixture for server fn: ' + prop);
              const fx = window.__FIXTURES[prop];
              const v = typeof fx === 'function' ? fx.apply(null, args) : fx;
              // structuredClone: the real bridge serializes — shared references
              // between fixture calls would mask mutation bugs.
              (onOk || function () {})(v === undefined ? null : structuredClone(v));
            } catch (e) {
              (onErr || function (err) { console.error('UNHANDLED gs failure:', err); })(e);
            }
          }, 5);
        };
      },
    });
  }
  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = makeRunner(null, null);
  window.google.script.host = { close: function () {}, editor: { focus: function () {} } };
})();
