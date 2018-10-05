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
export interface IHttpGetRequest<RequestBodyT> {

}

/**
 * Interface that represents a HTTP GET request.
 */
export interface IHttpGetResponse<ResponseT> {

    /**
     * Send JSON data in response to a HTTP get request.
     */
    json(data: any): Promise<void>;
}

/**
 * Defines a potentially asynchronous callback function for handling an incoming HTTP GET request.
 */
export type GetRequestHandlerFn<RequestBodyT, ResponseT> = (request: IHttpGetRequest<RequestBodyT>, response: IHttpGetResponse<ResponseT>) => Promise<void>;

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
    on<EventArgsT>(eventName: string, eventHandler: EventHandlerFn<EventArgsT>): void;

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
    get<RequestBodyT, OutgoingT>(route: string, requestHandler: GetRequestHandlerFn<RequestBodyT, OutgoingT>): void;

    /**
     * Forward HTTP get request to another named service.
     * The response from the forward requests is automatically piped into the passed in response.
     * 
     * @param serviceName The name of the service to forward the request to.
     * @param route The HTTP GET route to forward to.
     * @param body The body of the forwarded request.
     * @param response The response for the HTTP GET current request, to have the response forwarded to.
     */
    forwardRequest<RequestBodyT, ResponseT>(serviceName: string, route: string, body: RequestBodyT, response: IHttpGetResponse<ResponseT>): void;

    /**
     * Starts the microservice.
     * It starts listening for incoming HTTP requests and events.
     */
    start(): Promise<void>;

}

const defaultConfig: IMicroServiceConfig = {

};

//
// Class that represents a particular microservice instance.
//
class MicroService implements IMicroService {

    //
    // Configuration for the microservice.
    //
    config: IMicroServiceConfig;

    constructor(config?: IMicroServiceConfig) {
        this.config = config || defaultConfig;
    }

    /**
     * Create a handler for a named incoming event.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to handle.
     * @param eventHandler Callback to be invoke when the incoming event is received.
     */
    on<EventArgsT>(eventName: string, eventHandler: EventHandlerFn<EventArgsT>): void {
        throw new Error("Not implemented yet");
    }

    /**
     * Emit a named outgoing event.
     * Implemented by Rabbitmq under the hood for reliable messaging.
     * 
     * @param eventName The name of the event to emit.
     * @param eventArgs Event args to publish with the event and be received at the other end.
     */
    async emit<EventArgsT>(eventName: string, eventArgs: EventArgsT): Promise<void> {
        throw new Error("Not implemented yet");
    }
    /**
     * Create a handler for incoming HTTP GET requests.
     * Implemented by Express under the hood.
     */
    get<RequestBodyT, OutgoingT>(route: string, requestHandler: GetRequestHandlerFn<RequestBodyT, OutgoingT>): void {
        throw new Error("Not implemented yet");
    }

    /**
     * Forward HTTP get request to another named service.
     * The response from the forward requests is automatically piped into the passed in response.
     * 
     * @param serviceName The name of the service to forward the request to.
     * @param route The HTTP GET route to forward to.
     * @param body The body of the forwarded request.
     * @param response The response for the HTTP GET current request, to have the response forwarded to.
     */
    forwardRequest<RequestBodyT, ResponseT>(serviceName: string, route: string, body: RequestBodyT, response: IHttpGetResponse<ResponseT>): void {
        throw new Error("Not implemented yet");
    }

    /**
     * Starts the microservice.
     * It starts listening for incoming HTTP requests and events.
     */
    async start(): Promise<void> {
        throw new Error("Not implemented yet");
    }
}

/**
 * Instantiates a microservice.
 * 
 * @param [config] Optional configuration for the microservice.
 */
export default function micro(config?: IMicroServiceConfig): IMicroService {
    return new MicroService(config);
}