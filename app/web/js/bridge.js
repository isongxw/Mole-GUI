/*
 * Mole GUI — the single JS <-> Swift bridge.
 *
 * Outbound: post(action, payload) -> window.webkit.messageHandlers.mole.postMessage({action, ...payload})
 * Inbound:  Swift calls window.__moleNative(jsonString) with an already-serialized JSON string.
 *
 * Mock mode (js/mock.js) fakes exactly this seam; nothing here may special-case
 * mock behavior beyond reporting state.mock.
 */
(function () {
  'use strict';

  var sequence = 0;
  var listeners = Object.create(null);
  var jobs = Object.create(null);

  var state = {
    ready: false,
    mock: false,
    native: !!window.__MOLE_NATIVE__,
    app: null,
    cli: null,
    config: {},
    home: '',
    paths: {},
    lastFromMock: false
  };

  function emit(type, event) {
    var list = listeners[type];
    if (!list) return;
    list.slice().forEach(function (fn) {
      try {
        fn(event);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[MoleBridge] listener for "' + type + '" failed', error);
      }
    });
  }

  function on(type, fn) {
    if (typeof fn !== 'function') return function () {};
    (listeners[type] || (listeners[type] = [])).push(fn);
    return function () {
      off(type, fn);
    };
  }

  function off(type, fn) {
    var list = listeners[type];
    if (!list) return;
    var idx = list.indexOf(fn);
    if (idx >= 0) list.splice(idx, 1);
  }

  function hasNativeHandler() {
    try {
      return !!(
        window.webkit &&
        window.webkit.messageHandlers &&
        window.webkit.messageHandlers.mole &&
        typeof window.webkit.messageHandlers.mole.postMessage === 'function'
      );
    } catch (error) {
      return false;
    }
  }

  function post(action, payload) {
    var message = { action: action };
    if (payload && typeof payload === 'object') {
      Object.keys(payload).forEach(function (key) {
        if (key === 'action') return;
        message[key] = payload[key];
      });
    }
    return new Promise(function (resolve, reject) {
      if (!hasNativeHandler()) {
        reject(new Error('native bridge unavailable'));
        return;
      }
      try {
        window.webkit.messageHandlers.mole.postMessage(message);
        resolve(message);
      } catch (error) {
        reject(error);
      }
    });
  }

  function activeJobs() {
    return Object.keys(jobs).map(function (id) {
      return jobs[id];
    });
  }

  function refreshJobState() {
    var active = activeJobs();
    var js = window.MoleUI && window.MoleUI.jobState;
    if (!js) return;
    js.count = active.length;
    js.busy = active.length > 0;
    if (active.length) {
      var last = active[active.length - 1];
      js.jobId = last.jobId;
      js.label = last.label || '';
      js.args = last.args.slice();
    } else {
      js.jobId = '';
      js.label = '';
      js.args = [];
    }
  }

  function runJob(opts) {
    opts = opts || {};
    var args = Array.isArray(opts.args) ? opts.args.map(String) : [];
    var jobId = opts.jobId || 'job-' + Date.now().toString(36) + '-' + (++sequence).toString(36);
    var record = {
      jobId: jobId,
      args: args,
      privileged: !!opts.privileged,
      label: opts.label || '',
      onStart: opts.onStart,
      onOutput: opts.onOutput,
      onExit: opts.onExit,
      started: false,
      exited: false,
      cancelled: false,
      output: '',
      startedAt: Date.now()
    };
    jobs[jobId] = record;
    refreshJobState();

    var startedSent = false;
    function markStarted() {
      if (startedSent) return;
      startedSent = true;
      record.started = true;
      if (typeof record.onStart === 'function') {
        try {
          record.onStart({ args: args.slice(), privileged: record.privileged, jobId: jobId });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('[MoleBridge] onStart failed', error);
        }
      }
    }

    post('run', {
      jobId: jobId,
      args: args,
      privileged: record.privileged,
      label: record.label
    }).catch(function (error) {
      // No native host (plain browser without mock): fail the job cleanly so
      // screens re-enable their controls instead of spinning forever.
      finishJob(jobId, {
        jobId: jobId,
        code: 127,
        cancelled: false,
        durationMs: 0,
        error: 'spawn_failed',
        message: error && error.message ? error.message : String(error)
      });
    });

    function finishJob(id, payload) {
      var job = jobs[id];
      if (!job || job.exited) return;
      job.exited = true;
      markStarted();
      delete jobs[id];
      refreshJobState();
      if (typeof job.onExit === 'function') {
        try {
          job.onExit({
            code: payload.code == null ? 0 : payload.code,
            cancelled: !!payload.cancelled,
            durationMs: payload.durationMs == null ? Date.now() - job.startedAt : payload.durationMs,
            error: payload.error || '',
            message: payload.message || '',
            jobId: id,
            args: job.args.slice()
          });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('[MoleBridge] onExit failed', error);
        }
      }
    }

    return {
      jobId: jobId,
      cancel: function () {
        var job = jobs[jobId];
        if (!job) return;
        job.cancelled = true;
        post('cancel', { jobId: jobId }).catch(function () {
          finishJob(jobId, { jobId: jobId, code: 130, cancelled: true, durationMs: Date.now() - job.startedAt, error: '' });
        });
      },
      get active() {
        return !!jobs[jobId];
      }
    };
  }

  function dispatch(event) {
    if (!event || typeof event !== 'object') return;
    var type = event.type || event.event;
    if (!type) return;
    var job = event.jobId ? jobs[event.jobId] : null;

    switch (type) {
      case 'ready':
        state.ready = true;
        state.app = event.app || state.app;
        state.cli = event.cli || state.cli;
        state.config = event.config || state.config || {};
        state.home = event.home || state.home;
        state.paths = event.paths || state.paths || {};
        break;
      case 'cli_changed':
        state.cli = event.cli || state.cli;
        break;
      case 'config_changed':
        state.config = event.config || state.config || {};
        break;
      case 'job_started':
        if (job && !job.started) {
          job.started = true;
          if (typeof job.onStart === 'function') {
            try {
              job.onStart({ args: job.args.slice(), privileged: job.privileged, jobId: job.jobId });
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error('[MoleBridge] onStart failed', error);
            }
          }
        }
        refreshJobState();
        break;
      case 'job_output':
        if (job) {
          var text = event.text == null ? '' : String(event.text);
          job.output = (job.output + text).slice(-400 * 1024);
          if (typeof job.onOutput === 'function') {
            try {
              job.onOutput(text, event.stream === 'stderr' ? 'stderr' : 'stdout');
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error('[MoleBridge] onOutput failed', error);
            }
          }
        }
        break;
      case 'job_exit':
        if (event.jobId && jobs[event.jobId]) {
          var exitJob = jobs[event.jobId];
          exitJob.exited = true;
          if (!exitJob.started) {
            exitJob.started = true;
            if (typeof exitJob.onStart === 'function') {
              try {
                exitJob.onStart({ args: exitJob.args.slice(), privileged: exitJob.privileged, jobId: exitJob.jobId });
              } catch (error) {
                // eslint-disable-next-line no-console
                console.error('[MoleBridge] onStart failed', error);
              }
            }
          }
          delete jobs[event.jobId];
          refreshJobState();
          if (typeof exitJob.onExit === 'function') {
            try {
              exitJob.onExit({
                code: event.code == null ? 0 : event.code,
                cancelled: !!event.cancelled,
                durationMs: event.durationMs == null ? Date.now() - exitJob.startedAt : event.durationMs,
                error: event.error || '',
                message: event.message || '',
                jobId: event.jobId,
                args: exitJob.args.slice()
              });
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error('[MoleBridge] onExit failed', error);
            }
          }
        }
        break;
      default:
        break;
    }
    emit(type, event);
  }

  function installNativeReceiver() {
    window.__moleNative = function (jsonString) {
      var event = jsonString;
      if (typeof jsonString === 'string') {
        try {
          event = JSON.parse(jsonString);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('[MoleBridge] __moleNative received invalid JSON', error);
          return;
        }
      }
      dispatch(event);
    };
  }

  installNativeReceiver();

  window.MoleBridge = {
    post: post,
    runJob: runJob,
    on: on,
    off: off,
    dispatch: dispatch,
    state: state,
    isMock: false,
    hasNativeHandler: hasNativeHandler,
    activeJobs: activeJobs,
    refreshJobState: refreshJobState,
    cancelAll: function () {
      activeJobs().forEach(function (job) {
        post('cancel', { jobId: job.jobId }).catch(function () {});
      });
    },
    // Convenience wrappers. Each returns the underlying post() promise.
    init: function () {
      return post('init', {});
    },
    chooseCLI: function () {
      return post('chooseCLI', {});
    },
    getConfig: function () {
      return post('getConfig', {});
    },
    setConfig: function (patch) {
      return post('setConfig', { patch: patch || {} });
    },
    reveal: function (path) {
      return post('reveal', { path: path });
    },
    openExternal: function (url) {
      return post('openExternal', { url: url });
    },
    openTerminal: function (args) {
      return post('openTerminal', { args: Array.isArray(args) ? args.map(String) : [] });
    },
    clipboard: function (text) {
      return post('clipboard', { text: String(text == null ? '' : text) });
    },
    exportJSON: function (suggestedName, content) {
      return post('exportJSON', { suggestedName: suggestedName, content: content });
    },
    uninstallSelf: function () {
      return post('uninstallSelf', {});
    },
    quit: function () {
      return post('quit', {});
    }
  };
})();
