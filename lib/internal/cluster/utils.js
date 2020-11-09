"use strict";

const {
  Map,
} = primordials;

module.exports = {
  sendHelper,
  internal,
};

const callbacks = new Map();
let seq = 0;

function sendHelper(proc, message, handle, cb) {
  if (!proc.connected) return false;

  // Mark message as internal. See INTERNAL_PREFIX in lib/child_process.js
  // NODE_CLUSTER 命令
  message = { cmd: "NODE_CLUSTER", ...message, seq };

  if (typeof cb === "function") callbacks.set(seq, cb); // 缓存回调方法

  seq += 1;
  // cluster/child.js handle => null
  // cluster/master.js handle => null
  return proc.send(message, handle);
}

// Returns an internalMessage listener that hands off normal messages
// to the callback but intercepts and redirects ACK messages.
function internal(worker, cb) {
  return function onInternalMessage(message, handle) {
    if (message.cmd !== "NODE_CLUSTER") return;

    let fn = cb;

    if (message.ack !== undefined) {
      const callback = callbacks.get(message.ack);

      if (callback !== undefined) {
        fn = callback;
        callbacks.delete(message.ack);
      }
    }

    // 如果是
    fn.apply(worker, arguments);
  };
}
