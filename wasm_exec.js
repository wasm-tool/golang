// http://encoding.spec.whatwg.org/#textencoder
// http://encoding.spec.whatwg.org/#textencoder
//
// Based on https://gist.github.com/Yaffle/5458286

function TextEncoder() {
}

TextEncoder.prototype.encode = function (string) {
  var octets = [];
  var length = string.length;
  var i = 0;
  while (i < length) {
    var codePoint = string.codePointAt(i);
    var c = 0;
    var bits = 0;
    if (codePoint <= 0x0000007F) {
      c = 0;
      bits = 0x00;
    } else if (codePoint <= 0x000007FF) {
      c = 6;
      bits = 0xC0;
    } else if (codePoint <= 0x0000FFFF) {
      c = 12;
      bits = 0xE0;
    } else if (codePoint <= 0x001FFFFF) {
      c = 18;
      bits = 0xF0;
    }
    octets.push(bits | (codePoint >> c));
    c -= 6;
    while (c >= 0) {
      octets.push(0x80 | ((codePoint >> c) & 0x3F));
      c -= 6;
    }
    i += codePoint >= 0x10000 ? 2 : 1;
  }
  return octets;
};

function TextDecoder() {
}

TextDecoder.prototype.decode = function (octets) {
  var string = "";
  var i = 0;
  while (i < octets.length) {
    var octet = octets[i];
    var bytesNeeded = 0;
    var codePoint = 0;
    if (octet <= 0x7F) {
      bytesNeeded = 0;
      codePoint = octet & 0xFF;
    } else if (octet <= 0xDF) {
      bytesNeeded = 1;
      codePoint = octet & 0x1F;
    } else if (octet <= 0xEF) {
      bytesNeeded = 2;
      codePoint = octet & 0x0F;
    } else if (octet <= 0xF4) {
      bytesNeeded = 3;
      codePoint = octet & 0x07;
    }
    if (octets.length - i - bytesNeeded > 0) {
      var k = 0;
      while (k < bytesNeeded) {
        octet = octets[i + k + 1];
        codePoint = (codePoint << 6) | (octet & 0x3F);
        k += 1;
      }
    } else {
      codePoint = 0xFFFD;
      bytesNeeded = octets.length - i;
    }
    string += String.fromCodePoint(codePoint);
    i += bytesNeeded + 1;
  }
  return string
};


// Copyright 2018 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.
//
// Based on go1.11.4

// Copyright 2018 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

