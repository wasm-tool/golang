const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
  entry: "./src/index.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js"
  },
  module: {
    rules: [
      {
        test: /\.go$/,
        loader: "../loader",
        options: {
          GOROOT: process.env["GOROOT"],
          GOPATH: process.env["GOPATH"]
        }
      }
    ]
  },
  node: {
    fs: "empty"
  },
  plugins: [new HtmlWebpackPlugin()]
};
