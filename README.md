# micro

A tiny and very opinionated microservices framework inspired expressjs.

This is library to host all the command and boring features shared between our microservices.

WARNING: This library is a working in progress and isn't intended to be general purpose.

Things like:
- logging
- basic error handling
- metrics
- health checks
- tracing requests and events across services

## Installation

    npm install --save @artlife/micro    

## Example Usage (TypeScript)

```javascript
import * micro from 'micro';

//
// Entry point for the microservice.
// The 'export' keyword is for testing.
//
export async function main(service: IMicroService): Promise<void> { 

    //
    // Handle a message, do some work, then publish a new message.
    // This uses Rabbitmq under the hood for reliable message handling.
    // The callback is wrapped for error handling, performance metrics and message tracing.
    // A bit like Express's post function.
    //
    service.on("do-some-work", async (args, res) => {
        //
        // ... do some work ...
        //

        await service.emit("another-event", { your: "json data goes here" });

        //
        // Acknowledge that the message was handled correctly.
        //
        await res.ack(); 
    });

    //
    // Create a HTTP GET request handler for a particular route.
    // Do some work and return some json.
    // Under the hood this is handled by Express, but the callback is wrapped for 
    // error handling, performance metrics and request tracing.
    //
    service.get('/another-end-point', async (req, res) => {
        //
        // ... do some work ...
        //
        res.json({
            your: "json data"
        });
    });
    
    //
    // End points can be easily forwarded to internal services. 
    //
    service.get('/another-end-point', async (req, res) => {
        //
        // Proxy the request to 'another-service'.
        //
        service.forwardRequest("another-service", "/a-different-end-point", { optionalQueryParameters: "go here" }, res);
    });

    //
    // Initiate the service (a bit like like Express' listen function).
    //
    await service.start();

}

if (require.main === module) {

    
    //
    // Run micro service as normal.
    //
    const service = micro();

    main(service) 
        .then(() => console.log("Online"))
        .catch(err => {
            console.error("Failed to start!");
            console.error(err && err.stack || err);
        });
}
else {
    //
    // Don't start microservice, this allows the service to be loaded for unit testing.
    //        
}
```

## Building the code

Open folder in Visual Studio Code and hit Ctrl+Shift+B

Or

    npm build

Or

    npx tsc [-w]

## Tests

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

