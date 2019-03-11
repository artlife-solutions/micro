//
// Shared microservices framework.
//

import * as express from 'express';
import { Express } from 'express';
import * as amqp from 'amqplib';
import * as request from 'request';
import * as requestPromise from 'request-promise';
import { readJsonFile } from './file';
import { sleep, asyncHandler, retry } from './utils';
export { sleep, asyncHandler, retry } from './utils';
import { reject, resolve } from 'bluebird';
const morganBody = require('morgan-body');
import * as http from 'http';

const inProduction = process.env.NODE_ENV === "production";
const enableMorgan = !inProduction || process.env.ENABLE_MORGAN === "true";

/**
 * Logging interface. Allows log from multiple microservices to be aggregated.
 */
export interface ILog {
    /**
     * Issue a warning.
     */
    warn(...args: any[]): void;

    /**
     * Issue an information message.
     */
    info(...args: any[]): void;

    /**
     * Issue a verbose message.
     */
    verbose(...args: any[]): void;

    /**
     * Record an error message.
     */
    error(...args: any[]): void;

    /**
     * Record an exception that was thrown
     */
    exception(err: any, ...args: any[]): void;
}

/**
 * Interface used to time various events.
 */
export interface ITimer {

    /**
     * Start a timer.
     * 
     * @param timerName The name of the timer.
     */
    start(timerName: string): void;

    /**
     * Stop a timer.
     * 
     * @param timerName The name of the timer.
     */
    stop(timerName: string): void;
}

/**
 * Interface for a service to output metrics.
 */
export interface IMetrics {

    /**
     * Output a discrete metric value.
     * 
     * @param name The name of the metric.
     * @param value The value of the metric.
     */
    discrete(name: string, value: number): void;

    /**
     * Output a continous metric value.
     * 
     * @param name The name of the metric.
     * @param value The value of the metric.
     */
    continuous(name: string, value: number): void;
}

/**
 * Configures a microservice.
 */
export interface IMicroServiceConfig {

}

/**
 * Interface for responding to events.
 */
export interface IEventResponse {
    /**
     * Acknoledge that the event was successfully handled.
     */
    ack(): Promise<void>;
}

/**
 * Defines a potentially asynchronous callback function for handling an incoming event.
 */
export type EventHandlerFn<EventArgsT> = (eventArgs: EventArgsT, response: IEventResponse) => Promise<void>;

/**
 * Defines a potentially asynchronous callback function for handling an incoming HTTP GET request.
 */
export type GetRequestHandlerFn = (request: express.Request, response: express.Response) => Promise<void>;

/**
 * Defines a potentially asynchronous callback function for handling an incoming HTTP POST request.
 */
export type PostRequestHandlerFn = (request: express.Request, response: express.Response) => Promise<void>;

/**
 * Interface that represents a particular microservice instance.
 */
export interface IMicroService {

    /**
     * Returns true if the messaging system is currently available.
     */
    isMessagingAvailable(): boolean;

    /**
     * Create a handler for a named incoming event from a direct queue.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to handle.
     * @param eventHandler Callback to be invoke when the incoming event is received.
     */
    on<EventArgsT = any>(eventName: string, eventHandler: EventHandlerFn<EventArgsT>): Promise<void>;

    /**
     * Emit a named outgoing event.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to emit.
     * @param eventArgs Event args to publish with the event and be received at the other end.
     */
    emit<EventArgsT = any>(eventName: string, eventArgs: EventArgsT): Promise<void>;

    /**
     * Create a handler for incoming HTTP GET requests.
     * Implemented by Express under the hood.
     */
    get(route: string, requestHandler: GetRequestHandlerFn): void;

    /**
     * Create a handler for incoming HTTP POST requests.
     * Implemented by Express under the hood
     * 
     * @param route 
     * @param requestHandler 
     */
    post(route: string, requestHandler: PostRequestHandlerFn): void;

    /**
     * Make a request to another service.
     * 
     * @param serviceName The name (logical or host) of the service.
     * @param route The HTTP route on the service to make the request to.
     * @param params Query parameters for the request.
     */
    request(serviceName: string, route: string, params?: any): Promise<any>;

    /**
     * Forward HTTP get request to another named service.
     * The response from the forward requests is automatically piped into the passed in response.
     * 
     * @param serviceName The name of the service to forward the request to.
     * @param route The HTTP GET route to forward to.
     * @param body The body of the forwarded request.
     * @param response The response for the HTTP GET current request, to have the response forwarded to.
     */
    forwardRequest<RequestBodyT, ResponseT>(serviceName: string, route: string, body: RequestBodyT, response: express.Response): void;

