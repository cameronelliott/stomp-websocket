// Generated by CoffeeScript 1.3.3
(function() {
  var Byte, Client, Frame, Stomp,
    __hasProp = {}.hasOwnProperty;

  Byte = {
    LF: '\x0A',
    NULL: '\x00'
  };

  Frame = (function() {

    function Frame(command, headers, body) {
      this.command = command;
      this.headers = headers != null ? headers : {};
      this.body = body != null ? body : '';
    }

    Frame.prototype.toString = function() {
      var lines, name, value, _ref;
      lines = [this.command];
      _ref = this.headers;
      for (name in _ref) {
        if (!__hasProp.call(_ref, name)) continue;
        value = _ref[name];
        lines.push("" + name + ":" + value);
      }
      if (this.body) {
        lines.push("content-length:" + ('' + this.body).length);
      }
      lines.push(Byte.LF + this.body);
      return lines.join(Byte.LF);
    };

    Frame._unmarshallSingle = function(data) {
      var body, chr, command, divider, headerLines, headers, i, idx, len, line, start, trim, _i, _j, _ref, _ref1;
      divider = data.search(RegExp("" + Byte.LF + Byte.LF));
      headerLines = data.substring(0, divider).split(Byte.LF);
      command = headerLines.shift();
      headers = {};
      trim = function(str) {
        return str.replace(/^\s+|\s+$/g, '');
      };
      line = idx = null;
      for (i = _i = 0, _ref = headerLines.length; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
        line = headerLines[i];
        idx = line.indexOf(':');
        headers[trim(line.substring(0, idx))] = trim(line.substring(idx + 1));
      }
      body = '';
      start = divider + 2;
      if (headers['content-length']) {
        len = parseInt(headers['content-length']);
        body = ('' + data).substring(start, start + len);
      } else {
        chr = null;
        for (i = _j = start, _ref1 = data.length; start <= _ref1 ? _j < _ref1 : _j > _ref1; i = start <= _ref1 ? ++_j : --_j) {
          chr = data.charAt(i);
          if (chr === Byte.NULL) {
            break;
          }
          body += chr;
        }
      }
      return new Frame(command, headers, body);
    };

    Frame.unmarshall = function(datas) {
      var data;
      return (function() {
        var _i, _len, _ref, _results;
        _ref = datas.split(RegExp("" + Byte.NULL + Byte.LF + "*"));
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          data = _ref[_i];
          if ((data != null ? data.length : void 0) > 0) {
            _results.push(Frame._unmarshallSingle(data));
          }
        }
        return _results;
      })();
    };

    Frame.marshall = function(command, headers, body) {
      var frame;
      frame = new Frame(command, headers, body);
      return frame.toString() + Byte.NULL;
    };

    return Frame;

  })();

  Stomp = {
    libVersion: "2.0.0",
    VERSIONS: {
      V1_0: '1.0',
      V1_1: '1.1',
      V1_2: '1.2',
      supportedVersions: function() {
        return '1.1,1.0';
      }
    },
    client: function(url, protocols) {
      var klass, ws;
      if (protocols == null) {
        protocols = ['v10.stomp', 'v11.stomp'];
      }
      klass = Stomp.WebSocketClass || WebSocket;
      ws = new klass(url, protocols);
      return new Client(ws);
    },
    over: function(ws) {
      return new Client(ws);
    }
  };

  Client = (function() {

    function Client(ws) {
      this.ws = ws;
      this.ws.binaryType = "arraybuffer";
      this.counter = 0;
      this.connected = false;
      this.heartbeat = {
        outgoing: 10000,
        incoming: 10000
      };
      this.subscriptions = {};
    }

    Client.prototype._transmit = function(command, headers, body) {
      var out;
      out = Frame.marshall(command, headers, body);
      if (typeof this.debug === "function") {
        this.debug(">>> " + out);
      }
      return this.ws.send(out);
    };

    Client.prototype._setupHeartbeat = function(headers) {
      var serverIncoming, serverOutgoing, ttl, v, _ref, _ref1,
        _this = this;
      if ((_ref = headers.version) === Stomp.VERSIONS.V1_1 || _ref === Stomp.VERSIONS.V1_2) {
        _ref1 = (function() {
          var _i, _len, _ref1, _results;
          _ref1 = headers['heart-beat'].split(",");
          _results = [];
          for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
            v = _ref1[_i];
            _results.push(parseInt(v));
          }
          return _results;
        })(), serverOutgoing = _ref1[0], serverIncoming = _ref1[1];
        if (!(this.heartbeat.outgoing === 0 || serverIncoming === 0)) {
          ttl = Math.max(this.heartbeat.outgoing, serverIncoming);
          if (typeof this.debug === "function") {
            this.debug("send PING every " + ttl + "ms");
          }
          this.pinger = typeof window !== "undefined" && window !== null ? window.setInterval(function() {
            _this.ws.send(Byte.LF);
            return typeof _this.debug === "function" ? _this.debug(">>> PING") : void 0;
          }, ttl) : void 0;
        }
        if (!(this.heartbeat.incoming === 0 || serverOutgoing === 0)) {
          ttl = Math.max(this.heartbeat.incoming, serverOutgoing);
          if (typeof this.debug === "function") {
            this.debug("check PONG every " + ttl + "ms");
          }
          return this.ponger = typeof window !== "undefined" && window !== null ? window.setInterval(function() {
            var delta;
            delta = Date.now() - _this.serverActivity;
            if (delta > ttl * 2) {
              if (typeof _this.debug === "function") {
                _this.debug("did not receive server activity for the last " + delta + "ms");
              }
              return _this._cleanUp();
            }
          }, ttl) : void 0;
        }
      }
    };

    Client.prototype.connect = function(login_, passcode_, connectCallback, errorCallback, vhost_, heartbeat) {
      var _this = this;
      this.connectCallback = connectCallback;
      if (heartbeat == null) {
        heartbeat = "10000,10000";
      }
      if (typeof this.debug === "function") {
        this.debug("Opening Web Socket...");
      }
      this.ws.onmessage = function(evt) {
        var data, frame, i, onreceive, view, _i, _len, _ref, _results;
        data = (function() {
          var _i, _len;
          if (typeof ArrayBuffer !== 'undefined' && evt.data instanceof ArrayBuffer) {
            view = new Uint8Array(evt.data);
            if (typeof this.debug === "function") {
              this.debug("--- got data length: " + view.length);
            }
            data = "";
            for (_i = 0, _len = view.length; _i < _len; _i++) {
              i = view[_i];
              data += String.fromCharCode(i);
            }
            return data;
          } else {
            return evt.data;
          }
        }).call(_this);
        _this.serverActivity = Date.now();
        if (data === Byte.LF) {
          if (typeof _this.debug === "function") {
            _this.debug("<<< PONG");
          }
          return;
        }
        if (typeof _this.debug === "function") {
          _this.debug("<<< " + data);
        }
        _ref = Frame.unmarshall(data);
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          frame = _ref[_i];
          if (frame.command === "CONNECTED") {
            if (typeof _this.debug === "function") {
              _this.debug("connected to server " + frame.headers.server);
            }
            _this.connected = true;
            _this._setupHeartbeat(frame.headers);
            _results.push(typeof _this.connectCallback === "function" ? _this.connectCallback(frame) : void 0);
          } else if (frame.command === "MESSAGE") {
            onreceive = _this.subscriptions[frame.headers.subscription];
            _results.push(typeof onreceive === "function" ? onreceive(frame) : void 0);
          } else if (frame.command === "RECEIPT") {
            _results.push(typeof _this.onreceipt === "function" ? _this.onreceipt(frame) : void 0);
          } else if (frame.command === "ERROR") {
            _results.push(typeof errorCallback === "function" ? errorCallback(frame) : void 0);
          } else {
            _results.push(typeof _this.debug === "function" ? _this.debug("Unhandled frame: " + frame) : void 0);
          }
        }
        return _results;
      };
      this.ws.onclose = function() {
        var msg;
        msg = "Whoops! Lost connection to " + _this.ws.url;
        if (typeof _this.debug === "function") {
          _this.debug(msg);
        }
        return typeof errorCallback === "function" ? errorCallback(msg) : void 0;
      };
      return this.ws.onopen = function() {
        var headers, v, _ref;
        if (typeof _this.debug === "function") {
          _this.debug('Web Socket Opened...');
        }
        headers = {
          login: login_,
          passcode: passcode_
        };
        if (vhost_) {
          headers.host = vhost_;
        }
        headers['heart-beat'] = heartbeat;
        _ref = (function() {
          var _i, _len, _ref, _results;
          _ref = heartbeat.split(",");
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            v = _ref[_i];
            _results.push(parseInt(v));
          }
          return _results;
        })(), _this.heartbeat.outgoing = _ref[0], _this.heartbeat.incoming = _ref[1];
        headers['accept-version'] = Stomp.VERSIONS.supportedVersions();
        return _this._transmit("CONNECT", headers);
      };
    };

    Client.prototype.disconnect = function(disconnectCallback) {
      this._transmit("DISCONNECT");
      this.ws.onclose = null;
      this._cleanUp();
      return typeof disconnectCallback === "function" ? disconnectCallback() : void 0;
    };

    Client.prototype._cleanUp = function() {
      this.ws.close();
      this.connected = false;
      if (this.pinger) {
        if (typeof window !== "undefined" && window !== null) {
          window.clearInterval(this.pinger);
        }
      }
      if (this.ponger) {
        return typeof window !== "undefined" && window !== null ? window.clearInterval(this.ponger) : void 0;
      }
    };

    Client.prototype.send = function(destination, headers, body) {
      if (headers == null) {
        headers = {};
      }
      if (body == null) {
        body = '';
      }
      headers.destination = destination;
      return this._transmit("SEND", headers, body);
    };

    Client.prototype.subscribe = function(destination, callback, headers) {
      var id;
      if (headers == null) {
        headers = {};
      }
      if (typeof headers.id === 'undefined' || headers.id.length === 0) {
        id = "sub-" + this.counter++;
        headers.id = id;
      } else {
        id = headers.id;
      }
      headers.destination = destination;
      this.subscriptions[id] = callback;
      this._transmit("SUBSCRIBE", headers);
      return id;
    };

    Client.prototype.unsubscribe = function(id, headers) {
      if (headers == null) {
        headers = {};
      }
      headers.id = id;
      delete this.subscriptions[id];
      return this._transmit("UNSUBSCRIBE", headers);
    };

    Client.prototype.begin = function(transaction) {
      return this._transmit("BEGIN", {
        transaction: transaction
      });
    };

    Client.prototype.commit = function(transaction) {
      return this._transmit("COMMIT", {
        transaction: transaction
      });
    };

    Client.prototype.abort = function(transaction) {
      return this._transmit("ABORT", {
        transaction: transaction
      });
    };

    Client.prototype.nack = function(messageID, subscription, transaction) {
      if (transaction == null) {
        transaction = null;
      }
      return this._transmit("ACK", {
        "message-id": messageID,
        subscription: subscription,
        transaction: transaction ? transaction : void 0
      });
    };

    Client.prototype.nack = function(messageID, subscription, transaction) {
      if (transaction == null) {
        transaction = null;
      }
      return this._transmit("NACK", {
        "message-id": messageID,
        subscription: subscription,
        transaction: transaction ? transaction : void 0
      });
    };

    return Client;

  })();

  Stomp.Frame = Frame;

  if (typeof window !== "undefined" && window !== null) {
    window.Stomp = Stomp;
  } else {
    exports.Stomp = Stomp;
    Stomp.WebSocketClass = require('./test/server.mock.js').StompServerMock;
  }

}).call(this);
