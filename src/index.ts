//
// Shared microservices framework.
//

import * as express from 'express';
import { Express } from 'express';
import * as amqp from 'amqplib/callback_api';
import { argv } from 'yargs';
import * as request from 'request';
import * as requestPromise from 'request-promise';
import { readJsonFile } from './file';
import { asyncHandler } from './utils';

const host = argv.host || process.env.HOST || '0.0.0.0';
const port = argv.port || process.env.PORT || 3000;
const messagingHost = argv.message_host || process.env.MESSAGING_HOST || "amqp://guest:guest@localhost:5672";

/**
 * Configures a microservice.
 */
export interface IMicroServiceConfig {

};

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
 * Interface that represents a HTTP GET request.
 */
export interface IHttpRequest <RequestBodyT> {

}

/**
 * Interface that represents a HTTP GET request.
 */
export interface IHttpResponse<ResponseT> {

    /**
     * Send JSON data in response to a HTTP get request.
     */
    json(data: ResponseT): void;
}

/**
 * Defines a potentially asynchronous callback function for handling an incoming HTTP GET request.
 */
export type GetRequestHandlerFn<RequestBodyT, ResponseT> = (request: IHttpRequest<RequestBodyT>, response: IHttpResponse<ResponseT>) => Promise<void>;

/**
 * Interface that represents a particular microservice instance.
 */
export interface IMicroService {

    /**
     * Create a handler for a named incoming event.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to handle.
     * @param eventHandler Callback to be invoke when the incoming event is received.
     */
    on<EventArgsT>(eventName: string, eventHandler: EventHandlerFn<EventArgsT>): Promise<void>;

    /**
     * Emit a named outgoing event.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to emit.
     * @param eventArgs Event args to publish with the event and be received at the other end.
     */
    emit<EventArgsT>(eventName: string, eventArgs: EventArgsT): Promise<void>;

    /**
     * Create a handler for incoming HTTP GET requests.
     * Implemented by Express under the hood.
     */
    get<RequestBodyT, ResponseT>(route: string, requestHandler: GetRequestHandlerFn<RequestBodyT, ResponseT>): void;

    /**
     * Forward HTTP get request to another named service.
     * The response from the forward requests is automatically piped into the passed in response.
     * 
     * @param serviceName The name of the service to forward the request to.
     * @param route The HTTP GET route to forward to.
     * @param body The body of the forwarded request.
     * @param response The response for the HTTP GET current request, to have the response forwarded to.
     */
    forwardRequest<RequestBodyT, ResponseT>(serviceName: string, route: string, body: RequestBodyT, response: IHttpResponse<ResponseT>): void;

    /**
     * Setup serving of static files.
     * 
     * @param dirPath The path to the directory that contains static files.
     */
    static(dirPath: string): void;

    /**
     * Starts the microservice.
     * It starts listening for incoming HTTP requests and events.
     */
    start(): Promise<void>;

}

const defaultConfig: IMicroServiceConfig = {

};

interface StringMap {
    [index: string]: string;
}

//
// Class that represents a particular microservice instance.
//
class MicroService implements IMicroService {

    //
    // RabbitMQ messaging connection.
    //
    messagingConnection?: amqp.Connection;
    
    //
    // RabbitMQ messaging channel.
    //
    messagingChannel?: amqp.Channel;

    //
    // Express HTTP app.
    //
    private httpApp: Express;

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
        this.httpApp = express();

        this.httpApp.use((req, res, next) => { //TODO: Only for testing! Remove this in prod.
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
            next();
        }); 
        
        this.httpApp.get("/is-alive", (req, res) => {
            res.json({ ok: true });
        });
    }

    //
    // Start the Express HTTP server.
    //
    private async startHttpServer(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.httpApp.listen(port, host, (err: any) => {
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
    // Connect to RabbitMQ.
    //
    private async connectMessaging(): Promise<amqp.Connection> {
        return new Promise<amqp.Connection>((resolve, reject) => {
            amqp.connect(messagingHost, (err, connection) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(connection);
                }
            });
        });
    }

    //
    // Create a RabbitMQ messaging channel.
    //
    private async createMessagingChannel(): Promise<amqp.Channel> {
        return new Promise<amqp.Channel>((resolve, reject) => {
            this.messagingConnection!.createChannel((err, channel) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(channel);
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
            this.messagingConnection = await this.connectMessaging();
            this.messagingChannel = await this.createMessagingChannel();
        
            //todo:
            // await connection.close();
        }
        
    }

    //
    // Make sure a RabbitMQ queue exists before using it.
    //
    private async assertQueue(queueName: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            console.log("Starting message queue: " + queueName); //todo:
            this.messagingChannel!.assertQueue(queueName, {}, err => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            })
        });
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
        await this.assertQueue(eventName);

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
        await this.assertQueue(eventName);

        console.log('sendMessage:'); //TODO: Logging.
        console.log("    " + eventName);
        console.log(eventArgs);
        this.messagingChannel!.sendToQueue(eventName, new Buffer(JSON.stringify(eventArgs))); //TODO: Probably a more efficient way to do this! Maybe BSON?
    }
    /**
     * Create a handler for incoming HTTP GET requests.
     * Implemented by Express under the hood.
     */
    get<RequestBodyT, ResponseT>(route: string, requestHandler: GetRequestHandlerFn<RequestBodyT, ResponseT>): void {
        this.httpApp.get(route, asyncHandler(this, async (req: express.Request, res: express.Response) => {
            console.log("Handling " + route); //TODO: Proper optional logging.
            console.log(req.query);

            const request: IHttpRequest<RequestBodyT> = { //TODO: Make a proper class from this.
                //TODO:
            };

            const response: IHttpResponse<ResponseT> = {
                json(data: ResponseT): void {
                    res.json(data);
                }                
            };

            (response as any).expressResponse = res; // Hide the Express response so we can retreive it latyer.

            await requestHandler(req, res);

            console.log(route + " handler done.")
        }));
    }

    //
    // Create a full URL for a service request mapping the service name to host name if necessary.
    //
    makeFullUrl(serviceName: string, route: string) {
        const hostName = this.serviceMap[serviceName] || serviceName;
        return hostName + route;
    }
    
    /**
     * Make a request to another service.
     * 
     * @param serviceName The name (logical or host) of the service.
     * @param route The HTTP route on the service to make the request to.
     * @param params Query parameters for the request.
     */
    async request(serviceName: string, route: string, params: any) {
        let fullUrl = this.makeFullUrl(serviceName, route);
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
    forwardRequest<ResponseT>(serviceName: string, route: string, params: any, toResponse: IHttpResponse<ResponseT>): void {
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
        this.httpApp.use(express.static(dirPath));
    }

    /**
     * Starts the microservice.
     * It starts listening for incoming HTTP requests and events.
     */
    async start(): Promise<void> {
        if (argv.serviceMap) {
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