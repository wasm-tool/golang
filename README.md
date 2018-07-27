# @wasm-tool/golang

> Golang loader for Webpack

**Experimental**

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
          GOROOT: "~/go",
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
