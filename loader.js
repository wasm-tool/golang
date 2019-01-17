const {execFile} = require('child_process');
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
      writeFileSync('/tmp/module.wasm', new Buffer(bin));
      debug(" OK\n")

      debug("codegen")
      const info = inspect(ast);
      callback(null, generateUserWrapperLoader(info.exports));

      writeFileSync('/tmp/wasm-loader.js', generateWasmWrapperLoader());
      debug(" OK\n")
    })
    .catch(e => {
      callback(e, "");
    });
};

