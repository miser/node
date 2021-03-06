"use strict";

const {
  Map,
  ObjectAssign,
} = primordials;

const assert = require("internal/assert");
const path = require("path");
const EventEmitter = require("events");
const { owner_symbol } = require("internal/async_hooks").symbols;
const Worker = require("internal/cluster/worker");
const { internal, sendHelper } = require("internal/cluster/utils");
const cluster = new EventEmitter();
const handles = new Map();
const indexes = new Map();
const noop = () => {};

module.exports = cluster;

cluster.isWorker = true;
cluster.isMaster = false;
cluster.worker = null;
cluster.Worker = Worker;

cluster._setupWorker = function () {
  const worker = new Worker({
    id: +process.env.NODE_UNIQUE_ID | 0,
    process: process,
    state: "online",
  });

  cluster.worker = worker;

  process.once("disconnect", () => {
    worker.emit("disconnect");

    if (!worker.exitedAfterDisconnect) {
      // Unexpected disconnect, master exited, or some such nastiness, so
      // worker exits immediately.
      process.exit(0);
    }
  });

  process.on("internalMessage", internal(worker, onmessage));
  send({ act: "online" });

  function onmessage(message, handle) {
    if (message.act === "newconn") onconnection(message, handle);
    else if (message.act === "disconnect") _disconnect.call(worker, true);
  }
};

// `obj` is a net#Server or a dgram#Socket object.
cluster._getServer = function (obj, options, cb) {
  let address = options.address;

  // Resolve unix socket paths to absolute paths
  if (
    options.port < 0 &&
    typeof address === "string" &&
    process.platform !== "win32"
  )
    address = path.resolve(address);

  const indexesKey = [
    address, // 本地的话 就是 null
    options.port, // 有
    options.addressType, // 有
    options.fd, // tcp 服务 null
  ].join(":"); // :8000:4:

  // index 表示什么？被用了几次？
  let index = indexes.get(indexesKey);

  if (index === undefined) index = 0;
  else index++;

  indexes.set(indexesKey, index);

  const message = {
    act: "queryServer",
    index,
    data: null,
    ...options,
  };

  message.address = address;

  // Set custom data on handle (i.e. tls tickets key)
  if (obj._getServerData) message.data = obj._getServerData();

  send(message, (reply, handle) => {
    if (typeof obj._setServerData === "function")
      obj._setServerData(reply.data);

    // 默认rr的话, handle应该不会传
    // indexesKey 作用?
    // cb 是 _getServer 时候传进来的
    if (handle) shared(reply, handle, indexesKey, cb);
    // Shared listen socket.
    else rr(reply, indexesKey, cb); // Round-robin.
  });

  obj.once("listening", () => {
    cluster.worker.state = "listening";
    const address = obj.address();
    message.act = "listening";
    message.port = (address && address.port) || options.port;
    send(message);
  });
};

// Shared listen socket.
function shared(message, handle, indexesKey, cb) {
  const key = message.key;
  // Monkey-patch the close() method so we can keep track of when it's
  // closed. Avoids resource leaks when the handle is short-lived.
  const close = handle.close;

  handle.close = function () {
    send({ act: "close", key });
    handles.delete(key);
    indexes.delete(indexesKey);
    return close.apply(handle, arguments);
  };
  assert(handles.has(key) === false);
  handles.set(key, handle);
  cb(message.errno, handle);
}

// Round-robin. Master distributes handles across workers.
function rr(message, indexesKey, cb) {
  if (message.errno) return cb(message.errno, null);

  let key = message.key;

  function listen(backlog) {
    // TODO(bnoordhuis) Send a message to the master that tells it to
    // update the backlog size. The actual backlog should probably be
    // the largest requested size by any worker.
    return 0;
  }

  function close() {
    // lib/net.js treats server._handle.close() as effectively synchronous.
    // That means there is a time window between the call to close() and
    // the ack by the master process in which we can still receive handles.
    // onconnection() below handles that by sending those handles back to
    // the master.
    if (key === undefined) return;

    send({ act: "close", key });
    handles.delete(key);
    indexes.delete(indexesKey);
    key = undefined;
  }

  function getsockname(out) {
<<<<<<< HEAD
    if (key) Object.assign(out, message.sockname);
=======
    if (key)
      ObjectAssign(out, message.sockname);
>>>>>>> aa1eb1fd597f68c6cb67c2a4d631a8d66f2cb94e

    return 0;
  }

  // Faux handle. Mimics a TCPWrap with just enough fidelity to get away
  // with it. Fools net.Server into thinking that it's backed by a real
  // handle. Use a noop function for ref() and unref() because the control
  // channel is going to keep the worker alive anyway.
  const handle = { close, listen, ref: noop, unref: noop };

  if (message.sockname) {
    handle.getsockname = getsockname; // TCP handles only.
  }

  assert(handles.has(key) === false);
  handles.set(key, handle);
  cb(0, handle);
}

// Round-robin connection.
function onconnection(message, handle) {
  const key = message.key; // maseter里的key
  const server = handles.get(key); // 是client创建的server？
  const accepted = server !== undefined;

  send({ ack: message.seq, accepted }); // 答复 master

  // 虽然cluster.child rr里没有为server绑定，onconnection
  // 但是在cb回到net.js里，后面的逻辑绑定了onconnection方法
  if (accepted) server.onconnection(0, handle);
}

function send(message, cb) {
  return sendHelper(process, message, null, cb);
}

function _disconnect(masterInitiated) {
  this.exitedAfterDisconnect = true;
  let waitingCount = 1;

  function checkWaitingCount() {
    waitingCount--;

    if (waitingCount === 0) {
      // If disconnect is worker initiated, wait for ack to be sure
      // exitedAfterDisconnect is properly set in the master, otherwise, if
      // it's master initiated there's no need to send the
      // exitedAfterDisconnect message
      if (masterInitiated) {
        process.disconnect();
      } else {
        send({ act: "exitedAfterDisconnect" }, () => process.disconnect());
      }
    }
  }

  handles.forEach((handle) => {
    waitingCount++;

    if (handle[owner_symbol]) handle[owner_symbol].close(checkWaitingCount);
    else handle.close(checkWaitingCount);
  });

  handles.clear();
  checkWaitingCount();
}

// Extend generic Worker with methods specific to worker processes.
<<<<<<< HEAD
Worker.prototype.disconnect = function () {
  _disconnect.call(this);
  return this;
};

Worker.prototype.destroy = function () {
  this.exitedAfterDisconnect = true;
=======
Worker.prototype.disconnect = function() {
  if (![ 'disconnecting', 'destroying' ].includes(this.state)) {
    this.state = 'disconnecting';
    _disconnect.call(this);
  }

  return this;
};

Worker.prototype.destroy = function() {
  if (this.state === 'destroying')
    return;
>>>>>>> aa1eb1fd597f68c6cb67c2a4d631a8d66f2cb94e

  this.exitedAfterDisconnect = true;
  if (!this.isConnected()) {
    process.exit(0);
  } else {
<<<<<<< HEAD
    send({ act: "exitedAfterDisconnect" }, () => process.disconnect());
    process.once("disconnect", () => process.exit(0));
=======
    this.state = 'destroying';
    send({ act: 'exitedAfterDisconnect' }, () => process.disconnect());
    process.once('disconnect', () => process.exit(0));
>>>>>>> aa1eb1fd597f68c6cb67c2a4d631a8d66f2cb94e
  }
};
