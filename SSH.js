'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }(); // @Compiler-Transpile "true"
// @Compiler-Output "../Dist/SSH.js"

var _jsToolkit = require('js-toolkit');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Driver = require('ssh2');
var FS = require('fs');
var Path = require('path');
var Escape = require('shell-escape');

var access = (0, _jsToolkit.promisify)(FS.access);
var readFile = (0, _jsToolkit.promisify)(FS.readFile);

var validStreams = new Set(['stdout', 'stderr', 'both']);

var SSH = function () {
  function SSH() {
    _classCallCheck(this, SSH);

    this.connection = null;
    this.connected = false;
  }

  _createClass(SSH, [{
    key: 'connect',
    value: function connect(config) {
      var _this = this;

      this.connection = new Driver();
      return new Promise(function (resolve, reject) {
        if (typeof config.username !== 'string') {
          throw new Error('No username provided');
        } else if (typeof config.host !== 'string') {
          throw new Error('No host provided');
        }
        if (config.privateKey) {
          if (Path.isAbsolute(config.privateKey)) {
            try {
              config.privateKey = FS.readFileSync(config.privateKey);
            } catch (err) {
              throw new Error('Unable to read private key');
            }
          }
        }
        _this.connection.on('error', reject);
        _this.connection.on('ready', function () {
          _this.connected = true;
          _this.connection.removeListener('error', reject);
          resolve(_this);
        });
        _this.connection.connect(config);
      });
    }
  }, {
    key: 'mkdir',
    value: function mkdir(path) {
      if (!this.connected) {
        throw new Error('SSH Not yet connected');
      }
      return this.exec('mkdir', ['-p', path]);
    }
  }, {
    key: 'exec',
    value: function exec(filePath) {
      var args = arguments.length <= 1 || arguments[1] === undefined ? [] : arguments[1];
      var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

      if (!this.connected) {
        throw new Error('SSH Not yet connected');
      }
      if (typeof filePath !== 'string') {
        throw new Error('Executable Path must be a string');
      } else if (!(args instanceof Array)) {
        throw new Error('args must be an array');
      } else if ((typeof options === 'undefined' ? 'undefined' : _typeof(options)) !== 'object') {
        throw new Error('Options must be an object');
      } else if (options.cwd && typeof options.cwd !== 'string') {
        throw new Error('Options.cwd must be a string');
      } else if (options.stdin && typeof options.stdin !== 'string') {
        throw new Error('Options.stdin must be a string');
      }
      options.stream = validStreams.has(options.stream) ? options.stream : 'stdout';
      return this.execCommand([filePath].concat(Escape(args)).join(' '), options).then(function (_ref) {
        var stdout = _ref.stdout;
        var stderr = _ref.stderr;
        var code = _ref.code;
        var signal = _ref.signal;

        if (options.stream === 'both') {
          return { stderr: stderr, stdout: stdout, code: code, signal: signal };
        } else if (options.stream === 'stderr') {
          return stderr;
        } else if (options.stream === 'stdout') {
          if (stderr.length) {
            throw new Error(stderr);
          } else return stdout;
        }
      });
    }
  }, {
    key: 'execCommand',
    value: function execCommand(command) {
      var _this2 = this;

      var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

      if (!this.connected) {
        throw new Error('SSH Not yet connected');
      }
      if (typeof command !== 'string') {
        throw new Error('Command must be a string');
      } else if ((typeof options === 'undefined' ? 'undefined' : _typeof(options)) !== 'object') {
        throw new Error('Options must be an object');
      } else if (options.cwd && typeof options.cwd !== 'string') {
        throw new Error('Options.cwd must be a string');
      } else if (options.stdin && typeof options.stdin !== 'string') {
        throw new Error('Options.stdin must be a string');
      }
      if (options.cwd) {
        command = 'cd ' + Escape([options.cwd]) + ' ; ' + command;
      }
      return new Promise(function (resolve, reject) {
        _this2.connection.exec(command, function (err, stream) {
          if (err) {
            return reject(err);
          }
          var contents = { stdout: [], stderr: [] };
          stream.on('close', function (code, signal) {
            resolve({ stdout: contents.stdout.join(''), stderr: contents.stderr.join(''), code: code, signal: signal });
          }).on('data', function (data) {
            contents.stdout.push(data);
          }).stderr.on('data', function (data) {
            contents.stderr.push(data);
          });
          if (options.stdin) {
            stream.write(options.stdin);
            stream.end();
          }
        });
      });
    }
  }, {
    key: 'put',
    value: function put(localFile, remoteFile, SFTP) {
      var _this3 = this;

      var retry = arguments.length <= 3 || arguments[3] === undefined ? true : arguments[3];

      if (!this.connected) {
        throw new Error('SSH Not yet connected');
      } else if (typeof localFile !== 'string') {
        throw new Error('localFile must be a string');
      } else if (typeof remoteFile !== 'string') {
        throw new Error('remoteFile must be a string');
      }
      return access(localFile, FS.R_OK).catch(function () {
        throw new Error('Local file ' + localFile + ' doesn\'t exist');
      }).then(function () {
        return SFTP ? Promise.resolve(SFTP) : _this3.requestSFTP();
      }).then(function (SFTP) {
        return new Promise(function (resolve, reject) {
          SFTP.fastPut(localFile, remoteFile, function (err) {
            if (!err) {
              return resolve();
            }
            if (err.message === 'No such file' && retry) {
              resolve(_this3.mkdir(Path.dirname(remoteFile)).then(function () {
                return _this3.put(localFile, remoteFile, SFTP, false);
              }));
            } else reject(err);
          });
        });
      });
    }
  }, {
    key: 'putMulti',
    value: function putMulti(files, SFTP) {
      var _this4 = this;

      if (!this.connected) {
        throw new Error('SSH Not yet connected');
      } else if (!(files instanceof Array)) {
        throw new Error('Files must be an array');
      }
      SFTP = SFTP ? Promise.resolve(SFTP) : this.requestSFTP();
      return SFTP.then(function (SFTP) {
        var Promises = [];
        files.forEach(function (file) {
          Promises.push(_this4.put(file.Local, file.Remote, SFTP));
        });
        return Promise.all(Promises);
      });
    }
  }, {
    key: 'get',
    value: function get(remoteFile, localFile, SFTP) {
      if (!this.connected) {
        throw new Error('SSH Not yet connected');
      } else if (typeof remoteFile !== 'string') {
        throw new Error('remoteFile must be a string');
      } else if (typeof localFile !== 'string') {
        throw new Error('localFile must be a string');
      }
      SFTP = SFTP ? Promise.resolve(SFTP) : this.requestSFTP();
      return SFTP.then(function (SFTP) {
        return new Promise(function (resolve, reject) {
          SFTP.fastGet(localFile, remoteFile, function (err) {
            if (err) {
              reject(err);
            } else resolve();
          });
        });
      });
    }
  }, {
    key: 'requestSFTP',
    value: function requestSFTP() {
      var _this5 = this;

      if (!this.connected) {
        throw new Error('SSH Not yet connected');
      }
      return new Promise(function (resolve, reject) {
        _this5.connection.sftp(function (err, sftp) {
          if (err) {
            reject(err);
          } else resolve(sftp);
        });
      });
    }
  }, {
    key: 'requestShell',
    value: function requestShell() {
      var _this6 = this;

      if (!this.connected) {
        throw new Error('SSH Not yet connected');
      }
      return new Promise(function (resolve, reject) {
        _this6.connection.shell(function (err, shell) {
          if (err) {
            reject(err);
          } else resolve(shell);
        });
      });
    }
  }, {
    key: 'end',
    value: function end() {
      this.connection.end();
      this.connection = null;
      this.connected = false;
    }
  }]);

  return SSH;
}();

exports.default = SSH;