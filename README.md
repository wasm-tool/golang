# @wasm-tool/golang

> Golang loader for Webpack

## Attention

This plugin is still experimental. Golang used to generate big Wasm modules which may take time to decode.

## Installation

```sh
npm i -D @wasm-tool/golang
```

## Usage

Since WebAssembly support in Golang hasn't been released yet, you'll need to compile master on your own.

The `GOROOT` options should point to your fresh Golang installation.

```js
module.exports = {
  // ...

  module: {
    rules: [
      {
        test: /\.go$/,
        loader: "@wasm-tool/golang",
        options: {
          GOROOT: process.env["GOROOT"],
          GOPATH: process.env["GOPATH"]
        }
      }
    ]
  },
  node: {
    fs: "empty"
  }

  // ...
};
```
