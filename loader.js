const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
const {readFileSync, writeFileSync, unlinkSync} = require('fs');
const {join} = require('path');

const {editWithAST} = require('@webassemblyjs/wasm-edit');
const t = require('@webassemblyjs/ast');
const {decode} = require('@webassemblyjs/wasm-parser');
const {shrinkPaddedLEB128} = require('@webassemblyjs/wasm-opt');

const wasm_exec = readFileSync(join(__dirname, './wasm_exec.js'));

const decoderOpts = {
  ignoreCodeSection: true,
  ignoreDataSection: true,
};

function inspect(ast) {
  const exports = [];

  t.traverse(ast, {

    ModuleExport({ node }) {
      exports.push(node.name);
    }

  });

  return { exports };
}


function preprocess(ab) {
  const optBin = shrinkPaddedLEB128(new Uint8Array(ab));
  return optBin.buffer;
}

function transformWasm(ast, bin) {
  return editWithAST(ast, bin, {
    ModuleImport({node}) {

      if (node.module === 'go') {
        node.module = '/tmp/wasm-loader.js';
      }
    }
  });
}

const generateWasmWrapperLoader = () => wasm_exec + `
  window._go = new Go();

  module.exports = window._go.importObject.go;
`;

const generateUserWrapperLoader = exportNames => wasm_exec + `
  const instanceExports = require('/tmp/module.wasm');

  window._go.argv = [];
  window._go.env = [];
  window._go.exit = () => console.log('EXIT CALLED');
  window._go.run({ exports: instanceExports })

  ${exportNames.map(
    name => 'export const ' + name + ' = instanceExports.' + name
  ).join(';')}
`;

const getGoBin = root => `${root}/bin/go`;

function compileSource(source, {GOROOT}) {
  const inFile = 'tmp.go';
  const outFile = 'tmp.wasm';

  writeFileSync(inFile, source);

  const bin = getGoBin(GOROOT);

  const options = {
    env: {
      GOROOT,
      GOARCH: 'wasm',
      GOOS: 'js',
    }
  };

  const args = [
    'build',
    '-o', outFile,
    inFile
  ];

  return execFile(bin, args, options)
    .then(({stdout, stderr}) => {

      if (stderr !== '') {
        throw new Error(stderr);
      }

      unlinkSync(inFile);

      const out = readFileSync(outFile, null);
      unlinkSync(outFile);

      return out;
    });
}

module.exports = function(source) {
  this.cacheable();

  const callback = this.async();
  const options = this.query;

  compileSource(source, options)
    .then(bin => {
      bin = preprocess(bin);

      const ast = decode(bin, decoderOpts);

      bin = transformWasm(ast, bin);
      writeFileSync('/tmp/module.wasm', new Buffer(bin));

      const info = inspect(ast);
      callback(null, generateUserWrapperLoader(info.exports));

      writeFileSync('/tmp/wasm-loader.js', generateWasmWrapperLoader());
    })
    .catch(e => {
      this.emitError(e)
      throw e;
    });
};

