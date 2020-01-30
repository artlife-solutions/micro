//
// Shared microservices framework.
//

import * as express from 'express';
import * as amqp from 'amqplib';
import axios from "axios";
import * as request from 'request';
import * as requestPromise from 'request-promise';
import { asyncHandler, retry, sleep, verifyBodyParam, verifyQueryParam } from './utils';
export { asyncHandler, retry, sleep, verifyBodyParam, verifyQueryParam };
const morganBody = require('morgan-body');
import * as http from 'http';
import * as bodyParser from 'body-parser';
import uuid = require('uuid');

const inProduction = process.env.NODE_ENV === "production";
const enableMorgan = !inProduction || process.env.ENABLE_MORGAN === "true";

process.on('exit', code => {
    if (code === 0) {
        console.log(`Process exited with code: ${code}`);
    }
    else {
        console.error(`Process exited with error code: ${code}`);
    }
});

process.on('uncaughtException', err => {
    console.error(`Uncaught exception: ${err && err.stack || err}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled promise rejection at:', reason.stack || reason)
    process.exit(1);
});

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

    /**
     * The name that identifies the service.
     */
    serviceName: string;

    /**
     * Enable verbose logging from micro.
     */
    verbose?: boolean;

    /**
     * Host to run the REST API.
     */
    host?: string;

    /**
     * Port to run the REST API.
     */
    port?: number;

    /**
     * Defines the connection to the RabbitMQ server.
     */
    messagingHost?: string;

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

//
// Interface that represents a register event binding and allows it to unregistered.
//
export interface IEventHandler {
}

/**
 * Defines a potentially asynchronous callback function for handling an incoming event.
 */
export type EventHandlerFn<EventArgsT> = (eventArgs: EventArgsT, response: IEventResponse) => Promise<void>;

/**
 * Defines a potentially asynchronous callback function for handling an incoming HTTP GET request.
 */
export type RequestHandlerFn = (request: express.Request, response: express.Response) => Promise<void>;

/**
 * Interface for defining HTTP routes on a REST API.
 */
export interface IHttpServer {

    /**
     * Create a handler for incoming HTTP GET requests.
     * Implemented by Express under the hood.
     */
    get(route: string, requestHandler: RequestHandlerFn): void;

    /**
     * Create a handler for incoming HTTP POST requests.
     * Implemented by Express under the hood
     * 
     * @param route 
     * @param requestHandler 
     */
    post(route: string, requestHandler: RequestHandlerFn): void;

    /**
     * Create a handler for incoming HTTP PUT requests.
     * Implemented by Express under the hood
     * 
     * @param route 
     * @param requestHandler 
     */
    put(route: string, requestHandler: RequestHandlerFn): void;

    /**
     * Setup serving of static files.
     * 
     * @param dirPath The path to the directory that contains static files.
     */
    static(dirPath: string): void;
}

/**
 * Interface for issuing HTTP requests to a REST API.
 */
export interface IHttpRequest {

    /**
     * Make a HTTP get request to another service.
     * 
     * @param serviceName The name (logical or host) of the service.
     * @param route The HTTP route on the service to make the request to.
     * @param params Query parameters for the request.
     */
    get<T = any>(serviceName: string, route: string, body?: any): Promise<T>;

    /**
     * Make a HTTP get request to another service.
     * 
     * @param serviceName The name (logical or host) of the service.
     * @param route The HTTP route on the service to make the request to.
     * @param params Query parameters for the request.
     */
    post<T = void>(serviceName: string, route: string, body: any): Promise<T>;

    /**
     * Forward HTTP get request to another named service.
     * The response from the forward requests is automatically piped into the passed in response.
     * 
     * @param serviceName The name of the service to forward the request to.
     * @param route The HTTP GET route to forward to.
     * @param params Query parameters for the request.
     * @param res The stream to pipe response to.
     */
    forward(serviceName: string, route: string, req: express.Request, res: express.Response): void;

}

/**
 * Interface that represents a particular microservice instance.
 */
export interface IMicroService {

    /**
     * Get the name that identifies the service.
     */
    getServiceName(): string;

    /**
     * Get the instance ID for the particular instance of the service.
     */
    getInstanceId(): string;

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
    on<EventArgsT = any>(eventName: string, eventHandlerFn: EventHandlerFn<EventArgsT>): Promise<IEventHandler>;

    /**
     * Unregister a previously register event handler.
     * 
     * @param eventHandler The event handler to unregister.
     */
    off(eventHandler: IEventHandler): void;

    /**
     * Create a once-off handler for a named incoming event.
     * The event handler will only be invoke once before the event is unregistered.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to handle.
     * @param eventHandler Callback to be invoke when the incoming event is received.
     */
    once<EventArgsT = any>(eventName: string, eventHandlerFn: EventHandlerFn<EventArgsT>): Promise<void>;

    /***
     * Wait for a single incoming event, returns the events arguments and then unregister the event handler.
     * 
     * @param eventName The name of the event to handle.
     * 
     * @returns A promise to resolve the incoming event's arguments.
     */
    waitForOneEvent<EventArgsT = any>(eventName: string): Promise<EventArgsT>;

    /**
     * Emit a named outgoing event.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to emit.
     * @param eventArgs Event args to publish with the event and be received at the other end.
     */
    emit<EventArgsT = any>(eventName: string, eventArgs: EventArgsT): Promise<void>;

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
     * Interface for defining the REST API.
     */
    readonly rest: IHttpServer;

    /**
     * Interface for issuing HTTP requests to a REST API.
     */
    readonly request: IHttpRequest;

    /**
     * Starts the microservice.
     * It starts listening for incoming HTTP requests and events.
     */
    start(): Promise<void>;

    /**
     * Start the HTTP server.
     * ! No need to call this if you already called 'start'.
     */
    startHttpServer(): Promise<void>;

    /**
     * Start the RabbitMQ message queue.
     * ! No need to call this if you already called 'start'.
     */
    startMessaging(): Promise<void>;
}

//
// Used to register an event handler to be setup after messaging system has started.
//
class EventHandler implements IEventHandler {

    //
    // The name of the event.
    //
    eventName: string;

    //
    // The user-defined function that handles the event.
    //
    eventHandlerFn: EventHandlerFn<any>;

    //
    // Generated queue name after the queue is bound.
    //
    queueName?: string;

    constructor(eventName: string, eventHandlerFn: EventHandlerFn<any>) {
        this.eventName = eventName;
        this.eventHandlerFn = eventHandlerFn;
    }
}

//
// Class that represents a particular microservice instance.
//
export class MicroService implements IMicroService {

    //
    // The unique ID for the particular instance of the microservice.
    //
    private id: string = uuid.v4();

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
    private registeredEventHandlers = new Set<EventHandler>();

    constructor(config: IMicroServiceConfig) {
        this.config = Object.assign({}, config);
        this.expressApp = express();
        this.httpServer = new http.Server(this.expressApp);

        if (!inProduction) {
            this.expressApp.use((req, res, next) => {
                res.header("Access-Control-Allow-Origin", "*");
                res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
                next();
            });
        }

        this.expressApp.use(bodyParser.json());
        this.expressApp.use(bodyParser.urlencoded({ extended: true }));

        if (enableMorgan) {
            console.log("Enabling Morgan request tracing.");
            morganBody(this.expressApp, {
                noColors: true,
            });
        }

        this.expressApp.get("/is-alive", (req, res) => {
            res.json({ ok: true });
        });

        this.rest = {
            /**
             * Create a handler for incoming HTTP GET requests.
             * Implemented by Express under the hood.
             */
            get: (route: string, requestHandler: RequestHandlerFn): void => {
                this.expressApp.get(route, (req: express.Request, res: express.Response) => {
                    this.verbose("Handling GET " + route);

                    requestHandler(req, res)
                        .then(() => {
                            this.verbose(`HTTP GET handler for ${route} finished.`);
                        })
                        .catch(err => {
                            console.error("Error from handler: HTTP GET " + route);
                            console.error(err && err.stack || err);

                            res.sendStatus(500);
                        });
                });
            },

            /**
             * Create a handler for incoming HTTP POST requests.
             * Implemented by Express under the hood.
             */
            post: (route: string, requestHandler: RequestHandlerFn): void => {
                this.expressApp.post(route, (req: express.Request, res: express.Response) => {
                    this.verbose("Handling POST " + route);

                    requestHandler(req, res)
                        .then(() => {
                            this.verbose(`HTTP POST handler for ${route} finished.`);
                        })
                        .catch(err => {
                            console.error("Error from handler: HTTP POST " + route);
                            console.error(err && err.stack || err);

                            res.sendStatus(500);
                        });
                });
            },

            /**
             * Create a handler for incoming HTTP PUT requests.
             * Implemented by Express under the hood
             * 
             * @param route 
             * @param requestHandler 
             */
            put: (route: string, requestHandler: RequestHandlerFn): void => {
                this.expressApp.put(route, (req: express.Request, res: express.Response) => {
                    this.verbose("Handling PUT " + route);

                    requestHandler(req, res)
                        .then(() => {
                            this.verbose(`HTTP PUT handler for ${route} finished.`);
                        })
                        .catch(err => {
                            console.error("Error from handler: HTTP PUT " + route);
                            console.error(err && err.stack || err);

                            res.sendStatus(500);
                        });
                });
            },


            /**
             * Setup serving of static files.
             * 
             * @param dirPath The path to the directory that contains static files.
             */
            static: (dirPath: string): void => {
                console.log("Serving static files from " + dirPath);
                this.expressApp.use(express.static(dirPath));
            },

        };

        this.request = {

            /**
             * Make a HTTP get request to another service.
             * 
             * @param serviceName The name (logical or host) of the service.
             * @param route The HTTP route on the service to make the request to.
             * @param params Query parameters for the request.
             */
            get: async (serviceName: string, route: string, body?: any): Promise<any> => {
                const url = "http://" + serviceName + route;
                return await axios.get(url, body);
            },

            /**
             * Make a HTTP get request to another service.
             * 
             * @param serviceName The name (logical or host) of the service.
             * @param route The HTTP route on the service to make the request to.
             * @param params Query parameters for the request.
             */
            post: async (serviceName: string, route: string, body: any): Promise<any> => {
                const url = "http://" + serviceName + route;
                return await axios.post(url, body);
            },

            /**
             * Forward HTTP get request to another named service.
             * The response from the forward requests is automatically piped into the passed in response.
             * 
             * @param serviceName The name of the service to forward the request to.
             * @param route The HTTP GET route to forward to.
             * @param params Query parameters for the request.
             * @param res The stream to pipe response to.
             */
            forward(serviceName: string, route: string, req: express.Request, res: express.Response): void {
                const url = "http://" + serviceName + route;
                req.pipe(request(url)).pipe(res);
            }
        };
    }

    //
    // Helper method for verbose logging.
    //
    private verbose(msg: string): void {
        if (this.config.verbose) {
            console.log(msg);
        }
    }

    /**
     * Get the name that identifies the service.
     */
    getServiceName(): string {
        return this.config.serviceName;
    }

    /**
     * Get the instance ID for the particular instance of the service.
     */
    getInstanceId(): string {
        return this.id;
    }

    /**
     * Returns true if the messaging system is currently available.
     */
    isMessagingAvailable(): boolean {
        return !!this.messagingConnection;
    }

    //
    // Setup a RabbitMQ message handler.
    //
    private async internalOn(eventHandler: EventHandler): Promise<void> {

        const eventName = eventHandler.eventName;

        // http://www.squaremobius.net/amqp.node/channel_api.html#channel_assertExchange
        await this.messagingChannel!.assertExchange(eventName, "fanout", { durable: true });

        // http://www.squaremobius.net/amqp.node/channel_api.html#channel_assertQueue
        const queueName = (await this.messagingChannel!.assertQueue("", { durable: true, exclusive: true })).queue;
        eventHandler.queueName = queueName;

        this.messagingChannel!.bindQueue(queueName, eventName, "");

        const messagingChannel = this.messagingChannel!;

        this.verbose(`Bound queue ${queueName} to ${eventName}.`);

        const consumeCallback = async (msg: amqp.Message): Promise<void> => {
            this.verbose("Handling event " + eventName);

            const args = JSON.parse(msg.content.toString())

            const eventResponse: IEventResponse = {
                async ack(): Promise<void> {
                    messagingChannel.ack(msg);
                }
            }

            await eventHandler.eventHandlerFn(args, eventResponse);

            this.verbose(eventName + " handler done.");
        };

        // http://www.squaremobius.net/amqp.node/channel_api.html#channel_consume
        this.messagingChannel!.consume(
            queueName,
            asyncHandler(this, "ASYNC: " + eventName, consumeCallback),
            {
                noAck: false,
            }
        );

        this.verbose("Receiving events on queue " + eventName);
    }

    //
    // Unwind a RabbitMQ message handler.
    //
    private internalOff(eventHandler: EventHandler): void {
        this.messagingChannel!.unbindQueue(eventHandler.queueName!, eventHandler.eventName, "");
        delete eventHandler.queueName;
    }

    /**
     * Create an ongoing handler for a named incoming event.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to handle.
     * @param eventHandler Callback to be invoke when the incoming event is received.
     */
    async on<EventArgsT = any>(eventName: string, eventHandlerFn: EventHandlerFn<EventArgsT>): Promise<IEventHandler> {

        const eventHandler = new EventHandler(eventName, eventHandlerFn);
        this.registeredEventHandlers.add(eventHandler);

        if (this.messagingConnection) {
            //
            // Message system already started.
            //
            await this.internalOn(eventHandler);
        }

        return eventHandler;
    }

    /**
     * Unregister a previously register event handler.
     * 
     * @param handler The event handler to unregister.
     */
    off(handler: IEventHandler): void {
        const eventHandler = handler as EventHandler;
        if (this.messagingConnection) {
            this.internalOff(eventHandler);
        }

        this.registeredEventHandlers.delete(eventHandler);
    }

    /**
     * Create a once-off handler for a named incoming event.
     * The event handler will only be invoke once before the event is unregistered.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to handle.
     * @param eventHandler Callback to be invoke when the incoming event is received.
     */
    async once<EventArgsT = any>(eventName: string, eventHandlerFn: EventHandlerFn<EventArgsT>): Promise<void> {
        const eventHandler = await this.on<EventArgsT>(eventName, async (args, res) => { //TODO: Binding and unbinding queues could be quite expensive! Is there a better way to do this?
            this.off(eventHandler); // Unregister before we receive any more events.
            await eventHandlerFn(args, res); // Trigger user callback.
        });
    }

    /***
     * Wait for a single incoming event, returns the events arguments and then unregister the event handler.
     * 
     * @param eventName The name of the event to handle.
     * 
     * @returns A promise to resolve the incoming event's arguments.
     */
    waitForOneEvent<EventArgsT = any>(eventName: string): Promise<EventArgsT> {
        return new Promise<EventArgsT>((resolve) => { //TODO: Binding and unbinding queues could be quite expensive! Is there a better way to do this?
            this.once(eventName, async (args, res) => {
                res.ack(); // Ack the response.
                resolve(args); // Resolve event args through the promise.
            });
        });
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

        this.verbose("Sending message: " + eventName);
        this.verbose(JSON.stringify(eventArgs, null, 4));


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
     * Interface for defining the REST API.
     */
    readonly rest: IHttpServer;

    /**
     * Interface for issuing HTTP requests to a REST API.
     */
    readonly request: IHttpRequest;

    /**
     * Start the HTTP server.
     * ! No need to call this if you already called 'start'.
     */
    async startHttpServer(): Promise<void> {

        return new Promise<void>((resolve, reject) => {
            let host: string;
            if (this.config.host !== undefined) {
                host = this.config.host;
            }
            else {
                host = process.env.HOST || '0.0.0.0';
            }

            let port: number;
            if (this.config.port !== undefined) {
                port = this.config.port;
            }
            else {
                port = (process.env.PORT && parseInt(process.env.PORT)) || 3000;
            }

            this.httpServer.listen(port, host, (err: any) => {
                if (err) {
                    reject(err);
                }
                else {
                    this.verbose(`Running on http://${port}:${host}`);
                    resolve();
                }
            });
        });
    }

    /**
     * Start the RabbitMQ message queue.
     * ! No need to call this if you already called 'start'.
     */
    async startMessaging(): Promise<void> {

        const initMessaging = async (): Promise<void> => {
            let messagingHost: string;
            if (this.config.messagingHost) {
                messagingHost = this.config.messagingHost;
            }
            else {
                messagingHost = process.env.MESSAGING_HOST || "amqp://guest:guest@localhost:5672";
            }

            this.verbose("Connecting to messaging server at: " + messagingHost);

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

            for (const eventHandler of this.registeredEventHandlers.values()) {
                await this.internalOn(eventHandler);
            }
        }

        await initMessaging();

        //todo:
        // await connection.close();
    }

    /**
     * Starts the microservice.
     * It starts listening for incoming HTTP requests and events.
     */
    async start(): Promise<void> {
        await this.startHttpServer();
        await this.startMessaging();
    }
}

/**
 * Instantiates a microservice.
 * 
 * @param [config] Optional configuration for the microservice.
 */
export function micro(config: IMicroServiceConfig): IMicroService {
    return new MicroService(config);
}