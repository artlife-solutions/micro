//
// This is a simple example Microservice.
//

import { micro, ExchangeConfig } from '../index';
import { IMicroService } from '../index.d';

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
    await service.on("do-some-work", async (args: any, res: any) => {
        //
        // ... do some work ...
        //

        //
        // Emit an outgoing event.
        //
        await service.emit("another-event", { your: "json data goes here" });

        //
        // Acknowledge that the message was handled correctly.
        //
        await res.ack(); 
    });

    await service.listen(null, async (args: any, res: any) => {
        await service.broadcast(null, { response: 'test' });
    });

    //
    // Create a HTTP GET request handler for a particular route.
    // Do some work and return some json.
    // Under the hood this is handled by Express, but the callback is wrapped for 
    // error handling, performance metrics and request tracing.
    //
    service.get('/another-end-point', async (req: any, res: any) => {
        //
        // ... do some work ...
        //

        //
        // Respond to the request with some JSON data.
        //
        await res.json({
            your: "json data"
        });
    });
    
    //
    // End points can be easily forwarded to internal services. 
    //
    service.get('/another-end-point', async (req: any, res: any) => {
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