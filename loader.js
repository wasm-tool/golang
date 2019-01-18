const {execFile} = require('child_process');
const {readFileSync, writeFileSync, unlinkSync} = require('fs');
const {join} = require('path');

const {editWithAST} = require('@webassemblyjs/wasm-edit');
const t = require('@webassemblyjs/ast');
const {decode} = require('@webassemblyjs/wasm-parser');
const {shrinkPaddedLEB128} = require('@webassemblyjs/wasm-opt');

const wasm_exec = readFileSync(join(__dirname, './wasm_exec.js'));

const LOADER_FILE = '/tmp/wasm-loader.js';
const WASM_FILE = '/tmp/module.wasm';

const decoderOpts = {
  ignoreCodeSection: true,
  ignoreDataSection: true,
};

// const debug = msg => process.stderr.write(msg)
const debug = msg => {}

function inspect(ast) {
  const exports = [];

  t.traverse(ast, {

    ModuleExport({ node }) {
      exports.push(node.name);
    }

  });

  return { exports };
}

function transformWasm(ast, bin) {
  return editWithAST(ast, bin, {
    ModuleImport({node}) {

      if (node.module === 'go') {
        node.module = LOADER_FILE;
      }
    }
  });
}

const generateJSToWasmWrapperLoader = () => `
  ${wasm_exec}

  window._go = new Go();
  window._go.argv = [];
  window._go.env = [];
  window._go.exit = () => console.log('EXIT CALLED');

  module.exports = window._go.importObject.go;
`;

const generateWasmToJSWrapperLoader = exportNames => `
  import * as exports from "${WASM_FILE}";
  window._go.run({ exports });

  ${exportNames.map(
    name => 'export const ' + name + ' = exports.' + name
  ).join(';')}
`;

const getGoBin = root => `${root}/bin/go`;

function compileSource(source, {GOROOT, GOPATH}) {
  const inFile = './src'; // source directory
  const outFile = 'tmp.wasm';

  const bin = getGoBin(GOROOT);

  const options = {
    env: {
      GOROOT,
      GOPATH,
      GOARCH: 'wasm',
      GOOS: 'js'
    },
  };

  const args = [
    'build',
    '-o', outFile,
    inFile
  ];

  return new Promise((resolve, reject) => execFile(bin, args, options, (error, stdout, stderr) => {
    if (error) {
      console.log(stderr);
      return reject(error);
    }

    const out = readFileSync(outFile, null);
    unlinkSync(outFile);

    return resolve(out);
  }));
}

module.exports = function(source) {
  this.cacheable();

  const callback = this.async();
  const options = this.query;

  return compileSource(source, options)
    .then(bin => {
      debug("decode")
      const ast = decode(bin, decoderOpts);
      debug(" OK\n")

      debug("transform")
      bin = transformWasm(ast, bin);
      writeFileSync(WASM_FILE, new Buffer(bin));
      debug(" OK\n")

      debug("codegen")
      const info = inspect(ast);
      console.log(generateWasmToJSWrapperLoader(info.exports));
      callback(null, generateWasmToJSWrapperLoader(info.exports));

      writeFileSync(LOADER_FILE, generateJSToWasmWrapperLoader());
      debug(" OK\n")
    })
    .catch(e => {
      callback(e, "");
    });
};

