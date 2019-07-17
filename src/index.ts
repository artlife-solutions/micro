//
// Shared microservices framework.
//

import * as express from 'express';
import { Express } from 'express';
import * as amqp from 'amqplib';
import { argv } from 'yargs';
import * as request from 'request';
import * as requestPromise from 'request-promise';
import { readJsonFile } from './file';
import { asyncHandler, retry } from './utils';
//import * as bodyParser from 'body-parser'
import { reject, resolve } from 'bluebird';

import {
    ILog,
    IMicroServiceConfig,
    IMicroService,
    IExchangeConfig,
    StringMap,
    IEventResponse,
    EventHandlerFn,
    GetRequestHandlerFn,
    PostRequestHandlerFn
} from './index.d'

const host = argv.host || process.env.HOST || '0.0.0.0';
const port = argv.port || process.env.PORT || 3000;
const messagingHost = argv.message_host || process.env.MESSAGING_HOST || "amqp://guest:guest@localhost:5672";

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

const defaultExchange: IExchangeConfig = {
    name: 'exchange',
    type: 'topic',
    routes: [ '#' ],
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
    // Maps services to host name.
    //
    private serviceMap: StringMap = {};

    constructor(config?: IMicroServiceConfig) {
        this.config = config || defaultConfig;
        this.expressApp = express();

        this.expressApp.use((req, res, next) => { //TODO: Only for testing! Remove this in prod.
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
            next();
        }); 
        
        // this.expressApp.use(bodyParser.urlencoded({ extended: false }));
        // this.expressApp.use(bodyParser.json());
        
        this.expressApp.get("/is-alive", (req, res) => {
            res.json({ ok: true });
        });
    }

    //
    // Start the Express HTTP server.
    //
    private async startHttpServer(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            // @ts-ignore
            this.expressApp.listen(port, host, (err: any) => {
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
        if (!this.messagingChannel) {
            console.log("Lazily initiating messaging system."); //todo:
            this.messagingConnection = await retry(async () => await amqp.connect(messagingHost), 3, 1000);
            this.messagingChannel = await this.messagingConnection!.createChannel();
        
            //todo:
            // await connection.close();
        }
        
    }

    /**
     * Create a handler for a named incoming event.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to handle.
     * @param eventHandler Callback to be invoke when the incoming event is received.
     */
    async on<EventArgsT>(eventName: string, eventHandler: EventHandlerFn<EventArgsT>): Promise<void> {
        await this.startMessaging();
        await this.messagingChannel!.assertExchange(eventName, 'fanout');
        const queueName = (await this.messagingChannel!.assertQueue('')).queue;
        this.messagingChannel!.bindQueue(queueName, eventName, '');

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

        console.log("Recieving events on queue " + eventName); //todo:

        this.messagingChannel!.consume(eventName, asyncHandler(this, consumeCallback));
    }

    /**
     * Emit a named outgoing event.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to emit.
     * @param eventArgs Event args to publish with the event and be received at the other end.
     */
    async emit<EventArgsT>(eventName: string, eventArgs: EventArgsT): Promise<void> {
        await this.startMessaging();
        await this.messagingChannel!.assertExchange(eventName, 'fanout');

        console.log('sendMessage:'); //TODO: Logging.
        console.log("    " + eventName);
        console.log(eventArgs);
        this.messagingChannel!.publish(eventName, '', new Buffer(JSON.stringify(eventArgs))); //TODO: Probably a more efficient way to do this! Maybe BSON?
    }

    /**
     * Create a handler for listening to broadcasted messages on (optional) routes.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to emit.
     * @param exchangeConfig Exchange settings to broadcast to.
     * @param eventHandler Callback to be invoke when the incoming event is received.
     */
    async listen<EventArgsT>(eventName: string, exchangeConfig: IExchangeConfig, eventHandler: EventHandlerFn<EventArgsT>): Promise<void> {
        const exchange: IExchangeConfig = {
            name: eventName,
            type: exchangeConfig.type || defaultExchange.type,
            routes: exchangeConfig.routes || defaultExchange.routes,
        };

        await this.startMessaging();
        this.messagingChannel!.assertExchange(exchange.name, exchange.type);
        const queueName = (await this.messagingChannel!.assertQueue('')).queue;
        await Promise.all(exchange.routes.map(route => this.messagingChannel!.bindQueue(queueName, eventName, route)));

        const messagingChannel = this.messagingChannel!;

        async function consumeCallback(msg: amqp.Message): Promise<void> {
            console.log("Handling " + exchange.name); //TODO: Logging.

            const args = JSON.parse(msg.content.toString())
            console.log(args); //TODO:

            const eventResponse: IEventResponse = {
                async ack(): Promise<void> {
                    messagingChannel.ack(msg);
                }
            }

            await eventHandler(args, eventResponse);

            console.log(exchange.name + " handler done."); //todo:
        };

        console.log(`Recieving events on ${exchange.name}:${exchange.type} - ${exchange.routes}`); //todo:

        this.messagingChannel!.consume(exchange.name, asyncHandler(this, consumeCallback));
    }

    /**
     * Emit a named outgoing event to a configurable exchange.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName Name of event to emit
     * @param eventArgs Event args to publish with the event and be received at the other end.
     * @param exchangeConfig Exchange settings to broadcast to.
     */
    async broadcast<EventArgsT>(eventName: string, eventArgs: EventArgsT, exchangeConfig: IExchangeConfig): Promise<void> {
        await this.startMessaging();
        const exchange: IExchangeConfig = {
            name: eventName,
            type: exchangeConfig.type || defaultExchange.type,
            routes: exchangeConfig.routes || defaultExchange.routes,
        };
        await this.messagingChannel!.assertExchange(exchange.name, exchange.type);

        exchange.routes.forEach(route => {
            console.log(`sendMessage to ${exchange.name}:${exchange.type}-${route}`);
            console.log(eventArgs);
            this.messagingChannel!.publish(exchange.name, route, new Buffer(JSON.stringify(eventArgs))); //TODO: Probably a more efficient way to do this! Maybe BSON?    
        });
         //TODO: Logging.
    }

    /**
     * Create a handler for incoming HTTP GET requests.
     * Implemented by Express under the hood.
     */
    get(route: string, requestHandler: GetRequestHandlerFn): void {
        this.expressApp.get(route, asyncHandler(this, async (req: express.Request, res: express.Response) => {
            console.log("Handling GET", route); //TODO: Proper optional logging.
            console.log(req.query);

            await requestHandler(req, res);

            console.log(route, "GET handler done.")
        }));
    }

    //
    // POST request stub
    //
    post(route: string, requestHandler: PostRequestHandlerFn): void {
        this.expressApp.post(route, asyncHandler(this, async (req: express.Request, res: express.Response) => {
            console.log("Handling POST", route);
            console.log(req.query);
            console.log("POST has not been implemented yet");
        }));
    }

    //
    // Create a full URL for a service request mapping the service name to host name if necessary.
    //
    makeFullUrl(serviceName: string, route: string) {
        const hostName = this.serviceMap[serviceName] || "http://" + serviceName;
        return hostName + route;
    }
    
    /**
     * Make a request to another service.
     * 
     * @param serviceName The name (logical or host) of the service.
     * @param route The HTTP route on the service to make the request to.
     * @param params Query parameters for the request.
     */
    async request(serviceName: string, route: string, params?: any) {
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
    forwardRequest(serviceName: string, route: string, params: any, toResponse: express.Response): void {
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

        const expressResponse = (toResponse as any).expressResponse as express.Response;
        request(fullUrl).pipe(expressResponse);
    }

    /**
     * Setup serving of static files.
     * 
     * @param dirPath The path to the directory that contains static files.
     */
    static(dirPath: string): void {
        this.expressApp.use(express.static(dirPath));
    }

    /**
     * Reference to the logging interface.
     * This allows the logging from multiple microservices to be aggregated.
     */
    readonly log: ILog = new Log();

    /**
     * Reference to the express object.
     */
    readonly expressApp: express.Express;
    
    /**
     * Starts the microservice.
     * It starts listening for incoming HTTP requests and events.
     */
    async start(): Promise<void> {
        if (argv.serviceMap) {
            // @ts-ignore
            this.serviceMap = await readJsonFile(argv.serviceMap);
        }

        await this.startHttpServer();
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