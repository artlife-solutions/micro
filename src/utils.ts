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