    /**
     * Forward HTTP get request to another named service.
     * The response from the forward requests is automatically piped into the passed in response.
     * 
     * @param serviceName The name of the service to forward the request to.
     * @param route The HTTP GET route to forward to.
     * @param params Query parameters for the request.
     * @param res The stream to pipe response to.
     */
    forwardRequest2(serviceName: string, route: string, params: any, req: express.Request, res: express.Response): void;

    /**
     * Setup serving of static files.
     * 
     * @param dirPath The path to the directory that contains static files.
     */
    static(dirPath: string): void;

    /**
     * Reference to the logging interface.
     * This allows the logging from multiple microservices to be aggregated.
     */
    readonly log: ILog;

    /**
     * Reference to the timer interface.
     * Allows a service to time code for performance.
     */
    readonly timer: ITimer;

    /**
     * Reference to the metrics interface.
     * Allows a service to output metrics.
     */
    readonly metrics: IMetrics;


    /**
     * Reference to the express object.
     */
    readonly expressApp: express.Express;

    /**
     * Reference to the HTTP server.
     */
    readonly httpServer: http.Server;
    
    /**
     * Starts the microservice.
     * It starts listening for incoming HTTP requests and events.
     */
    start(): Promise<void>;

}

interface StringMap {
    [index: string]: string;
}

//TODO: These should be passed into micro via options if necessary.
const host = process.env.HOST || '0.0.0.0';
const port = (process.env.PORT && parseInt(process.env.PORT)) || 3000;
const messagingHost = process.env.MESSAGING_HOST || "amqp://guest:guest@localhost:5672";

console.log("Host:      " + host);
console.log("Port:      " + port);
console.log("Messaging: " + messagingHost);

//
// Logging implementation.
//
class Log implements ILog {
    /**
     * Issue a warning.
     */
    warn(...args: any[]): void {
        console.warn(...args);
    }

    /**
     * Issue an information message.
     */
    info(...args: any[]): void {
        console.log(...args);
    }

    /**
     * Issue a verbose message.
     */
    verbose(...args: any[]): void {
        console.log(...args);
    }

    /**
     * Record an error message.
     */
    error(...args: any[]): void {
        console.error(...args);
    }

    /**
     * Record an exception that was thrown
     */
    exception(err: any, ...args: any[]): void {
        console.error("Exception:");
        console.error(err && err.stack || err);
        console.error(...args);
    }
}

const defaultConfig: IMicroServiceConfig = {

};

//
// Used to register an event handler to be setup after messaging system has started.
//
interface IEventHandler {
    eventName: string;
    eventHandler: EventHandlerFn<any>;
}

//
// Class that represents a particular microservice instance.
//
class MicroService implements IMicroService {

    //
    // RabbitMQ messaging connection.
    //
    private messagingConnection?: amqp.Connection;
    
    //
    // RabbitMQ messaging channel.
    //
    private messagingChannel?: amqp.Channel;

    //
    // Configuration for the microservice.
    //
    private config: IMicroServiceConfig;

    //
    // Event handlers that have been registered to be setup once
    // connection to message queue is established.
    ///
    private registeredEventHandlers: IEventHandler[] = [];

    constructor(config?: IMicroServiceConfig) {
        this.config = config || defaultConfig;
        this.expressApp = express();
        this.httpServer = new http.Server(this.expressApp);

        this.expressApp.use((req, res, next) => { //TODO: Only for testing! Remove this in prod.
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
            next();
        }); 
        
        // this.expressApp.use(bodyParser.urlencoded({ extended: false }));
        // this.expressApp.use(bodyParser.json());

        if (enableMorgan) {
            morganBody(this.expressApp, {
                noColors: true,
            });
        }
        
        this.expressApp.get("/is-alive", (req, res) => {
            res.json({ ok: true });
        });
    }

