# micro

A tiny and very opinionated microservices framework inspired by expressjs.

This library hosts all the common and boring features shared between our microservices.

WARNING: This library is a work in progress and isn't intended to be general purpose.

Things like:
- logging
- basic error handling
- metrics
- health checks
- tracing requests and events across services

## Environment variables

Configuration of the microserver can be done via environment variables (if not configure specifically in the code):

- HOST - Sets the host for the REST API (defaults to 0.0.0.0).
- PORT - Sets the port number for the REST API (defaults to 3000).
- MESSAGING_HOST - Sets the connection to the RabbitMQ server (defaults to amqp://guest:guest@localhost:5672).
- NODE_ENV - When set to PRODUCTION Morgan request tracing is disabled.
- ENABLE_MORGAN - When set to "true" Morgan request tracing is enabled (can be used to enable request tracing in production).

## Installation

    npm install --save @artlife/micro

## Example Usage

For an example use, please see the template microservice:

https://github.com/artlife-solutions/template-microservice

## Building the code

Open folder in Visual Studio Code and hit Ctrl+Shift+B

Or run

    npm run build

Or

    npx tsc

## Tests

Run

    npm test

Or 

    npm run test:watch

Or

    npx mocha --opts ./src/test/mocha.opts

Or 

    npx mocha --watch --watch-extensions ts --opts ./src/test/mocha.opts

## Debugging

### Debugging the command line app

- Open in Visual Studio Code.
- Select 'Main' debug configuration.
- Set your breakpoints.
- Hit F5 to run.

### Debugging the tests

- Open in Visual Studio Code.
- Select 'Mocha' debug configuration.
- Open the test source file to execute.
- Set your breakpoints.
- Hit F5 to run.

