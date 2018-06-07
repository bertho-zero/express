const { stripSlashes } = require('@feathersjs/commons');
const makeDebug = require('debug');
const getHandler = require('./getHandler');

const debug = makeDebug('@feathersjs/express/rest');

const HTTP_METHOD = Symbol('@feathersjs/express/rest/HTTP_METHOD');

const httpMethod = (verb, urls) => method => {
  method[HTTP_METHOD] = (Array.isArray(urls) ? urls : [urls])
    .reduce(
      (result, url) => ([...result, { verb, url }]),
      method[HTTP_METHOD] || []
    );

  return method;
};

function formatter (req, res, next) {
  if (res.data === undefined) {
    return next();
  }

  res.format({
    'application/json': function () {
      res.json(res.data);
    }
  });
}

function rest (handler = formatter) {
  return function () {
    const app = this;

    if (typeof app.route !== 'function') {
      throw new Error('@feathersjs/express/rest needs an Express compatible app. Feathers apps have to wrapped with feathers-express first.');
    }

    if (!app.version || app.version < '3.0.0') {
      throw new Error(`@feathersjs/express/rest requires an instance of a Feathers application version 3.x or later (got ${app.version})`);
    }

    app.rest = {
      find: getHandler('find'),
      get: getHandler('get'),
      create: getHandler('create'),
      update: getHandler('update'),
      patch: getHandler('patch'),
      remove: getHandler('remove')
    };

    app.use(function (req, res, next) {
      req.feathers = { provider: 'rest' };
      next();
    });

    // Register the REST provider
    app.providers.push(function (service, path, options) {
      const uri = `/${path}`;
      const idUri = `${uri}/:__feathersId`;

      let { middleware } = options;
      let { before, after } = middleware;

      if (typeof handler === 'function') {
        after = after.concat(handler);
      }

      debug(`Adding REST provider for service \`${path}\` at base route \`${uri}\``);

      const methods = service.methods || {};
      const defaultRoutes = [
        { method: 'find', verb: 'GET', url: uri }, // find(params)
        { method: 'get', verb: 'GET', url: idUri }, // get(id, params)
        { method: 'create', verb: 'POST', url: uri }, // create(data, params)
        { method: 'patch', verb: 'PATCH', url: idUri }, // patch(id, data, params)
        { method: 'patch', verb: 'PATCH', url: uri }, // patch(null, data, params)
        { method: 'update', verb: 'PUT', url: idUri }, // update(id, data, params)
        { method: 'update', verb: 'PUT', url: uri }, // update(null, data, params)
        { method: 'remove', verb: 'DELETE', url: idUri }, // remove(id, data, params)
        { method: 'remove', verb: 'DELETE', url: uri } // remove(null, data, params)
      ];
      const routes = Object.keys(methods)
        .filter(methodName => (service[methodName] && service[methodName][HTTP_METHOD]))
        .reduce((result, methodName) => {
          const methodRoutes = (Array.isArray(service[methodName][HTTP_METHOD])
            ? service[methodName][HTTP_METHOD]
            : [service[methodName][HTTP_METHOD]]);
          const defaultUrl = methods[methodName].indexOf('id') === -1
            ? `/${path}/${methodName}`
            : `/${path}/:__feathersId/${methodName}`;

          return [
            ...result,
            ...methodRoutes.map(methodRoute => ({
              method: methodName,
              verb: methodRoute.verb,
              url: methodRoute.url
                ? `/${path}/${stripSlashes(methodRoute.url.replace(':id', ':__feathersId'))}`
                : defaultUrl
            }))
          ];
        }, defaultRoutes);

      const routesStore = {};

      for (const { verb, url, method } of routes) {
        routesStore[url] = routesStore[url] || app.route(url);

        routesStore[url][verb.toLowerCase()](
          ...before,
          getHandler(method, methods[method])(service, routes),
          ...after
        );
      }
    });
  };
}

rest.formatter = formatter;
rest.httpMethod = httpMethod;
rest.HTTP_METHOD = HTTP_METHOD;

module.exports = rest;
