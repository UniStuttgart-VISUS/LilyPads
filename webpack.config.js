const path = require('path');
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: 'none',
  entry: {
    'dist/bundle': './src/entry.ts',
    'dist/workers/wordcloud-count': './src/workers/wordcloud-count.ts',
    'dist/workers/layout-insets': './src/workers/layout-insets.ts',
  },
  devtool: 'inline-source-map',
  module: {
    rules: [
      {
        use: 'ts-loader',
        exclude: /node_modules/,
        include: path.resolve(__dirname, "src/")
      }
    ]
  },
  resolve: {
    extensions: [ '.ts', '.js' ]
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'lilypads'),
    library: 'EntryPoint'
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        // FontAwesome
        {
          from: 'node_modules/font-awesome/css/font-awesome.min.css',
          to: 'content/font-awesome/css',
        },
        {
          from: 'node_modules/font-awesome/fonts',
          to: 'content/font-awesome/fonts',
        },
        // Leaflet.js
        {
          from: 'node_modules/leaflet/dist/images',
          to: 'content/images',
        },
        // svg-country-flags
        {
          from: 'node_modules/svg-country-flags/svg',
          to: 'content/images/flags',
        },
      ],
    }),
  ],
};
