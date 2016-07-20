import { apolloServer } from 'apollo-server';
import express from 'express';
import proxyMiddleware from 'http-proxy-middleware';
import {Meteor} from 'meteor/meteor';
import {check} from 'meteor/check';
import {Accounts} from 'meteor/accounts-base';
import cors from 'cors';

export default function configureGraphQLServer(options = {}) {
  const SERVER_PORT = process.env.PORT || 3000;
  const SERVER_HOST = process.env.HOST || 'localhost';
  const IS_DEV = process.env.NODE_ENV !== 'production';

  const {
    schema,
    resolvers,
    graphPort = 4000,
    graphUrl = '/graphql',
    graphiql = IS_DEV,
    pretty = IS_DEV,
    context = {},
    ...others,
  } = options;

  const server = express();

  // Connect to ngrok in dev mode
  if (IS_DEV && process.env.ENABLE_NGROK ) {
    server.use('*', cors());
    var ngrok = require('ngrok');
    ngrok.connect(SERVER_PORT, (innerErr, url) => {
      if (innerErr) {
        console.log(`Error connecting with ngrok:${innerErr}`);
      }

      console.log(`The app is available via the internet! ${url}:${SERVER_PORT}`);
    });
  } else {
    console.log(`The app is running locally! ${SERVER_HOST}:${SERVER_PORT}`);
  }

  server.use(`${graphUrl}`, apolloServer(async (req) => {
    let userId = null;

    /* eslint-disable no-underscore-dangle */
    /* eslint-disable no-param-reassign */
    if (req.headers.meteorlogintoken) {
      const token = req.headers.meteorlogintoken;
      check(token, String);
      const hashedToken = Accounts._hashLoginToken(token);

      // Get the user from the database
      const user = await Meteor.users.findOne({
        'services.resume.loginTokens.hashedToken': hashedToken,
      }, {
        fields: {
          _id: 1,
          'services.resume.loginTokens.$': 1,
        },
      });

      if (user) {
        const expiresAt = user.services.resume.loginTokens[0].when;
        const isExpired = expiresAt < Date.now(); // TODO or new Date()

        if (!isExpired) {
          userId = user._id;
        }
      }
    }

    return {
      graphiql,
      pretty,
      schema,
      resolvers,
      context: {
        ...context,
        userId,
      },
      ...others,
    };
  }));

  server.listen(graphPort, () => console.log(`
    GraphQL Server is now running on http://${SERVER_HOST}:${graphPort}
    Checkout http://${SERVER_HOST}:${graphPort}${graphUrl} to use GraphiQL
  `));

  WebApp.rawConnectHandlers.use(proxyMiddleware(`http://${SERVER_HOST}:${graphPort}${graphUrl}`));
}