    //
    // Start the Express HTTP server.
    //
    private async startHttpServer(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.httpServer.listen(port, host, (err: any) => {
                if (err) {
                    reject(err);
                }
                else {
                    console.log(`Running on http://${port}:${host}`); //TODO: Need better logging.
                    resolve();
                }
            });
        });
    }
        
    //
    // Lazily start RabbitMQ messaging.
    //
    private async startMessaging(): Promise<void> {

        const initMessaging = async (): Promise<void> => {
            this.messagingConnection = await retry(async () => await amqp.connect(messagingHost), 10000, 1000);
        
            this.messagingConnection.on("error", err => {
                console.error("Error from message system.");
                console.error(err && err.stack || err);
            });

            this.messagingConnection.on("close", err => {
                this.messagingConnection = undefined;
                this.messagingChannel = undefined;
                console.log("Lost connection to rabbit, waiting for restart.");
                initMessaging()
                    .then(() => console.log("Restarted messaging."))
                    .catch(err => {
                        console.error("Failed to restart messaging.");
                        console.error(err && err.stack || err);
                    });
            });
            
            this.messagingChannel = await this.messagingConnection!.createChannel();

            for (const registeredEventHandler of this.registeredEventHandlers) {
                await this.internalOn(registeredEventHandler.eventName, registeredEventHandler.eventHandler);
            }
        }

        await initMessaging();
    
        //todo:
        // await connection.close();
    }

    /**
     * Returns true if the messaging system is currently available.
     */
    isMessagingAvailable(): boolean {
        return !!this.messagingConnection;
    }

    //
    // Internal message handler setup.
    //
    private async internalOn(eventName: string, eventHandler: EventHandlerFn<any>): Promise<void> {

        // http://www.squaremobius.net/amqp.node/channel_api.html#channel_assertExchange
        await this.messagingChannel!.assertExchange(eventName, "fanout", { durable: true });

        // http://www.squaremobius.net/amqp.node/channel_api.html#channel_assertQueue
        const queueName = (await this.messagingChannel!.assertQueue("", { durable: true, exclusive: true })).queue;
        console.log('binding queue', queueName, 'to', eventName);
        this.messagingChannel!.bindQueue(queueName, eventName, "");

        const messagingChannel = this.messagingChannel!;

        async function consumeCallback(msg: amqp.Message): Promise<void> {
            console.log("Handling " + eventName); //TODO: Logging.

            const args = JSON.parse(msg.content.toString())
            console.log(args); //TODO:

            const eventResponse: IEventResponse = {
                async ack(): Promise<void> {
                    messagingChannel.ack(msg);
                }
            }

            await eventHandler(args, eventResponse);

            console.log(eventName + " handler done."); //todo:
        };

        console.log("Receiving events on queue " + eventName); //todo:

        // http://www.squaremobius.net/amqp.node/channel_api.html#channel_consume   
        this.messagingChannel!.consume(
            queueName, 
            asyncHandler(this, "ASYNC: " + eventName, consumeCallback),
            {
                noAck: false,
            }
        );
    }
    
    /**
     * Create a handler for a named incoming event.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to handle.
     * @param eventHandler Callback to be invoke when the incoming event is received.
     */
    async on<EventArgsT = any>(eventName: string, eventHandler: EventHandlerFn<EventArgsT>): Promise<void> {
        
        this.registeredEventHandlers.push({
            eventName: eventName,
            eventHandler: eventHandler,
        });

        if (this.messagingConnection) {
            //
            // Message system already started.
            //
            await this.internalOn(eventName, eventHandler);
        }
    }

    /**
     * Emit a named outgoing event.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to emit.
     * @param eventArgs Event args to publish with the event and be received at the other end.
     */
    async emit<EventArgsT = any>(eventName: string, eventArgs: EventArgsT): Promise<void> {
        if (!this.messagingConnection) {
            throw new Error("Messaging system currently unavailable.");
        }

        // http://www.squaremobius.net/amqp.node/channel_api.html#channel_assertExchange
        await this.messagingChannel!.assertExchange(eventName, "fanout", { durable: true, });

        console.log('sendMessage:'); //TODO: Logging.
        console.log("    " + eventName);
        console.log(eventArgs);

        // http://www.squaremobius.net/amqp.node/channel_api.html#channel_publish
        this.messagingChannel!.publish(
            eventName, 
            '', 
            new Buffer(JSON.stringify(eventArgs)),
            {
                persistent: true,
            }
        ); //TODO: Probably a more efficient way to do this! Maybe BSON?
    }

    /**
     * Create a handler for incoming HTTP GET requests.
     * Implemented by Express under the hood.
     */
    get(route: string, requestHandler: GetRequestHandlerFn): void {
        this.expressApp.get(route, (req: express.Request, res: express.Response) => {
            console.log("Handling GET", route); //TODO: Proper optional logging.
            console.log(req.query);

            requestHandler(req, res)
                .then(() => {
                    console.log(`HTTP GET handler for ${route} finished.`);
                })
                .catch(err => {
                    console.error("Error from handler: HTTP GET " + route);
                    console.error(err && err.stack || err);

                    res.sendStatus(500);
                });
        });
    }

    //
    // POST request stub
    //
    post(route: string, requestHandler: PostRequestHandlerFn): void {
        this.expressApp.post(route, (req: express.Request, res: express.Response) => {
            console.log("Handling POST", route);
            console.log(req.query);

            requestHandler(req, res)
                .then(() => {
                    console.log(`HTTP POST handler for ${route} finished.`);
                })
                .catch(err => {
                    console.error("Error from handler: HTTP POST " + route);
                    console.error(err && err.stack || err);

                    res.sendStatus(500);
                });
        });
    }

    //
    // Create a full URL for a service request mapping the service name to host name if necessary.
    //
    makeFullUrl(serviceName: string, route: string) {
        return "http://" + serviceName + route;
    }
    
    /**
     * Make a request to another service.
     * 
     * @param serviceName The name (logical or host) of the service.
     * @param route The HTTP route on the service to make the request to.
     * @param params Query parameters for the request.
     */
    async request(serviceName: string, route: string, params?: any): Promise<any> {
        let fullUrl = this.makeFullUrl(serviceName, route);
        if (params) {
            const paramKeys = Object.keys(params);
            let firstKey = true;
            for (let keyIndex = 0; keyIndex < paramKeys.length; ++keyIndex) {
                const key = paramKeys[keyIndex];
                const value = params[key];
                if (value !== undefined) {
                    fullUrl += firstKey ? "?" : "&"
                    fullUrl += key + "=" + value;
                    firstKey = false;
                }
            }
        }

        console.log("<< " + fullUrl); //TODO:

        return await requestPromise(fullUrl, { json: true });
    }

    /**
     * Forward HTTP get request to another named service.
     * The response from the forward requests is automatically piped into the passed in response.
     * 
     * @param serviceName The name of the service to forward the request to.
     * @param route The HTTP GET route to forward to.
     * @param params Query parameters for the request.
     * @param toResponse The stream to pipe response to.
     */
    forwardRequest(serviceName: string, route: string, params: any, toResponse: express.Response): void { //TODO: Get rid of this version.
        let fullUrl = this.makeFullUrl(serviceName, route);
        const paramKeys = Object.keys(params);
        let firstKey = true;
        for (let keyIndex = 0; keyIndex < paramKeys.length; ++keyIndex) {
            const key = paramKeys[keyIndex];
            const value = params[key];
            if (value) {
                fullUrl += firstKey ? "?" : "&"
                fullUrl += key + "=" + value;
                firstKey = false;
            }
        }

        console.log(">> " + fullUrl); //TODO:

        request(fullUrl).pipe(toResponse);
    }

    /**
     * Forward HTTP get request to another named service.
     * The response from the forward requests is automatically piped into the passed in response.
     * 
     * @param serviceName The name of the service to forward the request to.
     * @param route The HTTP GET route to forward to.
     * @param params Query parameters for the request.
     * @param res The stream to pipe response to.
     */
    forwardRequest2(serviceName: string, route: string, params: any, req: express.Request, res: express.Response): void {
        let fullUrl = this.makeFullUrl(serviceName, route);
        const paramKeys = Object.keys(params);
        let firstKey = true;
        for (let keyIndex = 0; keyIndex < paramKeys.length; ++keyIndex) {
            const key = paramKeys[keyIndex];
            const value = params[key];
            if (value) {
                fullUrl += firstKey ? "?" : "&"
                fullUrl += key + "=" + value;
                firstKey = false;
            }
        }

        console.log(">> " + fullUrl); //TODO:

        req.pipe(request(fullUrl)).pipe(res);
    }
    

    /**
     * Setup serving of static files.
     * 
     * @param dirPath The path to the directory that contains static files.
     */
    static(dirPath: string): void {
        console.log("Serving static files from " + dirPath);
        this.expressApp.use(express.static(dirPath));
    }

    /**
     * Reference to the logging interface.
     * This allows the logging from multiple microservices to be aggregated.
     */
    readonly log: ILog = new Log();


    /**
     * Reference to the timer interface.
     * Allows code to be timed for performance.
     */
    readonly timer: ITimer = {
        start: (timerName: string): void => {
            // Just a stub for the moment.
        },

        stop: (timerName: string): void => {
            // Just a stub for the moment.
        },
    };

    /**
     * Reference to the metrics interface.
     * Allows a service to output metrics.
     */
    readonly metrics: IMetrics = {
        discrete: (name: string, value: number): void => {
            // Just a stub for the moment.
        },

        continuous: (name: string, value: number): void => {
            // Just a stub for the moment.
        },
    }; 

    /**
     * Reference to the express object.
     */
    readonly expressApp: express.Express;

    /**
     * Reference to the HTTP server.
     */
    readonly httpServer: http.Server;
    
    /**
     * Starts the microservice.
     * It starts listening for incoming HTTP requests and events.
     */
    async start(): Promise<void> {
        await this.startHttpServer();

        await this.startMessaging(); //TODO: Would be good to optionally enable this.
    }
}

/**
 * Instantiates a microservice.
 * 
 * @param [config] Optional configuration for the microservice.
 */
export function micro(config?: IMicroServiceConfig): IMicroService {
    return new MicroService(config);
}