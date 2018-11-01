import { assert } from "chai";

//
// Various utility functions.
//

//
// Sleep for the specified amount of time.
//
export async function sleep(timeMS: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        setTimeout(() => {
            resolve();
        }, timeMS);
    });
}

//
// A function that adapts an async handler to work with react.
//
export function asyncHandler<SelfT> (self: SelfT, handler: Function) {
    return (...args: any[]) => {
        return handler.apply(self, args)
            .catch((err: any) => {
                console.error("Error in handler."); //TODO: Handle logging.
                console.error(err && err.stack || err);
            });
    };
}

//
// Retry a failing operation a number of times.
//
export async function retry<ReturnT>(operation: () => Promise<ReturnT>, maxAttempts: number): Promise<ReturnT> {
    let lastError: any | undefined;

    while (maxAttempts-- > 0) {
        try {
            const result = await operation();
            return result;
        }
        catch (err) {
            lastError = err;
        }
    }

    assert(lastError, "Expected there to be an error!");

    throw lastError;
}