(() => {
	// Map web browser API and Node.js API to a single common API (preferring web standards over Node.js API).
	const isNodeJS = false;
	if (isNodeJS) {
		global.require = require;
		global.fs = require("fs");

		const nodeCrypto = require("crypto");
		global.crypto = {
			getRandomValues(b) {
				nodeCrypto.randomFillSync(b);
			},
		};

		global.performance = {
			now() {
				const [sec, nsec] = process.hrtime();
				return sec * 1000 + nsec / 1000000;
			},
		};

		const util = require("util");
		global.TextEncoder = util.TextEncoder;
		global.TextDecoder = util.TextDecoder;
	} else {
		if (typeof window !== "undefined") {
			window.global = window;
		} else if (typeof self !== "undefined") {
			self.global = self;
		} else {
			throw new Error("cannot export Go (neither window nor self is defined)");
		}

		let outputBuf = "";
		global.fs = {
			constants: { O_WRONLY: -1, O_RDWR: -1, O_CREAT: -1, O_TRUNC: -1, O_APPEND: -1, O_EXCL: -1 }, // unused
			writeSync(fd, buf) {
				outputBuf += decoder.decode(buf);
				const nl = outputBuf.lastIndexOf("\n");
				if (nl != -1) {
					console.log(outputBuf.substr(0, nl));
					outputBuf = outputBuf.substr(nl + 1);
				}
				return buf.length;
			},
			openSync(path, flags, mode) {
				const err = new Error("not implemented");
				err.code = "ENOSYS";
				throw err;
			},
		};
	}

	const encoder = new TextEncoder("utf-8");
	const decoder = new TextDecoder("utf-8");

	global.Go = class {
		constructor() {
			this.argv = ["js"];
			this.env = {};
			this.exit = (code) => {
				if (code !== 0) {
					console.warn("exit code:", code);
				}
			};
			this._callbackTimeouts = new Map();
			this._nextCallbackTimeoutID = 1;

			const mem = () => {
				// The buffer may change when requesting more memory.
				return new DataView(this._inst.exports.mem.buffer);
			}

			const setInt64 = (addr, v) => {
				mem().setUint32(addr + 0, v, true);
				mem().setUint32(addr + 4, Math.floor(v / 4294967296), true);
			}

			const getInt64 = (addr) => {
				const low = mem().getUint32(addr + 0, true);
				const high = mem().getInt32(addr + 4, true);
				return low + high * 4294967296;
			}

			const loadValue = (addr) => {
				const f = mem().getFloat64(addr, true);
				if (!isNaN(f)) {
					return f;
				}

				const id = mem().getUint32(addr, true);
				return this._values[id];
			}

			const storeValue = (addr, v) => {
				const nanHead = 0x7FF80000;

				if (typeof v === "number") {
					if (isNaN(v)) {
						mem().setUint32(addr + 4, nanHead, true);
						mem().setUint32(addr, 0, true);
						return;
					}
					mem().setFloat64(addr, v, true);
					return;
				}

				switch (v) {
					case undefined:
						mem().setUint32(addr + 4, nanHead, true);
						mem().setUint32(addr, 1, true);
						return;
					case null:
						mem().setUint32(addr + 4, nanHead, true);
						mem().setUint32(addr, 2, true);
						return;
					case true:
						mem().setUint32(addr + 4, nanHead, true);
						mem().setUint32(addr, 3, true);
						return;
					case false:
						mem().setUint32(addr + 4, nanHead, true);
						mem().setUint32(addr, 4, true);
						return;
				}

				let ref = this._refs.get(v);
				if (ref === undefined) {
					ref = this._values.length;
					this._values.push(v);
					this._refs.set(v, ref);
				}
				let typeFlag = 0;
				switch (typeof v) {
					case "string":
						typeFlag = 1;
						break;
					case "symbol":
						typeFlag = 2;
						break;
					case "function":
						typeFlag = 3;
						break;
				}
				mem().setUint32(addr + 4, nanHead | typeFlag, true);
				mem().setUint32(addr, ref, true);
			}

			const loadSlice = (addr) => {
				const array = getInt64(addr + 0);
				const len = getInt64(addr + 8);
				return new Uint8Array(this._inst.exports.mem.buffer, array, len);
			}

			const loadSliceOfValues = (addr) => {
				const array = getInt64(addr + 0);
				const len = getInt64(addr + 8);
				const a = new Array(len);
				for (let i = 0; i < len; i++) {
					a[i] = loadValue(array + i * 8);
				}
				return a;
			}

			const loadString = (addr) => {
				const saddr = getInt64(addr + 0);
				const len = getInt64(addr + 8);
				return decoder.decode(new DataView(this._inst.exports.mem.buffer, saddr, len));
			}

			const timeOrigin = Date.now() - performance.now();
			this.importObject = {
				go: {
					// func wasmExit(code int32)
					"runtime.wasmExit": (sp) => {
						const code = mem().getInt32(sp + 8, true);
						this.exited = true;
						delete this._inst;
						delete this._values;
						delete this._refs;
						this.exit(code);
					},

					// func wasmWrite(fd uintptr, p unsafe.Pointer, n int32)
					"runtime.wasmWrite": (sp) => {
						const fd = getInt64(sp + 8);
						const p = getInt64(sp + 16);
						const n = mem().getInt32(sp + 24, true);
						fs.writeSync(fd, new Uint8Array(this._inst.exports.mem.buffer, p, n));
					},

					// func nanotime() int64
					"runtime.nanotime": (sp) => {
						setInt64(sp + 8, (timeOrigin + performance.now()) * 1000000);
					},

					// func walltime() (sec int64, nsec int32)
					"runtime.walltime": (sp) => {
						const msec = (new Date).getTime();
						setInt64(sp + 8, msec / 1000);
						mem().setInt32(sp + 16, (msec % 1000) * 1000000, true);
					},

					// func scheduleCallback(delay int64) int32
					"runtime.scheduleCallback": (sp) => {
						const id = this._nextCallbackTimeoutID;
						this._nextCallbackTimeoutID++;
						this._callbackTimeouts.set(id, setTimeout(
							() => { this._resolveCallbackPromise(); },
							getInt64(sp + 8) + 1, // setTimeout has been seen to fire up to 1 millisecond early
						));
						mem().setInt32(sp + 16, id, true);
					},

					// func clearScheduledCallback(id int32)
					"runtime.clearScheduledCallback": (sp) => {
						const id = mem().getInt32(sp + 8, true);
						clearTimeout(this._callbackTimeouts.get(id));
						this._callbackTimeouts.delete(id);
					},

					// func getRandomData(r []byte)
					"runtime.getRandomData": (sp) => {
                        sp = 10;
                        console.log("runtime.getRandomData", sp);
						crypto.getRandomValues(loadSlice(sp + 8));
					},

					// func stringVal(value string) ref
					"syscall/js.stringVal": (sp) => {
						storeValue(sp + 24, loadString(sp + 8));
					},

					// func valueGet(v ref, p string) ref
					"syscall/js.valueGet": (sp) => {
						storeValue(sp + 32, Reflect.get(loadValue(sp + 8), loadString(sp + 16)));
					},

					// func valueSet(v ref, p string, x ref)
					"syscall/js.valueSet": (sp) => {
						Reflect.set(loadValue(sp + 8), loadString(sp + 16), loadValue(sp + 32));
					},

					// func valueIndex(v ref, i int) ref
					"syscall/js.valueIndex": (sp) => {
						storeValue(sp + 24, Reflect.get(loadValue(sp + 8), getInt64(sp + 16)));
					},

					// valueSetIndex(v ref, i int, x ref)
					"syscall/js.valueSetIndex": (sp) => {
						Reflect.set(loadValue(sp + 8), getInt64(sp + 16), loadValue(sp + 24));
					},

					// func valueCall(v ref, m string, args []ref) (ref, bool)
					"syscall/js.valueCall": (sp) => {
						try {
							const v = loadValue(sp + 8);
							const m = Reflect.get(v, loadString(sp + 16));
							const args = loadSliceOfValues(sp + 32);
							storeValue(sp + 56, Reflect.apply(m, v, args));
							mem().setUint8(sp + 64, 1);
						} catch (err) {
							storeValue(sp + 56, err);
							mem().setUint8(sp + 64, 0);
						}
					},

					// func valueInvoke(v ref, args []ref) (ref, bool)
					"syscall/js.valueInvoke": (sp) => {
						try {
							const v = loadValue(sp + 8);
							const args = loadSliceOfValues(sp + 16);
							storeValue(sp + 40, Reflect.apply(v, undefined, args));
							mem().setUint8(sp + 48, 1);
						} catch (err) {
							storeValue(sp + 40, err);
							mem().setUint8(sp + 48, 0);
						}
					},

					// func valueNew(v ref, args []ref) (ref, bool)
					"syscall/js.valueNew": (sp) => {
						try {
							const v = loadValue(sp + 8);
							const args = loadSliceOfValues(sp + 16);
							storeValue(sp + 40, Reflect.construct(v, args));
							mem().setUint8(sp + 48, 1);
						} catch (err) {
							storeValue(sp + 40, err);
							mem().setUint8(sp + 48, 0);
						}
					},

					// func valueLength(v ref) int
					"syscall/js.valueLength": (sp) => {
						setInt64(sp + 16, parseInt(loadValue(sp + 8).length));
					},

					// valuePrepareString(v ref) (ref, int)
					"syscall/js.valuePrepareString": (sp) => {
						const str = encoder.encode(String(loadValue(sp + 8)));
						storeValue(sp + 16, str);
						setInt64(sp + 24, str.length);
					},

					// valueLoadString(v ref, b []byte)
					"syscall/js.valueLoadString": (sp) => {
						const str = loadValue(sp + 8);
						loadSlice(sp + 16).set(str);
					},

					// func valueInstanceOf(v ref, t ref) bool
					"syscall/js.valueInstanceOf": (sp) => {
						mem().setUint8(sp + 24, loadValue(sp + 8) instanceof loadValue(sp + 16));
					},

					"debug": (value) => {
						console.log(value);
					},
				}
			};
		}

		async run(instance) {
			this._inst = instance;
			this._values = [ // TODO: garbage collection
				NaN,
				undefined,
				null,
				true,
				false,
				global,
				this._inst.exports.mem,
				this,
			];
			this._refs = new Map();
			this._callbackShutdown = false;
			this.exited = false;

			const mem = new DataView(this._inst.exports.mem.buffer)

			// Pass command line arguments and environment variables to WebAssembly by writing them to the linear memory.
			let offset = 4096;

			const strPtr = (str) => {
				let ptr = offset;
				new Uint8Array(mem.buffer, offset, str.length + 1).set(encoder.encode(str + "\0"));
				offset += str.length + (8 - (str.length % 8));
				return ptr;
			};

			const argc = this.argv.length;

			const argvPtrs = [];
			this.argv.forEach((arg) => {
				argvPtrs.push(strPtr(arg));
			});

			const keys = Object.keys(this.env).sort();
			argvPtrs.push(keys.length);
			keys.forEach((key) => {
				argvPtrs.push(strPtr(`${key}=${this.env[key]}`));
			});

			const argv = offset;
			argvPtrs.forEach((ptr) => {
				mem.setUint32(offset, ptr, true);
				mem.setUint32(offset + 4, 0, true);
				offset += 8;
			});

			while (true) {
				const callbackPromise = new Promise((resolve) => {
					this._resolveCallbackPromise = () => {
						if (this.exited) {
							throw new Error("bad callback: Go program has already exited");
						}
						setTimeout(resolve, 0); // make sure it is asynchronous
					};
				});
				this._inst.exports.run(argc, argv);
				if (this.exited) {
					break;
				}
				await callbackPromise;
			}
		}

		static _makeCallbackHelper(id, pendingCallbacks, go) {
			return function() {
				pendingCallbacks.push({ id: id, args: arguments });
				go._resolveCallbackPromise();
			};
		}

		static _makeEventCallbackHelper(preventDefault, stopPropagation, stopImmediatePropagation, fn) {
			return function(event) {
				if (preventDefault) {
					event.preventDefault();
				}
				if (stopPropagation) {
					event.stopPropagation();
				}
				if (stopImmediatePropagation) {
					event.stopImmediatePropagation();
				}
				fn(event);
			};
		}
	}

	if (isNodeJS) {
		if (process.argv.length < 3) {
			process.stderr.write("usage: go_js_wasm_exec [wasm binary] [arguments]\n");
			process.exit(1);
		}

		const go = new Go();
		go.argv = process.argv.slice(2);
		go.env = process.env;
		go.exit = process.exit;
		WebAssembly.instantiate(fs.readFileSync(process.argv[2]), go.importObject).then((result) => {
			process.on("exit", (code) => { // Node.js exits if no callback is pending
				if (code === 0 && !go.exited) {
					// deadlock, make Go print error and stack traces
					go._callbackShutdown = true;
					go._inst.exports.run();
				}
			});
			return go.run(result.instance);
		}).catch((err) => {
			throw err;
		});
	}
})();
