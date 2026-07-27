const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const LodashModuleReplacementPlugin = require('lodash-webpack-plugin');
//const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const webpack = require("webpack");
require('dotenv').config();

const htmlPlugin = new HtmlWebpackPlugin({
    template: "./src/index.html",
    filename: "./index.html"
});

module.exports = {
    entry: path.resolve(__dirname, "./src/index.tsx"),
    mode: "development",
    devtool: 'inline-source-map',
    resolve: {
        extensions: [".js", ".jsx", ".json", ".ts", ".tsx", ".css"],
        fallback: {
            os: require.resolve("os-browserify"),
            https: require.resolve("https-browserify"),
            http: require.resolve("stream-http"),
            stream: require.resolve("stream-browserify"),
            util: require.resolve("util/"),
            url: require.resolve("url/"),
            assert: require.resolve("assert/"),
            crypto: require.resolve("crypto-browserify"),
            buffer: require.resolve('buffer/'),
            zlib: false
        }
    },
    module: {
        rules: [
        // {
        //     test: /\.tsx?$/,
        //     loader: "ts-loader",
        //     exclude: /node_modules/,
        // },
        // {
        //     enforce: "pre",
        //     test: /\.js$/,
        //     loader: "source-map-loader",
        // },
        {
            test: /\.(t|j)sx?$/i,
            exclude: /node_modules/,
            use: ["babel-loader"]
        },
        {
            test: /\.css$/i,
            use: ["style-loader", "css-loader", "postcss-loader"]
        },
        {
            test: /\.svg?$/,
            use: ["svg-url-loader"]
        },
        {
            test: /\.m?js/,
            resolve: {
                fullySpecified: false
            }
        },
        {
            test: /\.(png|gif|jpg|jpeg)$/i,
            type: 'asset/resource'
        }
        ]
    },
    plugins: [
        htmlPlugin,
        new webpack.ProvidePlugin({
            Buffer: [require.resolve("buffer/"), "Buffer"],
            process: "process/browser",
            "React": 'react'
        }),
        new LodashModuleReplacementPlugin({
            'collections': true,
            'paths': true
        }),
        new webpack.DefinePlugin({
            'process.env.INFURA_API_KEY': JSON.stringify(process.env.INFURA_API_KEY),
            'process.env.IMX_SANDBOX_URL': JSON.stringify(process.env.IMX_SANDBOX_URL),
            'process.env.IMX_MAINNET_URL': JSON.stringify(process.env.IMX_MAINNET_URL),
            'process.env.COLLECTION_CONTRACT_SANDBOX': JSON.stringify(process.env.COLLECTION_CONTRACT_SANDBOX),
            'process.env.COLLECTION_CONTRACT_MAINNET': JSON.stringify(process.env.COLLECTION_CONTRACT_MAINNET),
            'process.env.ETHERSCAN_API_KEY': JSON.stringify(process.env.ETHERSCAN_API_KEY),
        }),
        //new BundleAnalyzerPlugin()
    ],
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "bundle.js",
    },
    devtool: "source-map",
    devServer: {
        historyApiFallback: true
    }
}