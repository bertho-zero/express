const makeDebug = require('debug');
const wrappers = require('./wrappers');

const debug = makeDebug('@feathersjs/express/rest');

const HTTP_METHOD = Symbol('@feathersjs/express/rest/HTTP_METHOD');

const httpMethod = _httpMethod => method => {
  method[HTTP_METHOD] = _httpMethod;
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

    app.rest = wrappers;

    app.use(function (req, res, next) {
      req.feathers = { provider: 'rest' };
      next();
    });

    // Register the REST provider
    app.providers.push(function (service, path, options) {
      const uri = `/${path}`;
      const baseRoute = app.route(uri);
      const idRoute = app.route(`${uri}/:__feathersId`);

      let { middleware } = options;
      let { before, after } = middleware;

      if (typeof handler === 'function') {
        after = after.concat(handler);
      }

      debug(`Adding REST provider for service \`${path}\` at base route \`${uri}\``);

      const customMethods = service.methods || {};
      const customHttpMethods = Object.keys(customMethods)
        .filter(methodName => service[methodName][HTTP_METHOD]);

      const methodMap = customHttpMethods.reduce((result, methodName) => ({
        ...result,
        [methodName]: service[methodName][HTTP_METHOD]
      }), {
        find: 'GET',
        get: 'GET',
        create: 'POST',
        update: 'PUT',
        patch: 'PATCH',
        remove: 'DELETE'
      });

      // GET / -> service.find(params)
      baseRoute.get(...before, app.rest.find(service, methodMap), ...after);
      // POST / -> service.create(data, params)
      baseRoute.post(...before, app.rest.create(service, methodMap), ...after);
      // PATCH / -> service.patch(null, data, params)
      baseRoute.patch(...before, app.rest.patch(service, methodMap), ...after);
      // PUT / -> service.update(null, data, params)
      baseRoute.put(...before, app.rest.update(service, methodMap), ...after);
      // DELETE / -> service.remove(null, params)
      baseRoute.delete(...before, app.rest.remove(service, methodMap), ...after);

      // GET /:id -> service.get(id, params)
      idRoute.get(...before, app.rest.get(service, methodMap), ...after);
      // PUT /:id -> service.update(id, data, params)
      idRoute.put(...before, app.rest.update(service, methodMap), ...after);
      // PATCH /:id -> service.patch(id, data, params)
      idRoute.patch(...before, app.rest.patch(service, methodMap), ...after);
      // DELETE /:id -> service.remove(id, params)
      idRoute.delete(...before, app.rest.remove(service, methodMap), ...after);

      customHttpMethods
        .forEach(methodName => {
          const method = service[methodName][HTTP_METHOD].toLowerCase();

          const route = customMethods[methodName].indexOf('id') === -1
            ? `${uri}/${methodName}`
            : `${uri}/:__feathersId/${methodName}`;

          app.route(route)[method](
            ...before,
            wrappers.getHandler(methodName, customMethods[methodName])(service, methodMap),
            ...after
          );
        });
    });
  };
}

rest.formatter = formatter;
rest.httpMethod = httpMethod;
rest.HTTP_METHOD = HTTP_METHOD;

module.exports = rest;
