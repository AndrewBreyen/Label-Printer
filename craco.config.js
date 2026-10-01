const webpack = require('webpack');

module.exports = {
  devServer: (config) => {
    const beforeSetup = config.onBeforeSetupMiddleware;
    const afterSetup = config.onAfterSetupMiddleware;
    const configureMiddlewares = config.setupMiddlewares;

    delete config.onBeforeSetupMiddleware;
    delete config.onAfterSetupMiddleware;

    config.setupMiddlewares = (middlewares, devServer) => {
      const captureAppMiddleware = (setup) => {
        if (!setup) return [];

        const registered = [];
        const originalUse = devServer.app.use;
        devServer.app.use = (...args) => {
          registered.push(args);
          return devServer.app;
        };
        try {
          setup(devServer);
        } finally {
          devServer.app.use = originalUse;
        }

        return registered.map(([path, middleware]) =>
          middleware
            ? { name: 'cra-middleware', path, middleware }
            : { name: 'cra-middleware', middleware: path }
        );
      };

      const beforeMiddlewares = captureAppMiddleware(beforeSetup);
      const afterMiddlewares = captureAppMiddleware(afterSetup);
      const configuredMiddlewares = configureMiddlewares
        ? configureMiddlewares(middlewares, devServer)
        : middlewares;

      return [...beforeMiddlewares, ...configuredMiddlewares, ...afterMiddlewares];
    };

    return config;
  },
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        buffer: require.resolve('buffer/'),
      };
      webpackConfig.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
        })
      );
      return webpackConfig;
    },
  },
};