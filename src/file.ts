import * as fs from 'fs';

export async function readFile(filePath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        fs.readFile(filePath, "utf8", (err: any, data: string) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(data);
            }
        });
    });
}

export async function readJsonFile(filePath: string): Promise<any> {
    const data = await readFile(filePath);
    return JSON.parse(data);
}
