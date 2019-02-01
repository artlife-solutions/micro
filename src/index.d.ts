import * as express from 'express';

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
 * Configures a microservice.
 */
export interface IMicroServiceConfig {

}

/**
 * Defines settings for an exchange
 */
export interface IExchangeConfig {

    /**
     * Name of exchange
     */
    name: string;

    /**
     * Type of exchange
     */
    type: string;

    /**
     * Routes to publish/listen to
     */
    routes: string[];
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
     * Create a handler for a named incoming event from a direct queue.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to handle.
     * @param eventHandler Callback to be invoke when the incoming event is received.
     * @param exchangeConfig Settings for exchange to listen on.
     */
    on<EventArgsT>(eventName: string, eventHandler: EventHandlerFn<EventArgsT>, exchangeConfig?: IExchangeConfig): Promise<void>;

    /**
     * Emit a named outgoing event.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to emit.
     * @param eventArgs Event args to publish with the event and be received at the other end.
     * @param exchangeConfig Settings for exchange to listen on.
     */
    emit<EventArgsT>(eventName: string, eventArgs: EventArgsT, exchangeConfig?: IExchangeConfig): Promise<void>;

    /**
     * Create a handler for listening to broadcasted messages on (optional) routes.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to emit.
     * @param exchangeConfig Exchange settings to broadcast to.
     * @param eventHandler Callback to be invoke when the incoming event is received.
     */
    listen<EventArgsT>(eventName: string, exchangeConfig: IExchangeConfig | null, eventHandler: EventHandlerFn<EventArgsT>): Promise<void>;

    /**
     * Emit a named outgoing event to an exchange on (optional) routes.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to emit.
     * @param exchangeConfig Exchange settings to broadcast to.
     * @param eventArgs Event args to publish with the event and be received at the other end.
     */
    broadcast<EventArgsT>(eventName: String, eventArgs: EventArgsT, exchangeConfig: IExchangeConfig): Promise<void>;

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
     * Reference to the express object.
     */
    readonly expressApp: express.Express;

    /**
     * Starts the microservice.
     * It starts listening for incoming HTTP requests and events.
     */
    start(): Promise<void>;

}

interface StringMap {
    [index: string]: string;
}